// A1L (board MemberAssetsLeader = A1 with leader on): the cash and LP cards in A1's one message slider and the
// "Union" rows. Values from the contracts (useUnionCash, useUnionOffers). P10a.
// DESIGN GAPs: LP names (the node has none) are short wallet addresses; the member slides (repay, invest,
// withdrawal) and the Tasks badge come with their own steps.
import { useEffect, useState } from 'react';
import { Bar, Steps, Title, big, card, small } from '../shell/MessageSlider';
import { useMachines } from '../machine/hooks';
import { MachineryTile } from '../shell/icons';
import { timeLeft } from '../shell/timeLeft';
import { useUnionOffers } from '../anchor/hooks';
import { C, FONT, R } from '../shell/tokens';
import { useUnionCash } from './hooks';

const inr = (n) => `₹${Math.floor(n).toLocaleString('en-IN')}`;
const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
const WEEK = 7 * 86400;
const leftText = (ts, now) => (ts - now <= 0 ? 'covered by the treasury' : `${timeLeft(ts - now)} left`);
const expiresIn = (ts, now) => { const s = ts - now; return s < 86400 ? `${Math.max(1, Math.ceil(s / 3600))} h` : `${Math.ceil(s / 86400)} d`; };

function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() / 1000), 60_000); return () => clearInterval(t); }, []);
  return now;
}

const secondary = { height: 44, borderRadius: R.button, border: 0, padding: '0 24px', background: C.raised, color: C.text, fontWeight: 700, fontFamily: FONT, fontSize: 14, cursor: 'pointer' };
const primary = { ...secondary, background: C.accent, color: C.ink };
// The board's round icon badges: coral for the cash card, raised for LP requests.
const badge = (bg, stroke, d) => () => (
  <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: R.round, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  </span>
);
const CashBadge = badge(C.coral, C.ink, <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>);
const LpBadge = badge(C.raised, C.text, <><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></>);

/** The leader's cards for A1's one message slider (board MemberAssets-ley3, leader on): the cash to lend out or settle
 *  and the LP requests, first in the slider; nothing when there is no cash at hand and no LP offer (22 Oct: one slider
 *  for member and leader). */
export function useLeaderSlides({ on = true, onSettle, onScanLp, onMachine }) {
  const cash = useUnionCash({ on }).data;
  const machines = useMachines({ on });
  const offers = useUnionOffers({ on }).data || [];
  const now = useNow();
  const slides = [];
  if (!on) return slides;
  if (cash && cash.atHand > 0) {
    const first = cash.escrows.find((e) => e.remaining > 0);
    const left = first ? first.expires - now : 0;
    const day = first ? Math.min(7, Math.max(1, Math.ceil((WEEK - left) / 86400))) : 0;
    slides.push(
      <section key="cash" aria-label="Lend out or settle your cash" style={card}>
        <Title Icon={CashBadge}>Lend out or settle your cash</Title>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={big}>{inr(cash.atHand)}</span>
          {first && <span style={{ ...small, color: C.coral, fontWeight: 700, textAlign: 'right' }}>{leftText(first.expires, now)}</span>}
        </div>
        {/* The 7-day window filling up (the board: "Day N of 7"). */}
        {first && <Bar pct={(100 * (WEEK - left)) / WEEK} label={`Day ${day} of 7`} color={C.coral} />}
        <span style={{ ...small, color: C.muted }}>After 7 days the treasury covers it.</span>
        <button type="button" style={secondary} onClick={onSettle}>Lend out or settle</button>
      </section>,
    );
  }
  const live = offers.filter((o) => o.state <= 1 && o.expires > now);
  // One slide per LP offer (25 Oct), explained in steps as the repay card: who does what next; an LP who accepted is
  // "on the way" and the leader's step is the scan. Accepted offers first.
  for (const o of [...live].sort((a, b) => b.state - a.state)) {
    const bring = o.kind === 0;
    const here = o.state === 1;
    const steps = bring
      ? [here ? `LP ${short(o.lp)} accepted: they bring ${inr(o.inr)} to the office.` : `An LP accepts it on their phone (expires in ${expiresIn(o.expires, now)}).`,
        'Take the cash, then scan the LP\'s code.',
        'The union\'s USDC pays the LP. The cash is at the office for the loan.']
      : [here ? `LP ${short(o.lp)} accepted: they come to collect ${inr(o.inr)}.` : `An LP accepts it on their phone (expires in ${expiresIn(o.expires, now)}).`,
        'Scan the LP\'s code, then hand over the cash.',
        'The LP\'s USDC goes to the union; the cash at the office goes down.'];
    // Step 2 carries the scan (25 Oct, as the repay card's "Show your QR"); the state is the title.
    steps[1] = (
      <>
        <span>{steps[1]}</span>
        <button type="button" style={{ ...(here ? primary : secondary), alignSelf: 'flex-start', height: 40, padding: '0 16px', width: 'auto' }} onClick={onScanLp}>Scan the LP's code</button>
      </>
    );
    const verb = bring ? 'bring' : 'collect';
    slides.push(
      <section key={`lp-${o.id}`} aria-label="LP offer" style={card}>
        <Title Icon={LpBadge}>{here ? `LP ${short(o.lp)} comes to ${verb} ${inr(o.inr)}` : `Waiting for an LP to ${verb} ${inr(o.inr)}`}</Title>
        <Steps items={steps} />
      </section>,
    );
  }
  // No machine in the union yet (22 Oct): how vouchers start, in steps (as the invest card), with the L13 task.
  if (machines.isSuccess && !machines.data.length) {
    slides.push(
      <section key="machine" aria-label="Register a machine" style={card}>
        <Title Icon={MachineryTile}>Register a machine</Title>
        <Steps items={['Go to Tasks and register a machine.', 'New crop plans then get machine vouchers.', 'Members hire the machine by the hour with their vouchers.']} />
        <button type="button" style={secondary} onClick={onMachine}>Register a machine</button>
      </section>,
    );
  }
  return slides;
}

/** The "Union" rows of the Assets card. */
export function UnionRows({ Row, Icon, onTreasury, onSettle }) {
  const cash = useUnionCash().data;
  const now = useNow();
  if (!cash) return null;
  const first = cash.escrows.find((e) => e.remaining > 0);
  return (
    <>
      <span style={{ fontWeight: 700, color: C.muted }}>Union</span>
      <Row label="Open union treasury" icon={<Icon />} title="Union treasury" sub={`${inr(cash.free)} free to cash in`}
        value={inr(cash.treasury)} valueSub={cash.overdue > 0 ? 'On hold' : 'Lending open'} onClick={onTreasury} />
      <Row label="Open cash" icon={<Icon />} title="Cash" sub="Lend out or settle" value={inr(cash.atHand)}
        valueSub={first ? leftText(first.expires, now) : '—'} onClick={onSettle} />
    </>
  );
}
