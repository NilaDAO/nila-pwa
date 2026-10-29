// A1's message slider (board MemberAssets-ley3, notes page-member "Messages slider"): the dots on top, the cards
// swipe sideways and snap, one card per message, only the cards that apply, in priority order:
// repay your crop share > invest (until 600) > withdrawal on its way.
import { useRef, useState } from 'react';
import { C, FONT, R, SHADOW } from './tokens';
import { MarkTile, RepayTile } from './icons';

export const card = { flex: '0 0 calc(100% - 16px)', scrollSnapAlign: 'center', scrollSnapStop: 'always', background: C.ink, borderRadius: R.card,
  boxShadow: SHADOW, padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: FONT, color: C.text };
export const head = { fontSize: 16, fontWeight: 700, lineHeight: 1.3 };
export const big = { fontSize: 32, fontWeight: 700, lineHeight: 1.2 };
export const small = { fontSize: 14, lineHeight: 1.5 };
const inr = (n) => `₹${Math.floor(n).toLocaleString('en-IN')}`;
const MINIMUM = 600;   // notes page-member "Invest rule": at least 600 before crop share cash is paid out

export function Bar({ pct, label, color = C.accent }) {
  return (
    <div role="img" aria-label={label} style={{ height: 8, borderRadius: 4, background: C.raised, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} />
    </div>
  );
}

export function Steps({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', ...small }}>
          <span aria-hidden="true" style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ width: 24, height: 24, borderRadius: R.round, background: C.raised, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          </span>
          <span style={{ paddingTop: 1, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

export const Title = ({ Icon, children }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Icon /><span style={head}>{children}</span></div>
);

const qrBtn = { height: 40, borderRadius: 12, border: 0, background: C.accent, color: C.ink, fontWeight: 700, fontFamily: 'inherit',
  fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start', padding: '0 16px' };

/** The member's cards. position: fund_core.position (7 decimals) or undefined; loans: the drawn, open loans;
 *  onRepayQr(token): that crop share's QR for the leader's Repay scan (24 Oct). */
export function memberSlides({ position, positionKnown, loans = [], now = Date.now() / 1000, onRepayQr, index, onWithdrawal, leader = false }) {
  const out = [];
  for (const l of loans) {
    const total = l.principal + l.interest;
    const left = Math.max(0, total - l.paid);
    if (left <= 0) continue;
    out.push(
      <section key={`repay-${l.id}`} aria-label="Repay your share" style={card}>
        <Title Icon={RepayTile}>Repay your {l.label} share</Title>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={big}>{inr(left)}</span>
          <span style={{ ...small, color: C.muted, textAlign: 'right' }}>left{l.due ? ` · due end of ${new Date(l.due * 1000).toLocaleDateString('en-GB', { month: 'short' })}` : ''}</span>
        </div>
        <Bar pct={total ? (100 * l.paid) / total : 0} label={`${Math.round(total ? (100 * l.paid) / total : 0)}% repaid`} />
        <Steps items={['Go to your union office with the cash.', (
          <>
            <span>Give it to your union leader and show your QR code.</span>
            {onRepayQr && <button type="button" style={qrBtn} onClick={() => onRepayQr(l.id)}>Show your QR</button>}
          </>
        ), 'The leader scans it. The amount left updates here.']} />
      </section>,
    );
  }
  const invested = position ? Number(position.invested) / 1e7 : 0;
  if (positionKnown && invested < MINIMUM) {
    out.push(
      <section key="invest" aria-label="Invest in your union" style={card}>
        <Title Icon={MarkTile}>Invest at least ₹{MINIMUM} in your union</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...small }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted }}>Invested</span><span style={{ fontWeight: 700 }}>₹{Math.floor(invested)} of ₹{MINIMUM}</span>
          </div>
          <Bar pct={(100 * invested) / MINIMUM} label={`${Math.floor(invested)} of ${MINIMUM} invested`} />
        </div>
        <Steps items={[`Go to your union office with ₹${MINIMUM} in cash.`, 'Give the cash to your union leader and show your QR code.', 'The leader scans it. Your investment shows up here.']} />
      </section>,
    );
  }
  // Her withdrawal (25 Oct): the cash is picked up at the union office, never paid to her wallet as nIN. On its way:
  // the amount, the days left and the day it is ready; ready: the steps at the office and her QR to collect it.
  const req = position ? Number(position.request_ts || 0) : 0;
  const pendingShares = position ? BigInt(position.pending_shares ?? 0) : 0n;
  const claimableShares = position ? BigInt(position.claimable_shares ?? 0) : 0n;
  if (pendingShares > 0n || claimableShares > 0n) {
    const readyAt = req + 14 * 86400;
    const isReady = claimableShares > 0n || (req > 0 && readyAt <= now);
    const days = Math.max(0, Math.ceil((readyAt - now) / 86400));
    const value = index ? Number(((pendingShares + claimableShares) * index) / 10n ** 27n) / 1e7 : null;
    const when = new Date(readyAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    out.push(isReady ? (
      <section key="withdraw" aria-label="Withdrawal ready" style={card}>
        <Title Icon={MarkTile}>Your withdrawal is ready</Title>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={big}>{value != null ? inr(Math.floor(value)) : '…'}</span>
          <span style={{ ...small, color: C.muted, textAlign: 'right' }}>{leader ? 'to your wallet' : 'in cash at the office'}</span>
        </div>
        {leader ? null : <Steps items={['Go to your union office.', (
          <>
            <span>Your leader hands you the cash. Then show your QR code.</span>
            {onWithdrawal && <button type="button" style={qrBtn} onClick={onWithdrawal}>Show your QR</button>}
          </>
        ), 'The leader scans it. Your investment updates here.']} />}
      </section>
    ) : (
      <section key="withdraw" aria-label="Withdrawal on its way" style={card}>
        <Title Icon={MarkTile}>Your withdrawal is on its way</Title>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={big}>{days} {days === 1 ? 'day' : 'days'}</span>
          <span style={{ ...small, color: C.muted, textAlign: 'right' }}>{value != null ? `${inr(Math.floor(value))} · ` : ''}ready on {when}</span>
        </div>
        <Bar pct={(100 * (14 - days)) / 14} label={`Day ${14 - days} of 14`} />
        <span style={{ ...small, color: C.muted }}>{leader ? `It arrives in your wallet from ${when}.` : `Pick it up in cash at your union office from ${when}.`}</span>
      </section>
    ));
  }
  return out;
}

export default function MessageSlider({ slides }) {
  const ref = useRef(null);
  const [at, setAt] = useState(0);
  if (!slides.length) return null;
  const go = (n) => { const el = ref.current; if (el) el.scrollTo({ left: n * (el.clientWidth - 8), behavior: 'smooth' }); setAt(n); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 -8px 16px' }}>
      {slides.length > 1 && (
        <div role="tablist" aria-label="Messages" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, height: 20 }}>
          {slides.map((sl, n) => (
            <button key={sl.key} type="button" aria-label={`Message ${n + 1} of ${slides.length}`} aria-current={n === at ? 'true' : 'false'} onClick={() => go(n)}
              style={{ width: 24, height: 24, border: 0, padding: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: R.round, background: n === at ? C.accent : '#475569' }} />
            </button>
          ))}
        </div>
      )}
      <div ref={ref} aria-roledescription="carousel" className="nila-slider"
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth - 8))); }}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPadding: '0 8px',
          padding: '0 8px 12px', boxSizing: 'border-box', scrollbarWidth: 'none' }}>
        <style>{'.nila-slider::-webkit-scrollbar{display:none}'}</style>
        {slides}
      </div>
    </div>
  );
}
