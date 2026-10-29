// /p0 — the P0 checks against her real Privy wallets, inside the PWA (only when Privy is on).
// Log in to the app as usual first (Cognito, code by SMS); Privy then signs in silently with her
// Polygon key. Nothing goes to Polygon mainnet: the FoodToken mint is signed and decoded, never broadcast.
// Stellar checks run on testnet.
import { useState } from 'react';
import { Interface, Transaction } from 'ethers';
import { useNilaSigner } from './signer';
import { sep10Local, sep10TestAnchor, sorobanAuth } from './stellarChecks';

const FOODTOKEN = '0x27D83C98666AD0e5dA79e5FEE24133557Bd8D2e8';
const MINT_ABI = ['function mintForBatchMember(uint256 batchId, uint32 landTitleId, uint32 harvestDate, uint256 quantity, uint128 fieldsBitmask, uint32 areaM2, uint16 farmerVarietyCode, uint32 sosDate)'];

// P2: her sponsored Stellar account, made by the app after login.
function StellarAccountPanel({ signer }) {
  const { stellarAccount: a, stellarSetup: s } = signer;
  const state = !a ? 'reading…' : a.exists ? 'exists' : `not yet (setup ${s.status})`;
  return (
    <div className="my-2 p-2 border rounded" data-testid="stellar-account">
      <div>Stellar account: <b>{state}</b></div>
      {a?.exists && (
        <div>nIN {a.nin ? `${a.nin.balance} (trustline ${a.nin.authorized ? 'authorised' : 'unauthorised'})` : 'no trustline'}
          {' · '}sponsor {a.sponsor ? `${a.sponsor.slice(0, 8)}…` : '—'}</div>
      )}
      {s.error && <div className="text-red-600">setup failed: {s.error} <button className="underline" onClick={s.run}>retry</button></div>}
    </div>
  );
}

export default function P0Check() {
  const signer = useNilaSigner();
  const [results, setResults] = useState({});
  const [lines, setLines] = useState([]);
  const log = (m) => setLines((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`]);

  if (!signer) return <p className="p-4">Privy is off (REACT_APP_PRIVY_APP_ID not set).</p>;
  if (!signer.authenticated) {
    return <p className="p-4">{signer.error ? `Privy login failed: ${signer.error}` : 'Waiting for the app login, then Privy signs in…'}</p>;
  }

  const { evmAddress: evm, stellarAddress: stellar, signHash, signEvmTx, privyEvmAddress, privyUserId } = signer;

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

  const checks = {
    S0: ['Stellar wallet made after login', async () => {
      if (!/^G[A-Z2-7]{55}$/.test(stellar || '')) throw new Error(`no G… address yet: ${stellar}`);
      return { address: stellar };
    }],
    S1: ['Soroban auth entry signed by raw hash, testnet SUCCESS', () => sorobanAuth({ address: stellar, signHash, log })],
    S2: ['SEP-10 challenge (server-side check)', () => sep10Local({ address: stellar, signHash, log })],
    S3: ['SEP-10 against SDF test anchor (JWT)', () => sep10TestAnchor({ address: stellar, signHash, log })],
    E1: ['Privy signed in with your own Polygon key (same address)', async () => {
      if (!evm) throw new Error('your Polygon key is not available');
      if (privyEvmAddress?.toLowerCase() !== evm.toLowerCase()) throw new Error(`Privy user wallet ${privyEvmAddress} ≠ your key ${evm}`);
      return { address: evm, privyUser: privyUserId };
    }],
    E2: ['mintForBatchMember signed with your key, not broadcast', async () => {
      const data = new Interface(MINT_ABI).encodeFunctionData('mintForBatchMember',
        [1n, 32, 0, 1000n, 2n, 3101, 0, Math.floor(Date.now() / 1000)]);
      // Fixed gas and fees: estimation would revert (this test user is no batch member).
      const raw = await signEvmTx({ to: FOODTOKEN, data, chainId: 137, nonce: 0, gasLimit: 500000,
        maxFeePerGas: 100_000_000_000, maxPriorityFeePerGas: 30_000_000_000, value: 0 });
      const tx = Transaction.from(raw);
      if (tx.from?.toLowerCase() !== evm.toLowerCase()) throw new Error(`signed by ${tx.from}`);
      if (tx.data !== data || tx.to?.toLowerCase() !== FOODTOKEN.toLowerCase() || tx.chainId !== 137n)
        throw new Error('signed tx differs from the request');
      return { from: tx.from, hash: tx.hash, broadcast: false };
    }],
  };

  return (
    <div className="p-4 text-sm max-w-xl mx-auto">
      <h1 className="text-lg font-semibold">P0 — Privy checks</h1>
      <p className="break-all">Privy user {privyUserId ?? '—'} · Polygon {evm ?? '—'} · Stellar {stellar ?? '—'}</p>
      <StellarAccountPanel signer={signer} />
      {Object.entries(checks).map(([k, [label, fn]]) => (
        <div key={k} className="my-2">
          <button className="border rounded px-2 py-1 mr-2" onClick={() => run(k, fn)}
            disabled={(k[0] === 'S' && !stellar) || (k[0] === 'E' && !evm)}>{k}</button>
          <span>{label}</span>
          <div className="text-xs break-all">{results[k] ?? ''}</div>
        </div>
      ))}
      <h2 className="font-semibold mt-4">Log (paste into Docs/P0-Privy-Spike.md)</h2>
      <pre className="bg-gray-100 p-2 text-xs whitespace-pre-wrap break-all">
        {JSON.stringify({ results, polygon: evm, stellar }, null, 2)}{'\n\n'}{lines.join('\n')}
      </pre>
    </div>
  );
}
