// S1–S6 — start-up and system screens (boards BootLoading, BootInstall, BootOpenApp, BootOtherPhone, BootNotFound,
// BootNotPhone; notes start-spec). Same props and actions as today's features/registration/preLoadPages.js and the
// loading spinner, so App.js keeps its boot order; only the screens are the boards'. Used in Privy builds.
import { useEffect, useState } from 'react';
import { useStage } from '../shell/stageCtx';
import { SkeletonRows } from '../shell/Skeleton';
import { C } from '../shell/tokens';
import QRCode from 'qrcode';
import { handleInstall } from '../installPrompt';
import { useHardReload } from '../hooks/useHardReload';
import { deleteAllItems } from '../utils/db';
import RegFrame, { Bouncing, btnPrimary, btnSecondary } from './RegFrame';

const LOGO = `${process.env.PUBLIC_URL || ''}/images/reg-logo.png`;
const ground = { minHeight: '100dvh', boxSizing: 'border-box', background: 'linear-gradient(180deg, #121212 0%, #1E2738 100%)',
  fontFamily: "'Inter', system-ui, sans-serif", color: '#F1F5F9', position: 'relative', overflow: 'hidden' };
const centre = (bottom = 0) => ({ position: 'absolute', left: 24, right: 24, top: 0, bottom, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' });
const h1 = { fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginTop: 8 };
const sub = { fontSize: 14, lineHeight: 1.5, color: '#94A3B8' };
const cta = { ...btnPrimary, alignSelf: 'stretch', marginTop: 20 };
const steps = { alignSelf: 'stretch', background: '#121212', borderRadius: 24, padding: '14px 22px', display: 'flex', flexDirection: 'column', textAlign: 'left', marginTop: 12 };

function Step({ n, children, line }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 0', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.5,
      borderTop: line ? '1px solid #1F2733' : 'none' }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 9999, background: '#1F2733', fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span>{children}</span>
    </div>
  );
}

