// Stellar hooks for the PWA (P2). Loaded only inside the Privy chunk, so the live build carries none of it.
// Names and keys follow the design (data/DataHooksRead.md, DataHooksWrite.md): useAccount, useSetupAccount.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Address, Asset, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { deployerOf, signerVal, unionEntry } from './account';
import { ethers } from 'ethers';
import { buildAccount, buildNinTrustline, getAccount, getStellarConfig, linkMessage, submitAccount, submitNinTrustline } from './api';
import { qk } from './keys';
import { invokeContract, isDeployed, readContract, sv } from './soroban';

export function useStellarConfig() {
  return useQuery({ queryKey: qk.stellar.config(), queryFn: getStellarConfig, staleTime: Infinity, retry: 2 });
}

const NIN_DECIMALS = 7;

/**
 * Her Stellar account: exists, nIN (balance, authorised; the asset and issuer from the node), sponsor.
 * Fresh 15 s. Not persisted yet (the app has no query persister). No USDC for members: they hold no
 * USDC trustline (R9, R11), and a balance of an unknown issuer is ignored.
 */
export function useAccount(address, smart) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: [...qk.stellar.account(address), smart || ''],
    enabled: !!cfg && !!address,
    staleTime: 15_000,
    queryFn: async () => {
      const a = await getAccount(cfg.horizon_url, address);
      if (!a) return { exists: false };
      // Smart accounts (26 Oct): her nIN is held by her account contract, a balance on the nIN asset contract (no
      // trustline); `deployed` tells whether the account exists yet.
      if (smart && smart !== address) {
        const deployed = await isDeployed(cfg, smart);
        const [bal, auth, union] = deployed ? await Promise.all([
          readContract(cfg, 'nin', 'balance', [sv.address(smart)]).catch(() => 0),
          readContract(cfg, 'nin', 'authorized', [sv.address(smart)]).catch(() => false),
          // The union her account named (member-owned accounts, 3 Nov); null until she names one. undefined: not read.
          readAccountUnion(cfg, smart).catch(() => undefined)]) : [0, false, null];
        return { exists: true, deployed, union, sponsor: a.sponsor || null,
          nin: { balance: Number(BigInt(bal ?? 0)) / 10 ** NIN_DECIMALS, authorized: !!auth }, decimals: NIN_DECIMALS };
      }
      const [code, issuer] = cfg.nin_asset.split(':');
      const nin = a.balances.find((b) => b.asset_code === code && b.asset_issuer === issuer);
      return {
        exists: true,
        sponsor: a.sponsor || null,
        nin: nin ? { balance: Number(nin.balance), authorized: !!nin.is_authorized } : null,
        decimals: NIN_DECIMALS,
      };
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The node's tx is exactly the sponsored account for her: checked before she signs. */
function checkAccountTx(tx, cfg, me) {
  const ops = tx.operations || [];
  const [code, issuer] = cfg.nin_asset.split(':');
  const ok = ops.length === 4
    && ops[0].type === 'beginSponsoringFutureReserves' && ops[0].sponsoredId === me
    && ops[1].type === 'createAccount' && ops[1].destination === me && Number(ops[1].startingBalance) === 0
    && ops[2].type === 'changeTrust' && ops[2].source === me && ops[2].line instanceof Asset
    && ops[2].line.getCode() === code && ops[2].line.getIssuer() === issuer
    && ops[3].type === 'endSponsoringFutureReserves' && ops[3].source === me
    && (!cfg.sponsor || tx.source === cfg.sponsor);
  if (!ok) throw new Error('the node sent a transaction that is not your sponsored account');
}

const hasNin = (account, cfg) => {
  const [code, issuer] = cfg.nin_asset.split(':');
  return !!account?.balances?.some((b) => b.asset_code === code && b.asset_issuer === issuer);
};

/** Her existing account without this network's nIN trustline (an account made before the nIN asset was replaced,
 *  e.g. a redeployed issuer; 22 Oct): the node's sponsored trustline, checked, signed with her key, submitted. */
async function addNinTrustline(cfg, me, signHash) {
  const { xdr } = await buildNinTrustline(me);
  const tx = TransactionBuilder.fromXDR(xdr, cfg.passphrase);
  const [code, issuer] = cfg.nin_asset.split(':');
  const ops = tx.operations || [];
  const ok = ops.length === 3 && (!cfg.sponsor || tx.source === cfg.sponsor)
    && ops[0].type === 'beginSponsoringFutureReserves' && ops[0].sponsoredId === me
    && ops[1].type === 'changeTrust' && ops[1].source === me && ops[1].line instanceof Asset
    && ops[1].line.getCode() === code && ops[1].line.getIssuer() === issuer
    && ops[2].type === 'endSponsoringFutureReserves' && ops[2].source === me;
  if (!ok) throw new Error('the node sent a transaction that is not your nIN trustline');
  tx.addSignature(me, btoa(String.fromCharCode(...(await signHash(tx.hash())))));
  const { hash } = await submitNinTrustline(tx.toXDR());
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    if (hasNin(await getAccount(cfg.horizon_url, me).catch(() => null), cfg)) return { hash, trustline: true };
  }
  throw new Error(`nIN trustline not on Stellar 60 s after ${hash}`);
}

