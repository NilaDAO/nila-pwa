// PwaDiag.jsx
import { useEffect, useState } from "react";

const inAppBrowser = () => {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|GSA|Twitter|Line|WeChat|DuckDuckGo|MiuiBrowser/i.test(ua);
};

export default function PwaDiag() {
  const [s, set] = useState({
    https: location.protocol === "https:",
    topLevel: window.top === window.self,
    ua: navigator.userAgent,
    uad: navigator.userAgentData || null,
    displayModeStandalone: !!(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone),
    swRegistered: "serviceWorker" in navigator,
    swController: !!navigator.serviceWorker?.controller,
    bipSupported: "onbeforeinstallprompt" in window,
    bipFired: false,
    manifestOk: null,
    manifestType: null,
    icon192: null,
    icon512: null,
    inApp: inAppBrowser(),
    notes: [],
  });

  useEffect(() => {
    const bip = (e) => {
      e.preventDefault();                    // we want custom UI
      set(v => ({ ...v, bipFired: true, notes: [...v.notes, "beforeinstallprompt fired"] }));
      // hand it to your global bus if you use one:
      window.__nilaInstall ||= { evt: null, listeners: new Set() };
      window.__nilaInstall.evt = e;
      window.__nilaInstall.listeners.forEach(cb => cb(true));
    };
    window.addEventListener("beforeinstallprompt", bip);

    const cc = () => set(v => ({ ...v, swController: !!navigator.serviceWorker?.controller }));
    navigator.serviceWorker?.addEventListener?.("controllerchange", cc);

    (async () => {
      try {
        const res = await fetch("/manifest.json", { cache: "no-store" });
        const type = res.headers.get("content-type");
        const json = await res.json();
        const icons = Array.isArray(json.icons) ? json.icons : [];
        const has192 = icons.some(i => /(^|,)192x192(,|$)/.test(i.sizes));
        const has512 = icons.some(i => /(^|,)512x512(,|$)/.test(i.sizes));
        set(v => ({ ...v, manifestOk: res.ok, manifestType: type, icon192: has192, icon512: has512 }));
      } catch (e) {
        set(v => ({ ...v, manifestOk: false, notes: [...v.notes, "manifest fetch failed: " + e.message] }));
      }
    })();

    return () => {
      window.removeEventListener("beforeinstallprompt", bip);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", cc);
    };
  }, []);

  const dump = () => {
    const payload = JSON.stringify(s, null, 2);
    navigator.clipboard?.writeText(payload);
    alert("Copied diagnostics to clipboard.");
  };

  return (
    <div style={{fontFamily:"system-ui,sans-serif",padding:16}}>
      <h3>Nila PWA Diagnostics</h3>
      <ul>
        <li>HTTPS: <b>{String(s.https)}</b></li>
        <li>Top-level context: <b>{String(s.topLevel)}</b></li>
        <li>In‑app browser detected: <b>{String(s.inApp)}</b></li>
        <li>Display mode standalone now: <b>{String(s.displayModeStandalone)}</b></li>
        <li>Service worker registered API: <b>{String(s.swRegistered)}</b></li>
        <li>Service worker controlling page: <b>{String(s.swController)}</b></li>
        <li>beforeinstallprompt supported: <b>{String(s.bipSupported)}</b></li>
        <li>beforeinstallprompt fired this session: <b>{String(s.bipFired)}</b></li>
        <li>Manifest fetch ok: <b>{String(s.manifestOk)}</b> {s.manifestType ? `(type: ${s.manifestType})` : ""}</li>
        <li>Icon 192 present: <b>{String(s.icon192)}</b> — Icon 512 present: <b>{String(s.icon512)}</b></li>
      </ul>
      {s.notes.length > 0 && (<pre style={{whiteSpace:"pre-wrap"}}>{s.notes.join("\n")}</pre>)}
      <button onClick={dump}>Copy JSON report</button>
      <p style={{fontSize:12,opacity:.7,marginTop:8}}>
        Tip: If “SW controlling page” is false, refresh once. In‑app browsers and Incognito won’t show install.
      </p>
    </div>
  );
}
