// Loads Privy (and its bundle) only when it is switched on. The env test is written inline so
// webpack drops the import at build time when the flag is off: no Privy chunks in the live
// build, and none in the service worker's precache.
import { lazy, Suspense, useEffect, useState } from 'react';
import { hasPhoneKey, isPhoneKeyPhone, markPhoneKeyPhone } from './phoneKey';

// The static demo build (src/demo/shim.js) has no Privy: StaticRoot stands in for it.
const PrivyRoot = process.env.REACT_APP_DEMO_STATIC === '1' ? lazy(() => import('./StaticRoot'))
  : process.env.REACT_APP_PRIVY_APP_ID ? lazy(() => import('./PrivyRoot')) : null;
// Plan 053: an assist-mode member's key on her own phone (no Privy, no Cognito); same flag.
const PhoneKeyRoot = process.env.REACT_APP_DEMO_STATIC !== '1' && process.env.REACT_APP_PRIVY_APP_ID
  ? lazy(() => import('./PhoneKeyRoot')) : null;

export default function WalletRoot({ children }) {
  const [phone, setPhone] = useState(() => !!PhoneKeyRoot && isPhoneKeyPhone());
  // The flag lost but the key still here: this is still her phone.
  useEffect(() => {
    if (!PhoneKeyRoot || phone) return;
    hasPhoneKey().then((has) => { if (has) { markPhoneKeyPhone(); setPhone(true); } });
  }, [phone]);
  if (phone) return <Suspense fallback={null}><PhoneKeyRoot>{children}</PhoneKeyRoot></Suspense>;
  if (!PrivyRoot) return children;
  return <Suspense fallback={null}><PrivyRoot>{children}</PrivyRoot></Suspense>;
}
