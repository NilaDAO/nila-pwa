// The parts A11 (board Settings) and LS (board LeaderSettings) share: the card, the row, the copy chip, the switch,
// the card buttons, and the union, notifications, account and reset cards. Copy as on the boards.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { useStellarConfig } from '../stellar/hooks';
import { readAllItems, deleteAllItems } from '../utils/db';
import { getSubscriptionStatus, subscribeUser, unsubscribeUser } from '../features/apis/pushManager';
import { readUnion, unionByPolygon } from '../register/Registration';
import { useTitleName } from '../plan/hooks';
import { useMyLand } from '../loan/MyShares';
import { C, FONT, R, SHADOW } from './tokens';

export const short = (a) => (a ? `${a.slice(0, 4)}...${a.slice(-4)}` : '…');

export function Card({ label, title, children }) {
  return (
    <section aria-label={label || title} style={{ background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 8, fontFamily: FONT, color: C.text }}>
      {title && <h2 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{title}</h2>}
      {children}
    </section>
  );
}

export const Text = ({ children, style }) => <span style={{ fontSize: 14, lineHeight: 1.5, color: C.muted, ...style }}>{children}</span>;

/** A label left, the value bold on the right (or a chip / button as `v`). */
export function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: C.muted }}>{k}</span>
      {typeof v === 'string' || typeof v === 'number' ? <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span> : v}
    </div>
  );
}

const chip = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, border: 0, borderRadius: 12, background: C.raised, padding: '0 14px',
  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.text, cursor: 'pointer' };
const CopyIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

/** The address chip: short address and a copy icon; "Copied" for a moment after a tap. */
export function CopyChip({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* no clipboard */ } };
  return <button type="button" aria-label={label} onClick={copy} disabled={!value} style={chip}>{done ? 'Copied' : short(value)}<CopyIcon /></button>;
}

export function Chip({ children, onClick, disabled }) {
  return <button type="button" onClick={onClick} disabled={disabled || !onClick} style={{ ...chip, cursor: onClick && !disabled ? 'pointer' : 'default' }}>{children}</button>;
}

/** The switch (52 × 32, accent when on). */
export function Switch({ label, on, onClick, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on ? 'true' : 'false'} aria-label={label} onClick={onClick} disabled={disabled}
      style={{ position: 'relative', flexShrink: 0, width: 52, height: 32, border: 0, padding: 0, borderRadius: R.round, cursor: disabled ? 'default' : 'pointer',
        background: on ? C.accent : C.raised, opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: 'absolute', top: 4, left: on ? 24 : 4, width: 24, height: 24, borderRadius: R.round, background: on ? C.ink : C.muted }} />
    </button>
  );
}

/** A bold title with a muted line, and a switch on the right. */
export function SwitchRow({ title, sub, subColor, ...sw }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700 }}>{title}</span>{sub && <span style={{ color: subColor || C.muted }}>{sub}</span>}
      </span>
      <Switch label={title} {...sw} />
    </div>
  );
}

export const btn = { height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', color: C.text, background: C.raised, cursor: 'pointer' };
/** The card's secondary button; without `onClick` it is shown disabled (no backend yet). */
export function CardButton({ children, onClick, color, style }) {
  return <button type="button" onClick={onClick} disabled={!onClick} style={{ ...btn, marginTop: 10, color: color || C.text, opacity: onClick ? 1 : 0.5, cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</button>;
}

/** The confirm card over a 60% dark layer (boards Settings #reset, #hold). */
export function ConfirmCard({ title, warn, children, cancel = 'Cancel', ok, okStyle, onCancel, onOk, okDisabled }) {
  return createPortal(
    <>
      <div aria-hidden="true" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-label={title || ok} style={{ position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21, background: C.ink, borderRadius: 24,
        boxShadow: SHADOW, padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT, color: C.text }}>
        {title && <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, paddingTop: 8 }}>{title}</div>}
        {warn && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{warn}</div>
          </div>
        )}
        {children}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ ...btn, flex: 1 }}>{cancel}</button>
          <button type="button" onClick={onOk} disabled={okDisabled} style={{ ...btn, flex: 1, color: C.ink, background: C.accent, opacity: okDisabled ? 0.5 : 1, ...okStyle }}>{ok}</button>
        </div>
      </div>
    </>, document.body);
}

/** What the phone keeps from the login (IndexedDB 'Init'): phone, union. */
export function useInit() {
  return useQuery({ queryKey: ['local', 'init'], staleTime: 60_000, queryFn: () => readAllItems('Init').catch(() => ({})) });
}

