// installPrompt.js
let deferredPrompt = null;
const listeners = new Set();

export function initInstallCapture() {
  // no-op: capture handled in index.js
}

export function onInstallAvailable(cb) {
  const bus = window.__nilaInstall;
  if (!bus) return () => {};
  const set = (e) => cb(!!e);
  // keep a reference so Layout can receive the event
  bus.set = (e) => { set(e); };
  // sync immediately
  set(bus.evt);
  return () => { if (bus.set === set) bus.set = null; };
}

export async function handleInstall() {
  const e = window.__nilaInstall?.evt;
  if (!e) return;
  e.prompt();
  await e.userChoice;
  window.__nilaInstall.evt = null;
  window.__nilaInstall.listeners.forEach(cb => cb(false));
}