/**
 * Her sponsored Stellar account with the nIN trustline only (R9), at login (R4) or at the move
 * (M1 step 1): the node builds it, she signs it with her Stellar key, her Polygon key signs the
 * wallet pair, the node's sponsor co-signs and submits. Safe to repeat: an existing account is a no-op, unless it lacks
 * this network's nIN trustline, which is then added (sponsored).
 */
/** Whether a plain account holds XLM for its own fees (4 Nov, no node fee-bump): leaders and ID-checked accounts (self
 *  mode, machine owners, LPs), which a node beat keeps topped up. An assist or keypad member holds none. */
export async function hasFeeXlm(cfg, address) {
  const a = await getAccount(cfg.horizon_url, address).catch(() => null);
  return Number(a?.balances?.find((b) => b.asset_type === 'native')?.balance || 0) >= 0.5;
}

/** Her smart account (26 Oct): made through the account deployer (one for all unions since 3 Nov; anyone may create an
 *  account; its address follows from her key). By her own Privy key's plain account only when it holds XLM for the fee
 *  (4 Nov): a new member holds none, and a leader's app makes her account when it scans her help QR (L14, L4;
 *  ensureMemberAccount). */
async function createSmartAccount(cfg, sender, account, signHash) {
  if (!account || account === sender || await isDeployed(cfg, account)) return;
  if (!(await hasFeeXlm(cfg, sender))) return;
  if (!deployerOf(cfg)) throw new Error('no account deployer in the node config');
  await invokeContract({ cfg, source: sender, signHash, contractName: 'account_deployer', fn: 'create',
    args: [signerVal(StrKey.decodeEd25519PublicKey(sender))] });
}

/** The union an account named (`account.union()`), or null while it has none (member-owned accounts, 3 Nov). */
export async function readAccountUnion(cfg, account) {
  return (await readContract(cfg, account, 'union', [])) || null;
}

/** Names her union on her own account (`account.set_union(union)`, signed by the account itself: her Privy key on a
 *  smartphone). Done once the union is known: at registration (R9), at a recovery that restores the union, or at the
 *  next start of a moved or prepared member. A no-op when the account already names this union. The account refuses
 *  it while frozen (recovery pending), in a leader session, or with a USDC lien. Sent by her own phone only when her
 *  plain account holds XLM for the fee (4 Nov); otherwise her help QR carries her signed set_union and the leader's app
 *  sends it (ensureMemberAccount). */
export async function setAccountUnion(cfg, sender, account, signHash, union) {
  if (!account || account === sender || !union) return false;
  if ((await readAccountUnion(cfg, account).catch(() => null)) === union) return false;
  if (!(await hasFeeXlm(cfg, sender))) return false;
  await invokeContract({ cfg, source: sender, account, signHash, contractName: account, fn: 'set_union', args: [sv.address(union)] });
  return true;
}

/** A member's account made by the leader's app (L14): created from the phone's first key (anyone may; the leader's
 *  own XLM pays the fee since 4 Nov), then the member's own signed `set_union` is submitted (`m.set_union`: { union?,
 *  nonce, exp, sig }, hex): a keypad's from F9 or its kind 4 help QR (P-256 device key, 65 bytes), a smartphone's from
 *  its kind 5 help QR (Privy key, Ed25519, 32 bytes; 4 Nov). Without that signature the account stays without a union
 *  (no session, no recovery) until the member sends one. Returns { deployed, union }. */
export async function ensureKeypadAccount(cfg, s, m) {
  if (!(await isDeployed(cfg, m.account))) {
    if (!deployerOf(cfg)) throw new Error('no account deployer in the node config');
    const hex = m.first_signer || m.signer;
    await invokeContract({ cfg, source: s.senderAddress, signHash: s.signHash, contractName: 'account_deployer', fn: 'create',
      // The account's address follows from the member's first phone key (26 Oct): it is created with that key.
      args: [signerVal(Uint8Array.from(hex.match(/../g).map((x) => parseInt(x, 16))))] });
  }
  let union = await readAccountUnion(cfg, m.account).catch(() => null);
  const su = m.set_union;
  const want = su?.union || cfg.union;
  if (!union && su?.sig && want) {
    const kind = (m.first_signer || m.signer).replace(/^0x/, '').length === 64 ? 'Ed25519' : 'P256';
    await invokeContract({ cfg, source: s.senderAddress, signHash: s.signHash, contractName: m.account, fn: 'set_union',
      args: [sv.address(want)], auth: [unionEntry(m.account, want, su, kind)] });
    union = want;
  }
  return { deployed: true, union };
}

