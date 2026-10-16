// Interim Stellar home after the move, until the bottom bar and A1 (P1) replace it:
// her Stellar account, nIN, and where her moved nIN is.
import { useQuery } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { getMoveStatus } from './api';

const STATE = {
  none: 'No nIN to move', waiting: 'Waiting for your union to confirm your land title',
  pending: 'On its way', burned: 'On its way', done: 'Arrived', failed: 'Did not arrive — ask your union leader',
};

export default function StellarHome() {
  const s = useNilaSigner();
  const a = s?.stellarAccount;
  const move = useQuery({ queryKey: ['stellar', 'move', s?.evmAddress], enabled: !!s?.evmAddress,
    queryFn: () => getMoveStatus(s.evmAddress), refetchInterval: 30_000 });
  return (
    <div className="p-4 text-sm" style={{ color: '#f1f5f9', background: '#121212', minHeight: '100%' }} data-testid="stellar-home">
      <h1 className="text-lg font-bold mb-3">nila</h1>
      <div className="rounded-xl p-4 mb-2" style={{ background: '#1f2733' }}>
        <div>nIN {a?.nin ? a.nin.balance : a?.exists === false ? '—' : '…'}</div>
        <div style={{ color: '#94a3b8' }}>Moved nIN: {STATE[move.data?.state] ?? '…'}</div>
      </div>
      {s?.stellarSetup?.error && <div style={{ color: '#e8907f' }}>{s.stellarSetup.error}</div>}
    </div>
  );
}
