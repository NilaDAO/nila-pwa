// H1 (board LeaderOrders): the Harvests tab, every crop share of the union by crop and harvest, with the crop's price
// (Update: a leader sets it on Polygon, #price). H2 (board LeaderHarvestCal): one harvest group on the map, its crop
// shares, what is harvested and late, the estimated value. From the members list kept on the phone (25 Oct).
// DEVIATIONS: no calendar view (H1a) and no selling yet (Buyer "Not sold", no #sold / H2a; open Q2, X6, O8); the
// harvested dots are the harvests the oracle reported for financed shares (fund_core maturity), so a share without a
// loan has none and is never late. The quantities are the plan's (open O8: phenology, weighing or the buyer's weight).
import { useMemo, useState } from 'react';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon, ChevronIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import { SkeletonRows } from '../shell/Skeleton';
import { Primary, inr } from '../plan/ui';
import { Stepper } from '../loan/AssetParts';
import { usePlanClient } from '../plan/hooks';
import { useFxRate } from '../shell/UsdcAsset';
import { useLeaderMap } from './unionMap';
import { useUnionMembers, useUnionShares } from './unionMembers';
import { harvestGroups, unitOf, useCropBatches, useSetPrice } from './harvestData';

const DAY = 86400;
const card = { background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 };
const chip = { flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700, background: C.raised, color: C.muted };
const sub = { color: C.muted, fontSize: 14 };
const qty = (kg, u) => `${Math.round((kg / u.per) * 10) / 10} ${u.short}`;
const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function useHarvests() {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const shares = useUnionShares(api);
  const batches = useCropBatches();
  const fx = useFxRate().data;
  const groups = useMemo(() => harvestGroups(members.data, shares.data), [members.data, shares.data]);
  // The crop's rupees per kg: its batch price on Polygon at today's rate, else the catalogue's until a leader sets one.
  const priceOf = (crop) => {
    const b = (batches.data || []).find((x) => x.crop === crop);
    if (b?.usdtPerKg > 0 && fx > 0) return { inrPerKg: b.usdtPerKg * fx, set: true, batch: b.batch };
    return { inrPerKg: b?.catalogueInrPerKg || 0, set: false, batch: b?.batch };
  };
  return { groups, priceOf, fx, loading: !members.data || !shares.data, refetch: () => { shares.refetch(); batches.refetch(); } };
}

function Head() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <RoundButton label="History" onClick={() => { window.location.hash = '#/history'; }}><HistoryIcon color={C.text} /></RoundButton>
      <LeaderTasksButton onClick={() => { window.location.hash = '#/tasks'; }} />
      <SettingsButton onClick={() => { window.location.hash = '#/settings'; }} />
    </div>
  );
}

function PriceEditor({ crop, price, fx, onClose }) {
  const u = unitOf(crop.crop);
  const [v, setV] = useState(Math.round(price.inrPerKg * u.per) || 0);
  const { state, set } = useSetPrice();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Stepper value={v} set={setV} step={u.per === 1000 ? 50 : 10} min={0} max={1_000_000} unit={`₹ /${u.name}`} label={`Price per ${u.name}`} />
      <Primary disabled={state.status === 'busy' || !price.batch || !(fx > 0) || v <= 0}
        onClick={async () => { if (await set(price.batch, v / u.per, fx)) onClose(); }}>
        {state.status === 'busy' ? 'Setting the price…' : `Set ${inr(v)} /${u.name}`}
      </Primary>
      {!price.batch && <span style={{ ...sub, color: C.coral }}>This crop has no open batch on Polygon yet.</span>}
      {!(fx > 0) && <span style={{ ...sub, color: C.coral }}>No exchange rate today: the price cannot be set now.</span>}
      {state.status === 'failed' && <span style={{ ...sub, color: C.coral }}>{state.error}</span>}
    </div>
  );
}

