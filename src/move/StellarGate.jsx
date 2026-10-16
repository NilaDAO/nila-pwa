// Stellar mode (P3): a Polygon wallet ('137') sees only the move (M1–M4); a moved wallet
// ('stellar') opens on Stellar. Loaded only with Privy on; otherwise the app is unchanged.
import { useDataContext } from '../utils/NavigationContext';
import { useNilaSigner } from '../wallet/signer';
import MoveFlow from './MoveFlow';
import StellarHome from './StellarHome';
import { STELLAR_CHAIN } from './hooks';

export default function StellarGate({ children }) {
  const { db } = useDataContext();
  const signer = useNilaSigner();
  if (!signer) return children;
  if (db?.chain === '137') return <MoveFlow onMoved={() => window.location.reload()} />;
  if (db?.chain === STELLAR_CHAIN) return <StellarHome />;
  return children;
}
