// index.js
import './demo/install';   // demo builds only (record / static); empty otherwise
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import Layout from './Layout';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import eruda from 'eruda';

// --- Shim FIRST (before render) ---
window.__nilaInstall = { evt: null, listeners: new Set() };

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__nilaInstall.evt = e;
  window.__nilaInstall.listeners.forEach(cb => cb(true));
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem('appinstalled','yes');
  document.cookie = 'appinstalled=yes; Max-Age=31536000; Path=/; SameSite=Lax';
  window.__nilaInstall.evt = null;
  window.__nilaInstall.listeners.forEach(cb => cb(false));
});

// --- end shim ---
// 26 Nov (plan 054): the SMS link on a smartphone (#/link/<code>, from index.html). The app decides here what Nila lite
// decided before (public/lite/lite.js route): a join link (no account yet) → a key on this phone and the member's QR; a
// recovery link → the same, its key registered by RecoverLink; a smartphone (Privy) member's recovery → the sign-up.
function linkOpened() {
  const m = /^#\/link\/([0-9A-Z]+)$/.exec(window.location.hash);
  if (!m) return false;
  const code = m[1];
  const lite = () => window.location.replace(`/lite/index.html#/l/${code}`);
  // 26 Nov: the join is opened on the newest app: an installed phone's service worker would serve its cached (maybe
  // old) app on the next page. Its service workers and caches go (code only; the phone key, settings and logins are in
  // IndexedDB / localStorage and stay); the next page loads fresh and registers the worker again.
  const fresh = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = (await window.caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    } catch { /* a phone without them: nothing cached */ }
  };
  fresh().then(() => fetch(`${process.env.REACT_APP_API_BASE_URL}/keypad/l/${code}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((i) => {
    try {
      if (i.phone_type === 'smartphone') { localStorage.setItem('nila.recoverLink', code); window.location.replace('/'); return; }
      if (i.account) localStorage.setItem('nila.recoverLink', code);
      localStorage.setItem('nila.signer', 'phone');
      localStorage.setItem('nila.mode', 'assist');
    } catch { lite(); return; }
    window.location.replace('/#/wallet');
    window.location.reload();
  }).catch(lite));   // the node not reached, or the link used up: Nila lite shows why
  return true;
}

if (!linkOpened()) {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<Layout />);
}

//eruda.init({});
serviceWorkerRegistration.register({ swUrl: '/nila-sw.js' });