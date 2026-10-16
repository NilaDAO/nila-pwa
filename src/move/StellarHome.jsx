// Interim Stellar home after the move, until the bottom bar and A1 (P1) replace it:
// her Stellar account, nIN, and where her moved nIN is.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { useLegacyBalances } from './hooks';
import { useNilaSigner } from '../wallet/signer';
import { getMoveStatus, requestMoveNin } from './api';

const STATE = {
  none: 'No nIN to move', waiting: 'Waiting for your union to confirm your land title',
  pending: 'On its way', burned: 'On its way', stuck: 'On its way (delayed)', done: 'Arrived',
  failed: 'Did not arrive',
};

export default function StellarHome() {
  const s = useNilaSigner();
  const a = s?.stellarAccount;
  const move = useQuery({ queryKey: ['stellar', 'move', s?.evmAddress], enabled: !!s?.evmAddress,
    queryFn: () => getMoveStatus(s.evmAddress), refetchInterval: 30_000 });
  const { data: cfg } = useStellarConfig();
  const legacy = useLegacyBalances(s?.evmAddress);
  const [retry, setRetry] = useState();
  // Her nIN move was refused before anything was burned: she can ask again (her Polygon nIN is untouched).
  const again = async () => {
    setRetry('…');
    try {
      const wei = (await legacy.refetch()).data?.ninWei ?? 0n;
      if (wei > 0n) await requestMoveNin({ network: cfg.network, stellar: s.stellarAddress,
        evmAddress: s.evmAddress, amountWei: wei, signEvmMessage: s.signEvmMessage });
      setRetry(undefined); move.refetch();
    } catch (e) { setRetry(e.message); }
  };
  return (
    <div className="p-4 text-sm" style={{ color: '#f1f5f9', background: '#121212', minHeight: '100%' }} data-testid="stellar-home">
      <h1 className="text-lg font-bold mb-3">nila</h1>
      <div className="rounded-xl p-4 mb-2" style={{ background: '#1f2733' }}>
        <div>nIN {a?.nin ? a.nin.balance : a?.exists === false ? '—' : '…'}</div>
        <div style={{ color: '#94a3b8' }}>Moved nIN: {STATE[move.data?.state] ?? '…'}</div>
        {move.data?.state === 'failed' && (
          <button type="button" className="underline mt-1" onClick={again} disabled={retry === '…'}>Try again</button>
        )}
        {retry && retry !== '…' && <div style={{ color: '#e8907f' }}>{retry}</div>}
      </div>
      {s?.stellarSetup?.error && <div style={{ color: '#e8907f' }}>{s.stellarSetup.error}</div>}
    </div>
  );
}