/** Her union's name and representative, as R9 saved them on this phone. */
export function useUnionInfo() {
  const s = useNilaSigner();
  const init = useInit();
  const u = init.data?.union;
  const stored = readUnion(s?.evmAddress);
  const known = unionByPolygon(u?.address || stored?.polygon);
  return { name: u?.name || stored?.name || known?.name, rep: u?.rep || known?.rep };
}

/** "Your credit union": the union's Stellar address, representative and name; `extra` for the leader's identity row.
 *  DESIGN GAP: Change union has no flow (one union today), shown disabled. */
export function UnionCard({ extra }) {
  const { data: cfg } = useStellarConfig();
  const u = useUnionInfo();
  return (
    <Card title="Your credit union">
      <Row k="Union address" v={<CopyChip label="Copy union address" value={cfg?.union} />} />
      <Row k="Representative" v={u.rep || '—'} />
      <Row k="Union" v={u.name || '—'} />
      {extra}
      <CardButton>Change union</CardButton>
    </Card>
  );
}

/** "Notifications": the web push subscription on this phone (as R14's Enable, pushManager). */
export function NotificationsCard() {
  const s = useNilaSigner();
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ['local', 'push'], queryFn: () => getSubscriptionStatus().catch(() => ({ supported: false })) });
  const [busy, setBusy] = useState(false);
  const on = !!st.data?.hasSub;
  const flip = async () => {
    setBusy(true);
    try { await (on ? unsubscribeUser(s?.evmAddress) : subscribeUser(s?.evmAddress)); } catch { /* stays as it was */ }
    await qc.invalidateQueries({ queryKey: ['local', 'push'] });
    setBusy(false);
  };
  return (
    <Card title="Notifications">
      <SwitchRow title="Union notifications" sub="Your union can send you notifications." on={on} onClick={flip}
        disabled={busy || !st.data?.supported || !s?.evmAddress} />
    </Card>
  );
}

const phoneText = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : p || '—';
};
const RefreshIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" />
  </svg>
);
/** Check for a new version: the service worker looks for one, then the page reloads. */
const checkUpdate = async () => {
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* reload anyway */ }
  window.location.reload();
};

/** "Account". DESIGN GAP: the app has one theme (dark), so Theme shows Dark and does not change. */
export function AccountCard() {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const init = useInit();
  const { landId, onPolygon, stellarTitle } = useMyLand();
  const farm = useTitleName(landId, onPolygon, stellarTitle);
  return (
    <Card title="Account">
      <Row k="Farm name" v={farm || '—'} />
      <Row k="Currency" v="INR" />
      <Row k="Theme" v={<Chip>Dark</Chip>} />
      <Row k="Phone number" v={phoneText(init.data?.phone)} />
      <Row k="Network" v={cfg ? (cfg.network === 'mainnet' ? 'Stellar' : `Stellar ${cfg.network}`) : '…'} />
      <Row k="Wallet address" v={<CopyChip label="Copy wallet address" value={s?.stellarAddress} />} />
      <Row k="Version" v={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          {process.env.REACT_APP_VERSION || '—'}
          <button type="button" aria-label="Check for updates" onClick={checkUpdate} style={{ width: 36, height: 36, border: 0, borderRadius: R.round, background: C.raised,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><RefreshIcon /></button>
        </span>
      )} />
    </Card>
  );
}

/** Reset account, as the current app does (features/wallet/Settings.js handleLogout): clear the field-registration
 *  leftovers and the offsite cookie, fire the IndexedDB wipe and reload at once — the delete stays blocked while the
 *  app holds the DB open, and the reload is what closes it, so it is never awaited. */
function resetAccount() {
  try {
    localStorage.removeItem('fields');
    localStorage.removeItem('positions');
    document.cookie = 'offsite=; Max-Age=0; path=/;';
  } catch (_) { /* storage blocked: the wipe and reload still run */ }
  deleteAllItems();
  window.location.reload();
}

/** "Reset account" and its confirm. The board's line says "a new WhatsApp code"; the code is SMS only (LOAN_RULES R2). */
export function ResetCard({ leader }) {
  const [ask, setAsk] = useState(false);
  return (
    <Card title="Reset account">
      <Text>Removes your account from this phone.</Text>
      <CardButton color={C.coral} onClick={() => setAsk(true)}>Reset account</CardButton>
      {ask && (
        <ConfirmCard ok="Reset" okStyle={{ background: C.coral }} onCancel={() => setAsk(false)} onOk={resetAccount}
          warn={`Remove your account from this phone? ${leader ? 'Your assets and your signer role stay with your wallet.' : 'Your assets stay in your wallet.'} To open it again you need your phone number and a new SMS code.`} />
      )}
    </Card>
  );
}