/** The same for a smartphone member (4 Nov): from her help QR's join (kind 5, readSessionQr `join`). */
export const ensureMemberAccount = (cfg, s, account, join) => ensureKeypadAccount(cfg, s, { account, first_signer: join.signer, set_union: join });

export function useSetupAccount({ stellarAddress, account, evmWallet, signHash }) {
  const qc = useQueryClient();
  const { data: cfg } = useStellarConfig();
  return useMutation({
    mutationKey: ['stellar', 'setup', stellarAddress],
    mutationFn: async () => {
      if (!cfg || !stellarAddress || !evmWallet) throw new Error('not ready');
      const existing = await getAccount(cfg.horizon_url, stellarAddress);
      if (existing) {
        // With a smart account the nIN sits on the account (C…), so the sending key needs no nIN trustline (and an old
        // key on a fresh deployment, unpaired on its node, would be refused one).
        const smart = account && account !== stellarAddress;
        const out = hasNin(existing, cfg) || smart ? { existed: true } : await addNinTrustline(cfg, stellarAddress, signHash);
        await createSmartAccount(cfg, stellarAddress, account, signHash);
        return out;
      }
      const polygon = ethers.getAddress(evmWallet.address);
      const polygonSig = await evmWallet.signMessage(linkMessage(cfg.network, stellarAddress, polygon));
      let hash;
      try {
        for (let attempt = 0; ; attempt++) {
          const { xdr } = await buildAccount(stellarAddress);
          const tx = TransactionBuilder.fromXDR(xdr, cfg.passphrase);
          checkAccountTx(tx, cfg, stellarAddress);
          const sig = await signHash(tx.hash());
          tx.addSignature(stellarAddress, btoa(String.fromCharCode(...sig)));
          try {
            ({ hash } = await submitAccount(tx.toXDR(), polygon, polygonSig));
            break;
          } catch (e) {
            // 409: another member's account went first on the sponsor's sequence; build again.
            if (e.status !== 409 || attempt >= 2) throw e;
          }
        }
      } catch (e) {
        // Made meanwhile (another tab, the move): that is success, not an error.
        if (await getAccount(cfg.horizon_url, stellarAddress).catch(() => null)) return { existed: true };
        throw e;
      }
      // The node does not wait: poll Horizon until the account is there (about one ledger).
      for (let i = 0; i < 30; i++) {
        await sleep(2000);
        if (await getAccount(cfg.horizon_url, stellarAddress)) {
          await createSmartAccount(cfg, stellarAddress, account, signHash);
          return { hash };
        }
      }
      throw new Error(`account not on Stellar 60 s after ${hash}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.stellar.account(stellarAddress) }),
  });
}

/** Her union investment (design useInvestment; fund_core.position): invested, locked, free, earned. 30 s. */
export function useInvestment(address) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'investment', cfg?.union, address],
    enabled: !!cfg && !!address && !!cfg.contracts?.fund_core,
    staleTime: 30_000,
    queryFn: async () => {
      const { readContract, sv } = await import('./soroban');
      return readContract(cfg, 'fund_core', 'position', [sv.address(cfg.union), sv.address(address)]);
    },
  });
}

/** Her land titles on Stellar in today's union (land_title.title_count). In the demo a new title is written on Stellar
 *  only (no Polygon mint, executive decision 21 Oct), so the app counts both chains (src/register/titles.js). */
export function useStellarTitleCount(address) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'titles', cfg?.union, address],
    enabled: !!cfg && !!address && !!cfg.contracts?.land_title,
    staleTime: 30_000,
    queryFn: async () => {
      const { readContract, sv } = await import('./soroban');
      return Number(await readContract(cfg, 'land_title', 'title_count', [sv.address(cfg.union), sv.address(address)]) || 0);
    },
  });
}

/** Her land titles on Stellar with their record hashes (node GET /stellar/titles, signed like /plan): land_title has
 *  no "titles of a holder" view, so the node lists what its attester wrote and checks each on-chain. A title whose
 *  record is still being made has record_hash null; asked again every minute until it is there. */
export function useStellarTitles(signer) {
  return useQuery({
    queryKey: ['stellar', 'titleList', signer?.stellarAddress],
    enabled: !!signer?.stellarAddress && !!signer?.signHash,
    staleTime: 60_000,
    // Promptly while a new title is on its way: no title listed yet, or one still without its record hash.
    refetchInterval: (q) => (!(q.state.data || []).length ? 10_000 : (q.state.data || []).some((t) => !t.record_hash) ? 5_000 : false),
    queryFn: async () => {
      const { signedCall } = await import('../plan/api');
      const out = await signedCall(signer)('GET', '/stellar/titles');
      return out?.titles || [];
    },
  });
}
