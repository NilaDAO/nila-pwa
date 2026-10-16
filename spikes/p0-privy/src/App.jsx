// P0 Privy spike page. Each button runs one question from Nov7_Release_Plan §4 P0 against the
// real Privy embedded wallets. Nothing touches Polygon mainnet: the FoodToken mint is signed,
// decoded and checked, never broadcast. Stellar checks run on testnet.
import { useState } from 'react';
import { usePrivy, useWallets, useSignTransaction, useImportWallet } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { Interface, Transaction, Wallet as EthersWallet } from 'ethers';
import { sorobanAuth, sep10Local, sep10TestAnchor } from './checks.js';

const FOODTOKEN = '0x27D83C98666AD0e5dA79e5FEE24133557Bd8D2e8';
const MINT_ABI = ['function mintForBatchMember(uint256 batchId, uint32 landTitleId, uint32 harvestDate, uint256 quantity, uint128 fieldsBitmask, uint32 areaM2, uint16 farmerVarietyCode, uint32 sosDate)'];

const hex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16));

export default function App() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { importWallet } = useImportWallet();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const [results, setResults] = useState({});
  const [lines, setLines] = useState([]);

  const log = (m) => setLines((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`]);
  const evm = wallets.find((w) => w.walletClientType === 'privy');
  const stellar = user?.linkedAccounts?.find((a) => a.type === 'wallet' && a.chainType === 'stellar');

  const run = async (key, fn) => {
    setResults((r) => ({ ...r, [key]: 'running…' }));
    try {
      const out = await fn();
      setResults((r) => ({ ...r, [key]: `PASS ${JSON.stringify(out)}` }));
      log(`PASS ${key}`);
    } catch (e) {
      setResults((r) => ({ ...r, [key]: `FAIL ${e.message}` }));
      log(`FAIL ${key}: ${e.message}`);
    }
  };

  // Stellar: Privy signs a 32-byte hash; the checks need nothing more.
  const signHash = async (hash) => {
    const { signature } = await signRawHash({ address: stellar.address, chainType: 'stellar', hash: hex(hash) });
    const sig = unhex(signature);
    if (sig.length !== 64) throw new Error(`signature is ${sig.length} bytes, expected 64`);
    return sig;
  };

  const checks = {
    S0: ['Create her Stellar wallet (extended chain)', async () => {
      if (stellar) return { address: stellar.address, existing: true };
      const { wallet } = await createWallet({ chainType: 'stellar' });
      if (!/^G[A-Z2-7]{55}$/.test(wallet.address)) throw new Error(`not a G… address: ${wallet.address}`);
      return { address: wallet.address };
    }],
    S1: ['Soroban auth entry signed by raw hash, submitted on testnet', () =>
      sorobanAuth({ address: stellar.address, signHash, log })],
    S2: ['SEP-10 challenge (local server check)', () => sep10Local({ address: stellar.address, signHash, log })],
    S3: ['SEP-10 against SDF test anchor (JWT)', () => sep10TestAnchor({ address: stellar.address, signHash, log })],
    E1: ['Her Polygon wallet exists after login', async () => {
      if (!evm) throw new Error('no Privy embedded EVM wallet');
      return { address: evm.address };
    }],
    E2: ['Sign mintForBatchMember silently (not broadcast)', async () => {
      const data = new Interface(MINT_ABI).encodeFunctionData('mintForBatchMember',
        [1n, 32, 0, 1000n, 2n, 3101, 0, Math.floor(Date.now() / 1000)]);
      // Fixed gas and fees so the wallet does not estimate (it would revert: this test user is
      // no batch member). nonce 0, chain 137.
      const req = { to: FOODTOKEN, data, chainId: 137, nonce: 0, gasLimit: 500000,
        maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 30_000_000_000, value: 0 };
      const { signature } = await signTransaction(req, { address: evm.address, uiOptions: { showWalletUIs: false } });
      const tx = Transaction.from(signature);
      if (tx.from?.toLowerCase() !== evm.address.toLowerCase()) throw new Error(`signed by ${tx.from}`);
      if (tx.data !== data || tx.to?.toLowerCase() !== FOODTOKEN.toLowerCase() || tx.chainId !== 137n)
        throw new Error('signed tx differs from the request');
      return { from: tx.from, hash: tx.hash, broadcast: false };
    }],
    E3: ['Import an existing Polygon key (open item 13) — throwaway key', async () => {
      const k = EthersWallet.createRandom();
      const w = await importWallet({ privateKey: k.privateKey });
      if (w.address.toLowerCase() !== k.address.toLowerCase()) throw new Error(`imported as ${w.address}`);
      return { address: w.address, sameAddress: true };
    }],
  };

  if (!ready) return <p style={s.page}>Loading Privy…</p>;
  if (!authenticated) return <div style={s.page}><h1 style={s.h1}>P0 Privy spike</h1><button style={s.btn} onClick={login}>Log in with phone (SMS)</button></div>;

  return (
    <div style={s.page}>
      <h1 style={s.h1}>P0 Privy spike</h1>
      <p>Phone {user?.phone?.number} · Polygon {evm?.address ?? '—'} · Stellar {stellar?.address ?? '—'}</p>
      {Object.entries(checks).map(([k, [label, fn]]) => (
        <div key={k} style={s.row}>
          <button style={s.btn} onClick={() => run(k, fn)}
            disabled={(k.startsWith('S') && k !== 'S0' && !stellar) || (k === 'E2' && !evm)}>{k}</button>
          <span>{label}</span>
          <code style={s.res}>{results[k] ?? ''}</code>
        </div>
      ))}
      <h2 style={s.h2}>Log (copy into the P0 report)</h2>
      <pre style={s.log}>{JSON.stringify({ results, polygon: evm?.address, stellar: stellar?.address }, null, 2)}{'\n\n'}{lines.join('\n')}</pre>
      <button style={s.btn} onClick={logout}>Log out</button>
    </div>
  );
}

const s = {
  page: { fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 760, margin: '0 auto', fontSize: 14 },
  h1: { fontSize: 20 }, h2: { fontSize: 16, marginTop: 24 },
  row: { display: 'grid', gridTemplateColumns: '48px 1fr', gap: 8, alignItems: 'center', margin: '8px 0' },
  btn: { padding: '6px 10px', cursor: 'pointer' },
  res: { gridColumn: '2', wordBreak: 'break-all', fontSize: 12 },
  log: { background: '#f4f4f4', padding: 8, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
};
