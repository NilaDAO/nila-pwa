// index.js
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
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Layout />);

//eruda.init({});
serviceWorkerRegistration.register({ swUrl: '/nila-sw.js' });