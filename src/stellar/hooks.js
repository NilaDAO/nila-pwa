// Stellar hooks for the PWA (P2). Loaded only inside the Privy chunk, so the live build carries none of it.
// Names and keys follow the design (data/DataHooksRead.md, DataHooksWrite.md): useAccount, useSetupAccount.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { ethers } from 'ethers';
import { buildAccount, getAccount, getStellarConfig, linkMessage, submitAccount } from './api';
import { qk } from './keys';

export function useStellarConfig() {
  return useQuery({ queryKey: qk.stellar.config(), queryFn: getStellarConfig, staleTime: Infinity, retry: 2 });
}

const NIN_DECIMALS = 7;

/** Her Stellar account: exists, nIN (balance, authorised), USDC if any, sponsor. Fresh 15 s. */
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
      const usdc = a.balances.find((b) => b.asset_code === 'USDC');
      return {
        exists: true,
        sponsor: a.sponsor || null,
        nin: nin ? { balance: Number(nin.balance), authorized: !!nin.is_authorized } : null,
        usdc: usdc ? { balance: Number(usdc.balance) } : null,
        decimals: NIN_DECIMALS,
      };
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      const { xdr } = await buildAccount(stellarAddress);
      const tx = TransactionBuilder.fromXDR(xdr, cfg.passphrase);
      const sig = await signHash(tx.hash());
      tx.addSignature(stellarAddress, btoa(String.fromCharCode(...sig)));
      const polygon = ethers.getAddress(evmWallet.address);
      const polygonSig = await evmWallet.signMessage(linkMessage(cfg.network, stellarAddress, polygon));
      const { hash } = await submitAccount(tx.toXDR(), polygon, polygonSig);
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
