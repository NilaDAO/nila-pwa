// Stellar hooks for the PWA (P2). Loaded only inside the Privy chunk, so the live build carries none of it.
// Names and keys follow the design (data/DataHooksRead.md, DataHooksWrite.md): useAccount, useSetupAccount.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Asset, TransactionBuilder } from '@stellar/stellar-sdk';
import { ethers } from 'ethers';
import { buildAccount, getAccount, getStellarConfig, linkMessage, submitAccount } from './api';
import { qk } from './keys';

export function useStellarConfig() {
  return useQuery({ queryKey: qk.stellar.config(), queryFn: getStellarConfig, staleTime: Infinity, retry: 2 });
}

const NIN_DECIMALS = 7;

/**
 * Her Stellar account: exists, nIN (balance, authorised; the asset and issuer from the node), sponsor.
 * Fresh 15 s. Not persisted yet (the app has no query persister). No USDC for members: they hold no
 * USDC trustline (R9, R11), and a balance of an unknown issuer is ignored.
 */
export function useAccount(address) {
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: qk.stellar.account(address),
    enabled: !!cfg && !!address,
    staleTime: 15_000,
    queryFn: async () => {
      const a = await getAccount(cfg.horizon_url, address);
      if (!a) return { exists: false };
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
  if (!ok) throw new Error('the node sent a transaction that is not her sponsored account');
}

/**
 * Her sponsored Stellar account with the nIN trustline only (R9), at login (R4) or at the move
 * (M1 step 1): the node builds it, she signs it with her Stellar key, her Polygon key signs the
 * wallet pair, the node's sponsor co-signs and submits. Safe to repeat: an existing account is a no-op.
 */
export function useSetupAccount({ stellarAddress, evmWallet, signHash }) {
  const qc = useQueryClient();
  const { data: cfg } = useStellarConfig();
  return useMutation({
    mutationKey: ['stellar', 'setup', stellarAddress],
    mutationFn: async () => {
      if (!cfg || !stellarAddress || !evmWallet) throw new Error('not ready');
      if (await getAccount(cfg.horizon_url, stellarAddress)) return { existed: true };
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
        if (await getAccount(cfg.horizon_url, stellarAddress)) return { hash };
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
