// The bottom drawer of the CP screens (CP11's legend style: scrim, rounded card above the tab bar, Close), reused for
// CP9's "What this plan is based on" and CP10's remove-area confirm (executive decision 21 Oct).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { C, FONT } from '../shell/tokens';
import { Notice, muted } from './ui';

export const drawerBtn = { height: 44, border: 0, borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '0 24px', color: C.text, background: C.raised, cursor: 'pointer' };

/** actions: [{label, onClick, primary, disabled}]; without them one Close button. */
export function Drawer({ title, onClose, children, actions }) {
  return createPortal(
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', left: 8, right: 8, bottom: 88, zIndex: 21, maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto',
        background: C.ink, borderRadius: 24, boxShadow: 'rgba(0,0,0,0.15) 0 12px 10px 0, rgba(0,0,0,0.06) 0 5px 12px 2px', padding: '14px 22px 22px',
        display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT, color: C.text, boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, paddingTop: 4 }}>{title}</span>
        {children}
        {actions
          ? <div style={{ display: 'flex', gap: 8 }}>{actions.map((a) => (
            <button key={a.label} type="button" disabled={a.disabled} onClick={a.onClick} style={{ ...drawerBtn, flex: 1, opacity: a.disabled ? 0.5 : 1,
              ...(a.primary ? { background: C.accent, color: C.ink } : {}) }}>{a.label}</button>))}</div>
          : <button type="button" onClick={onClose} style={drawerBtn}>Close</button>}
      </div>
    </>, document.body);
}

/** The round info button next to a title (CP11's "Money left each month"). */
export function InfoButton({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={{ width: 44, height: 44, margin: -8, border: 0, padding: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
    </button>
  );
}

const h = { fontSize: 14, fontWeight: 700, margin: 0 };
// One mark in one circle (12 Nov), in Nila's tokens: accent check = used, muted dash = not used, gold "!" = a warning
// (gold is the tokens' warning icon colour, as on the notices; the tokens have no green).
const Tick = ({ on, warn }) => {
  const col = warn ? C.gold : on ? C.accent : C.muted;
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      {warn ? <><path d="M12 7v6" /><path d="M12 17h.01" /></> : on ? <path d="m7.5 12.5 3 3 6-6.5" /> : <path d="M8 12h8" />}
    </svg>
  );
};

/** CP9 "What this plan is based on": the node's plan.basis, by code (no LLM). */
export function BasisDrawer({ basis, onClose }) {
  if (!basis) {
    return <Drawer title="What this plan is based on" onClose={onClose}><p style={{ ...muted, margin: 0 }}>This plan was made before this list existed. Renew it to see what it is based on.</p></Drawer>;
  }
  const acct = basis.account_problems || {};
  return (
    <Drawer title="What this plan is based on" onClose={onClose}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={h}>Data</h3>
        {basis.inputs.map((i) => (i.warn
          ? <Notice key={i.name} title={i.name}>{i.detail}</Notice>
          : (
            <div key={i.name} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.5 }}>
              <Tick on={i.used} />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700 }}>{i.name} · {i.used ? 'used' : 'not used'}</span>
                <span style={{ color: C.muted }}>{i.detail}{i.used && i.source && i.source !== '—' ? ` (${i.source})` : ''}</span>
              </span>
            </div>
          )))}
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={h}>Vouchers</h3>
        <p style={{ ...muted, margin: 0 }}>{basis.vouchers.used ? 'Used: ' : 'Not used: '}{basis.vouchers.why}.</p>
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={h}>Problems in your field record</h3>
        {basis.record_problems?.length
          ? basis.record_problems.map((t) => <Notice key={t}>{t}</Notice>)
          : <p style={{ ...muted, margin: 0 }}>None found in your record.</p>}
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={h}>Problems in your account</h3>
        {acct.checked
          ? (acct.items?.length ? acct.items.map((t) => <Notice key={t}>{t}</Notice>) : <p style={{ ...muted, margin: 0 }}>No late or missed repayments.</p>)
          : <p style={{ ...muted, margin: 0 }}>{acct.note || 'Not checked yet.'}</p>}
      </section>
    </Drawer>
  );
}

/** The accept screen's short version of "What this plan is based on" (12 Nov): an accordion, one row per item with its
 *  tick, all closed; a tap opens the item's explanation. */
export function BasisList({ basis }) {
  const [open, setOpen] = useState(null);
  if (!basis) return null;
  const acct = basis.account_problems || {};
  const rec = basis.record_problems || [];
  const acc = acct.items || [];
  const items = [
    ...basis.inputs.map((i) => ({ on: i.used && !i.warn, warn: !!i.warn, title: i.name,
      text: `${i.used ? 'Used' : 'Not used'}: ${i.detail}${i.used && i.source && i.source !== '—' ? ` (${i.source})` : ''}` })),
    { on: !!basis.vouchers?.used, title: 'Machine vouchers', text: `${basis.vouchers?.used ? 'Used' : 'Not used'}: ${basis.vouchers?.why}.` },
    { on: !rec.length, title: 'Problems in your field record', text: rec.length ? rec.join(' ') : 'None found in your record.' },
    { on: acct.checked && !acc.length, title: 'Problems in your account',
      text: acct.checked ? (acc.length ? acc.join(' ') : 'No late or missed repayments.') : acct.note || 'Not checked yet.' },
  ];
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, margin: '28px 0 4px' }}>What this plan is based on</h2>
      {items.map((it) => {
        const isOpen = open === it.title;
        return (
          <div key={it.title} style={{ borderBottom: `1px solid ${C.raised}` }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.title)}
              style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, border: 0, padding: 0, background: 'transparent',
                color: C.text, fontFamily: FONT, fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
              <Tick on={it.on} warn={it.warn} />
              <span style={{ flexGrow: 1 }}>{it.title}</span>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {isOpen && <p style={{ ...muted, margin: '0 0 12px 26px', fontSize: 13 }}>{it.text}</p>}
          </div>
        );
      })}
    </section>
  );
}
