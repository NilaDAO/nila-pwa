import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { polygon } from 'viem/chains';
import App from './App.jsx';

const appId = import.meta.env.VITE_PRIVY_APP_ID;

createRoot(document.getElementById('root')).render(
  appId ? (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['sms'],
        defaultChain: polygon,
        supportedChains: [polygon],
        // Her Polygon wallet is made at login; the Stellar wallet is created by the page (extended chain).
        embeddedWallets: { ethereum: { createOnLogin: 'all-users' }, showWalletUIs: false },
      }}
    >
      <App />
    </PrivyProvider>
  ) : (
    <p style={{ fontFamily: 'sans-serif', padding: 16 }}>Set VITE_PRIVY_APP_ID in .env.local (see .env.example).</p>
  ),
);
