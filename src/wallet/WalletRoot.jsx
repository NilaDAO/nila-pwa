// Loads Privy (and its bundle) only when it is switched on. The env test is written inline so
// webpack drops the import at build time when the flag is off: no Privy chunks in the live
// build, and none in the service worker's precache.
import { lazy, Suspense } from 'react';

const PrivyRoot = process.env.REACT_APP_PRIVY_APP_ID ? lazy(() => import('./PrivyRoot')) : null;

export default function WalletRoot({ children }) {
  if (!PrivyRoot) return children;
  return <Suspense fallback={null}><PrivyRoot>{children}</PrivyRoot></Suspense>;
}
