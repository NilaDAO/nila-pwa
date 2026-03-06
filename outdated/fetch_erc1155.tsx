import type { Log, EventLog } from "ethers";

// Type guard: narrow Log | EventLog -> EventLog
function isEventLog(x: Log | EventLog): x is EventLog {
  return (x as EventLog).args !== undefined;
}

type TransferSingleArgs = {
  operator: string;
  from: string;
  to: string;
  id: bigint;
  value: bigint;
};

type TransferBatchArgs = {
  operator: string;
  from: string;
  to: string;
  ids: bigint[];
  values: bigint[];
};

async function fetch_owned_foodtokens(
  erc1155: any,            // ethers.Contract
  address: string,
  fromBlock: number,
  toBlock: number
): Promise<bigint[]> {
  const qtyById = new Map<bigint, bigint>();

  // --- inbound ---
  const inSingle = await erc1155.queryFilter(
    erc1155.filters.TransferSingle(null, null, address),
    fromBlock, toBlock
  );
  for (const log of inSingle) {
    if (!isEventLog(log)) continue;
    const { id, value } = log.args as unknown as TransferSingleArgs;
    qtyById.set(id, (qtyById.get(id) ?? 0n) + value);
  }

  const inBatch = await erc1155.queryFilter(
    erc1155.filters.TransferBatch(null, null, address),
    fromBlock, toBlock
  );
  for (const log of inBatch) {
    if (!isEventLog(log)) continue;
    const { ids, values } = log.args as unknown as TransferBatchArgs;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], v = values[i];
      qtyById.set(id, (qtyById.get(id) ?? 0n) + v);
    }
  }

  // --- outbound ---
  const outSingle = await erc1155.queryFilter(
    erc1155.filters.TransferSingle(null, address, null),
    fromBlock, toBlock
  );
  for (const log of outSingle) {
    if (!isEventLog(log)) continue;
    const { id, value } = log.args as unknown as TransferSingleArgs;
    qtyById.set(id, (qtyById.get(id) ?? 0n) - value);
  }

  const outBatch = await erc1155.queryFilter(
    erc1155.filters.TransferBatch(null, address, null),
    fromBlock, toBlock
  );
  for (const log of outBatch) {
    if (!isEventLog(log)) continue;
    const { ids, values } = log.args as unknown as TransferBatchArgs;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], v = values[i];
      qtyById.set(id, (qtyById.get(id) ?? 0n) - v);
    }
  }

  // keep only positive balances (candidates you actually own)
  return [...qtyById.entries()]
    .filter(([, q]) => q > 0n)
    .map(([id]) => id);
}

export default fetch_owned_foodtokens