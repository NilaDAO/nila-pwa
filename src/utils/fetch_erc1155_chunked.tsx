import { ethers } from "ethers";

// Example: ERC1155 TransferSingle and TransferBatch topics
const TRANSFER_SINGLE =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TRANSFER_BATCH  =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

type LogFetcherOpts = {
  provider: ethers.Provider;
  contract: string;
  toAddr?: string;            // filter "to" address if you want
  latest: number;
  savedCursor?: number;       // your "1155-latestblock"
  deployBlock?: number;       // set to known contract creation block if you have it
  maxWindow?: number;         // default 2000
  maxRetries?: number;        // default 3
  minWindow?: number;         // shrink floor (default 10 for free RPC ranges)
};

const suggestedRange = (msg: string) => {
  const m = msg.match(/\[0x([0-9a-fA-F]+), 0x([0-9a-fA-F]+)\]/);
  if (!m) return undefined;
  const from = parseInt(m[1], 16);
  const to = parseInt(m[2], 16);
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined;
  const span = to - from + 1;
  return span > 0 ? span : undefined;
};

export async function fetchErc1155MintsChunked(opts: {
    basicprovider: ethers.Provider;
    contract: string;
    toAddr?: string;
    latest: number;
    savedCursor?: number;
    deployBlock?: number;
    maxWindow?: number;
    maxRetries?: number;
    minWindow?: number;
    onCheckpoint?: (processedToBlock: number) => Promise<void> | void;
  }): Promise<bigint[]> {
    const {
      basicprovider,
      contract,
      toAddr,
      latest,
      savedCursor,
      deployBlock = 0,
      maxWindow = 500,
      maxRetries = 3,
    } = opts;

  // 1) establish a sane starting point
  //    -1 so we don't re-query last saved block’s logs, adjust to your preference
  let from = Math.max(deployBlock, (savedCursor ?? (latest - maxWindow + 1)));
  from = Math.min(from, latest); // never ahead of latest

  const normalize = (n: number) => (n < 0 ? 0 : n);
  const minWindow = Math.max(1, opts.minWindow ?? 10);

  const ownedIds = new Set<bigint>();

  while (from <= latest) {
    let window = Math.max(minWindow, Math.min(maxWindow, 43_200)); // cap to ~1 day of Polygon blocks
    let ok = false;

    while (!ok && window >= minWindow) { // don’t shrink forever
      const to = Math.min(from + window - 1, latest);

      // topics: [eventSig, operator?, from?, to?] – ERC1155 indexes operator/from/to
      // If filtering by recipient:
      const toTopic = toAddr
        ? "0x000000000000000000000000" + toAddr?.slice(2).toLowerCase()
        : null;

      const filterSingle = {
        address: contract,
        fromBlock: ethers.toBeHex(normalize(from)),
        toBlock:   ethers.toBeHex(normalize(to)),
        topics: [TRANSFER_SINGLE, null, null, toTopic],
      };

      const filterBatch = {
        address: contract,
        fromBlock: ethers.toBeHex(normalize(from)),
        toBlock:   ethers.toBeHex(normalize(to)),
        topics: [TRANSFER_BATCH, null, null, toTopic],
      };

      try {
        // 2) fetch both single + batch in this chunk
        const [single, batch] = await Promise.all([
          basicprovider.getLogs(filterSingle),
          basicprovider.getLogs(filterBatch),
        ]);

        // 3) parse logs to collect token IDs that the address owns
        //    (you likely already have a parser; this just sketches the idea)
        for (const lg of single) {
          // ERC1155 TransferSingle data: id (uint256) and value (uint256) are in data
          // decode with iface if you prefer; quick parse:
          // data = 0x + 64-byte id + 64-byte value
          const data = lg.data.slice(2);
          const id = BigInt("0x" + data.slice(0, 64));
          const value = BigInt("0x" + data.slice(64, 128));
          if (value > 0n) ownedIds.add(id);
        }

        for (const lg of batch) {
          // TransferBatch packs arrays; better decode via iface
          // (left as comment since you already have your iface)
          // const parsed = iface.parseLog(lg);
          // parsed.args.ids.forEach((id: bigint, i: number) => {
          //   if (parsed.args.values[i] > 0n) ownedIds.add(id);
          // });
        }

        // 4) success -> advance cursor to the end of the chunk
        from = to + 1;
        ok = true;
        await opts.onCheckpoint?.(to);
        
      } catch (e: any) {
        const msg = String(e?.message || "");
        const hint = suggestedRange(msg);
        const isRateLimited =
          e?.code === -32090 || /rate limit/i.test(msg) || /too many requests/i.test(msg);

        // shrink the window on -32000 or “invalid block range” messages
        if (
          e?.code === -32000 ||
          e?.code === -32062 ||
          e?.code === -32600 ||
          /invalid block range/i.test(msg) ||
          /block range is too large/i.test(msg) ||
          /block range should work/i.test(msg) ||
          /Free tier plan/i.test(msg)
        ) {
          window = hint
            ? Math.max(minWindow, hint)
            : Math.max(minWindow, Math.floor(window / 2));
          continue;
        }

        // backoff on rate limits, then retry same window
        if (isRateLimited) {
          await new Promise(r => setTimeout(r, 10_000));
        }

        // transient? retry a few times with same window
        let retries = maxRetries;
        while (retries-- > 0) {
          await new Promise(r => setTimeout(r, 350 * (maxRetries - retries)));
          try {
            const [s, b] = await Promise.all([
              basicprovider.getLogs(filterSingle),
              basicprovider.getLogs(filterBatch),
            ]);
            // (parse as above)
            from = to + 1;
            ok = true;
            break;
          } catch {/* keep looping */}
        }
        if (!ok) throw e; // bubble if we can’t recover
      }
    }

    if (!ok) {
      // window shrank below threshold: bail with an actionable error
      throw new Error(
        "getLogs failed: provider rejects tiny windows; try another RPC or enable archival."
      );
    }
  }

  return Array.from(ownedIds);
}