const Round = ({ label, children }) => (
  <span role="img" aria-label={label} style={{ width: 72, height: 72, borderRadius: 9999, background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D4A634" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  </span>
);

/** S1: loading, one status line; 'Loading is slow' after 15 s. `stages` is today's spinner text (kept for the line). */
export function Loading({ offline, old }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 15_000); return () => clearTimeout(t); }, []);
  // In the map-central shell (24 Oct) a screen loading its data loads in place: the map area shows the bouncing logo
  // (the stage cleared), and a card of skeleton rows sits where the card will be; the header and the tab bar stay.
  const stage = useStage();
  useEffect(() => {
    if (!stage || offline || old) return undefined;
    stage.set(null);
    // The shell lets the map area (and its logo) show through while loading, as an open map card does.
    const shell = document.querySelector('[data-testid="shell"]');
    if (!shell) return undefined;
    const was = shell.style.background;
    shell.style.background = 'transparent';
    return () => { shell.style.background = was; };
  }, [stage, offline, old]);
  if (stage && !offline && !old) {
    return (
      <div role="status" aria-label="Loading" style={{ position: 'fixed', left: 8, right: 8, top: '34vh', bottom: 0, zIndex: 1, background: C.ink,
        borderRadius: '24px 24px 0 0', padding: '18px 22px', boxSizing: 'border-box' }}>
        <SkeletonRows rows={5} />
        {slow && <span style={{ ...sub, display: 'block', marginTop: 12 }}>Loading is slow. One moment please.</span>}
      </div>
    );
  }
  const msg = offline ? 'You are offline. Showing your last saved balances.'
    : old ? 'Your crop shares or land title did not load. Showing the last saved version.'
      : slow ? 'Loading is slow. One moment please.' : 'Loading your wallet';
  // S1 is always the whole screen (22 Oct): fixed over everything, so a screen that returns it from inside a card or
  // sheet still shows it full screen, never inside the card.
  return (
    <div style={{ ...ground, position: 'fixed', inset: 0, zIndex: 40 }}>
      <div style={centre()}>
        <Bouncing pad={0} size={56} />
        <span role="status" style={{ ...sub, maxWidth: 280, marginTop: 12 }}>{msg}</span>
      </div>
    </div>
  );
}

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** S2: install the app (#ios: Add to Home Screen steps; #web: only 'Continue on web'). */
export function InstallApp({ installAvailable }) {
  const canInstall = installAvailable || !!window.__nilaInstall?.evt;
  const mode = canInstall ? 'inst' : isIos() ? 'ios' : 'web';
  const web = () => { try { localStorage.setItem('allowWeb', '1'); } catch { /* no storage */ } window.location.reload(); };
  return (
    <div style={ground}>
      <div style={centre(120)}>
        <img src={LOGO} alt="Nila" style={{ width: 72, height: 72 }} />
        <span role="heading" aria-level="1" style={h1}>Welcome to Nila</span>
        <span style={sub}>Let us invest in you.</span>
        {mode === 'inst' && <button type="button" style={cta} onClick={handleInstall}>Install the Nila app</button>}
        {mode === 'ios' && (
          <div style={steps}>
            <Step n={1}>Tap <b>Share</b> at the bottom of Safari</Step>
            <Step n={2} line>Tap <b>Add to Home Screen</b></Step>
            <Step n={3} line>Open Nila from your home screen</Step>
          </div>
        )}
        {(mode === 'web' || mode === 'ios') && <button type="button" style={{ ...btnSecondary, alignSelf: 'stretch', marginTop: mode === 'web' ? 20 : 0 }} onClick={web}>Continue on web</button>}
      </div>
      <InfoNote>Install Nila to get your land title and access to new capital.</InfoNote>
    </div>
  );
}

function InfoNote({ children }) {
  return (
    <div style={{ position: 'absolute', left: 8, right: 8, bottom: 0, background: '#121212', padding: '14px 16px 30px', display: 'flex', gap: 12,
      alignItems: 'flex-start', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
      <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
      </div>
      <div style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/** S3: the app is already installed here (#android: Chrome cannot switch by itself, 2 steps). */
export function MoveToStandalone({ installPrompt, setInstallPromptEvent }) {
  const uad = navigator.userAgentData;
  const android = !!uad && uad.platform === 'Android';
  const open = () => { window.location.href = 'web+NilaApp://'; };
  const again = () => {
    if (!installPrompt) { handleInstall(); return; }
    installPrompt.prompt();
    installPrompt.userChoice.then(() => { setInstallPromptEvent?.(null); window.location.reload(); });
  };
  return (
    <div style={ground}>
      <div style={centre()}>
        <img src={LOGO} alt="Nila" style={{ width: 72, height: 72 }} />
        <span role="heading" aria-level="1" style={h1}>Nila is already on this phone</span>
        <span style={sub}>{android ? 'Chrome cannot switch to the app by itself. Open it like this:' : 'Continue in the app, not in the browser.'}</span>
        {!android && <button type="button" style={cta} onClick={open}>Open the Nila app</button>}
        {android && (
          <div style={steps}>
            <Step n={1}>Tap <b>⋮</b> at the top right of Chrome</Step>
            <Step n={2} line>Tap <b>Open Nila</b></Step>
          </div>
        )}
        <button type="button" style={{ ...btnSecondary, alignSelf: 'stretch' }} onClick={again}>Install it again</button>
        <span style={sub}>Only if you removed the app.</span>
      </div>
    </div>
  );
}

/** S4: the key on this phone does not match the account: sign in again (clears this phone's saved data first). */
export function MismatchDevice() {
  const hardReload = useHardReload();
  const signIn = () => { document.cookie = 'offsite=; Max-Age=0; path=/;'; deleteAllItems(); hardReload(); };
  return (
    <div style={ground}>
      <div style={centre()}>
        <Round label="Phone"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></Round>
        <span role="heading" aria-level="1" style={h1}>Your account is open on another phone</span>
        <span style={sub}>Sign in to use it on this phone again. Saved data on this phone is cleared first; your tokens stay safe in your wallet.</span>
        <button type="button" style={cta} onClick={signIn}>Sign in</button>
      </div>
    </div>
  );
}

/** S5: page not found. */
export function NotFoundPage() {
  return (
    <div style={ground}>
      <div style={centre()}>
        <Round label="Not found"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></Round>
        <span role="heading" aria-level="1" style={h1}>This page wandered off the farm</span>
        <span style={sub}>Reload Nila. If you see this again, close the app and open it again.</span>
        <button type="button" style={cta} onClick={() => window.location.reload()}>Reload</button>
      </div>
    </div>
  );
}

/** S6: not on a phone: a QR code of this page and Copy link. */
export function NotMobile() {
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const link = window.location.origin + '/';
  useEffect(() => { QRCode.toString(link, { type: 'svg', margin: 2, color: { dark: '#121212', light: '#FFFFFF' } }).then(setSvg).catch(() => {}); }, [link]);
  const copy = () => { navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}); };
  return (
    <div style={{ ...ground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, maxWidth: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <img src={LOGO} alt="Nila" style={{ width: 72, height: 72 }} />
        <span role="heading" aria-level="1" style={h1}>Nila works on your phone</span>
        <span style={sub}>Scan the code with your phone, or copy the link and send it to your phone.</span>
        <div style={{ marginTop: 20, padding: 22, background: '#121212', borderRadius: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, alignSelf: 'stretch' }}>
          <div role="img" aria-label="QR code of this link" style={{ width: 168, height: 168, background: '#FFFFFF', borderRadius: 16, overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: svg }} />
          <button type="button" style={btnSecondary} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
      </div>
    </div>
  );
}

/** After R3 the wallet loads on the registration ground (field scene + waiting card), not on S1, so R1 → R14 is one
 *  continuous flow. */
export function RegLoading() {
  return <RegFrame><Bouncing /></RegFrame>;   // the same bounce as R14
}

// Straight from registration (R3/R9 done in this page load) the waits stay on the R ground; on a reload or a normal
// start they are S1 (executive decision 21 Oct). A module flag, so a reload clears it.
let fromRegister = false;
export function markFromRegister(newMember = true) {
  // Only a new member goes on to R5 on the field scene; a sign-in to an existing wallet waits on S1 (21 Oct).
  fromRegister = newMember;
  // A sign-in starts on the app's first tab: a hash left from an earlier session (e.g. #/cash) is not a deep link.
  try { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ignore */ }
}
export function BootLoading() {
  return fromRegister ? <RegLoading /> : <Loading />;
}