/** H1: the Harvests tab. */
export function HarvestList({ go }) {
  const { map } = useLeaderMap('harvests');
  const { groups, priceOf, fx, loading, refetch } = useHarvests();
  const [edit, setEdit] = useState();
  const value = groups.reduce((t, c) => t + c.groups.reduce((a, g) => a + g.shares.reduce((b, x) => b + (x.kg || 0), 0), 0) * priceOf(c.crop).inrPerKg, 0);
  return (
    <MapCard head={<Head />} map={map} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ ...card, padding: '18px 22px', gap: 4, alignItems: 'center', textAlign: 'center' }} aria-label="Crop shares value">
          <div style={{ color: C.muted }}>Crop shares value</div>
          <div style={{ fontSize: 32, lineHeight: 1.2, fontWeight: 700 }}>{loading ? '…' : inr(value)}</div>
        </section>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <RoundButton label="Refresh" onClick={refetch}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
          </RoundButton>
        </div>
        {loading && <section style={card}><SkeletonRows rows={4} /></section>}
        {!loading && !groups.length && <section style={card}><span style={sub}>No crop shares with a harvest ahead.</span></section>}
        {groups.map((c) => {
          const u = unitOf(c.crop);
          const p = priceOf(c.crop);
          const open = edit === c.crop;
          return (
            <section key={c.crop} style={card} aria-label={c.name}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: R.round, border: `3px solid ${c.colour || C.accent}`, boxSizing: 'border-box', background: `${c.colour || C.accent}55` }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                  <span style={sub}>
                    {p.inrPerKg ? `${inr(p.inrPerKg * u.per)} /${u.name}` : 'No price yet'}{!p.set && p.inrPerKg ? ' (catalogue)' : ''} ·{' '}
                    <button type="button" onClick={() => setEdit(open ? undefined : c.crop)} style={{ border: 0, background: 'none', padding: 0, color: C.accent, fontWeight: 700, fontFamily: FONT, fontSize: 14, cursor: 'pointer' }}>
                      {open ? 'Close' : 'Update'}
                    </button>
                  </span>
                </div>
              </div>
              {open && <PriceEditor crop={c} price={p} fx={fx} onClose={() => setEdit(undefined)} />}
              {c.groups.map((g) => {
                const late = g.shares.filter((x) => x.late).length;
                const kg = g.shares.reduce((t, x) => t + (x.kg || 0), 0);
                return (
                  <button key={g.key} type="button" onClick={() => go(`harvests/${g.key}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 0,
                    borderTop: `1px solid ${C.raised}`, background: 'none', padding: '12px 0 0', color: C.text, fontFamily: FONT, textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 700 }}>{g.label}</span>
                      <span style={sub}>{g.shares.length} crop share{g.shares.length === 1 ? '' : 's'} · {qty(kg, u)}</span>
                      {late > 0 && <span style={{ ...sub, color: C.coral }}>{late} harvest{late === 1 ? '' : 's'} late</span>}
                    </span>
                    <span style={chip}>Not sold</span>
                    <ChevronIcon color={C.muted} />
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </MapCard>
  );
}

/** H2: one harvest group on the map. */
export function HarvestGroup({ id, go }) {
  const { map } = useLeaderMap('harvests');
  const { groups, priceOf, loading } = useHarvests();
  const [open, setOpen] = useState(true);
  const c = groups.find((x) => x.groups.some((g) => g.key === id));
  const g = c?.groups.find((x) => x.key === id);
  const back = () => go('harvests');
  if (loading || !g) {
    return (
      <MapCard map={map} header={{ title: 'Harvest', onBack: back }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
        <section style={card}>{loading ? <SkeletonRows rows={6} /> : <span style={sub}>This harvest is not in the list any more.</span>}</section>
      </MapCard>
    );
  }
  const u = unitOf(c.crop);
  const p = priceOf(c.crop);
  const now = Date.now() / 1000;
  const kg = g.shares.reduce((t, x) => t + (x.kg || 0), 0);
  const done = g.shares.filter((x) => x.harvested);
  const late = g.shares.filter((x) => x.late);
  const first = Math.min(...g.shares.map((x) => x.planned));
  const last = Math.max(...g.shares.map((x) => x.planned));
  // The timeline: from a week before the first planned harvest to a week after the last one or today.
  const t0 = first - 7 * DAY; const t1 = Math.max(last, now) + 7 * DAY;
  const W = 120; const x = (t) => Math.max(0, Math.min(W, ((t - t0) / (t1 - t0)) * W));
  const rows = [...g.shares].sort((a, b) => (b.late - a.late) || (a.planned - b.planned));
  const kv = (k, v, tone) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: C.muted }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right', color: tone || C.text }}>{v}</span>
    </div>
  );
  return (
    <MapCard map={map} header={{ title: c.name, onBack: back, onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <section style={card} aria-label={`${c.name} harvest`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{c.name}</h2>
          <span style={{ color: C.muted }}>{first === last ? day(first) : `${day(first)} – ${day(last)}`} {new Date(last * 1000).getUTCFullYear()}</span>
        </div>
        {kv('Crop shares', `${g.shares.length} · ${qty(kg, u)}`)}
        {kv('Harvested', `${done.length} of ${g.shares.length} · ${qty(done.reduce((t, s) => t + (s.kg || 0), 0), u)}`)}
        {late.length > 0 && kv('Late', `${late.length} · ${late.slice(0, 3).map((s) => s.who).join(', ')}${late.length > 3 ? '…' : ''}`, C.coral)}
        <div style={{ borderTop: `1px solid ${C.raised}` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 700 }}>Buyer</span><span style={{ color: C.muted }}>Not sold</span></div>
        {kv('Est. value', p.inrPerKg ? `${inr(kg * p.inrPerKg)} at ${inr(p.inrPerKg * u.per)} /${u.short}` : 'No price yet')}
        <div style={{ borderTop: `1px solid ${C.raised}` }} />
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ display: 'flex', justifyContent: 'space-between', border: 0, background: 'none', padding: 0, color: C.text, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
          <span>{g.shares.length} crop share{g.shares.length === 1 ? '' : 's'}</span><span aria-hidden="true">{open ? '⌃' : '⌄'}</span>
        </button>
        {open && rows.map((s) => {
          const lateDays = Math.floor((now - s.planned) / DAY);
          return (
            <button key={s.token} type="button" onClick={() => s.route && go(`members/${s.route}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 0, borderTop: `1px solid ${C.raised}`,
              background: 'none', padding: '10px 0 0', color: C.text, fontFamily: FONT, textAlign: 'left', cursor: s.route ? 'pointer' : 'default' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.who}</span>
                <span style={{ ...sub, color: s.late ? C.coral : C.muted }}>
                  {s.harvested ? `${day(s.harvested)} · ${qty(s.kg || 0, u)}` : s.late ? `${lateDays} day${lateDays === 1 ? '' : 's'} late` : `Planned ${day(s.planned)} · ${qty(s.kg || 0, u)}`}
                </span>
              </span>
              <svg width={W} height="20" viewBox={`0 0 ${W} 20`} aria-hidden="true" style={{ flexShrink: 0 }}>
                <line x1="0" x2={W} y1="10" y2="10" stroke={C.raised} strokeWidth="1" />
                <rect x={x(s.planned - 7 * DAY)} y="4" width={Math.max(4, x(s.planned + 7 * DAY) - x(s.planned - 7 * DAY))} height="12" rx="3" fill={C.raised} />
                <line x1={x(now)} x2={x(now)} y1="1" y2="19" stroke={C.text} strokeWidth="1.5" />
                {s.harvested ? <circle cx={x(s.harvested)} cy="10" r="5" fill={C.accent} />
                  : s.late ? <><line x1={x(s.planned)} x2={x(now)} y1="10" y2="10" stroke={C.coral} strokeWidth="2" /><circle cx={x(s.planned)} cy="10" r="4.5" fill={C.ink} stroke={C.coral} strokeWidth="2" /></>
                    : <circle cx={x(s.planned)} cy="10" r="4.5" fill={C.ink} stroke={C.muted} strokeWidth="2" />}
              </svg>
            </button>
          );
        })}
      </section>
    </MapCard>
  );
}
