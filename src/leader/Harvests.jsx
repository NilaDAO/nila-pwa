// H1 (board LeaderOrders): the Harvests tab, every crop share of the union by crop and harvest, with the crop's price
// (Update: a leader sets it on Polygon, #price). H2 (board LeaderHarvestCal): one harvest group on the map, its crop
// shares, what is harvested and late, the estimated value. From the members list kept on the phone (25 Oct).
// H1a (board LeaderOrdersCal): the same groups as a calendar, a column per month. DEVIATIONS: no selling yet (Buyer "Not sold", no #sold / H2a; open Q2, X6, O8); the
// harvested dots are the harvests the oracle reported for financed shares (fund_core maturity), so a share without a
// loan has none and is never late. The quantities are the plan's (open O8: phenology, weighing or the buyer's weight).
import { useMemo, useState } from 'react';
import { C, FONT, R, SHADOW } from '../shell/tokens';
import MapCard from '../shell/MapCard';
import RoundButton, { SettingsButton } from '../shell/RoundButton';
import { HistoryIcon, ChevronIcon } from '../shell/icons';
import { LeaderTasksButton } from '../shell/A1';
import { SkeletonRows } from '../shell/Skeleton';
import Segmented from '../shell/Segmented';
import { Primary, inr } from '../plan/ui';
import { Stepper } from '../loan/AssetParts';
import { usePlanClient } from '../plan/hooks';
import { unionCentre, useLeaderMap } from './unionMap';
import AreaMap from '../plan/AreaMap';
import { useUnionMembers, useUnionShares } from './unionMembers';
import { harvestGroups, unitOf, useCropPrices, useSetPrice } from './harvestData';

const DAY = 86400;
const card = { background: C.ink, borderRadius: R.card, boxShadow: SHADOW, padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 };
const chip = { flexShrink: 0, height: 24, borderRadius: R.round, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 700, background: C.raised, color: C.muted };
const sub = { color: C.muted, fontSize: 14 };
const qty = (kg, u) => `${Math.round((kg / u.per) * 10) / 10} ${u.short}`;
const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** H2's map (25 Oct): only this group's crop shares, each by the areas it grows on (from the member's field record),
 *  the member's name on the first; a member without a record shows the property. An AreaMap element itself, not a
 *  component around it: the map stage draws the element's own props (record, labels, chip). */
function groupMap(group, members) {
  const byAddr = Object.fromEntries((members || []).map((m) => [m.address, m]));
  const zones = []; const labels = {};
  for (const s of group?.shares || []) {
    const m = byAddr[s.member];
    if (!m) continue;
    const parts = (m.record?.zones || []).filter((z) => (s.zones || []).includes(z.zone_id) && z.geometry);
    const shapes = parts.length ? parts.map((z) => z.geometry) : m.places.map((p) => p.geometry);
    shapes.forEach((geometry, i) => {
      const id = `${s.token}#${i}`;
      zones.push({ zone_id: id, geometry });
      labels[id] = i ? { hide: true, colour: s.late ? C.coral : s.harvested ? C.accent : '#ffffff' }
        : { text: s.who, sub: s.harvested ? 'Harvested' : s.late ? 'Late' : undefined, colour: s.late ? C.coral : s.harvested ? C.accent : '#ffffff' };
    });
  }
  const chip = `${group?.shares?.length || 0} crop share${group?.shares?.length === 1 ? '' : 's'}`;
  return <AreaMap record={zones.length ? { zones } : null} center={zones.length ? undefined : unionCentre(members)} labels={labels} fitSide={90} fitBottom={Math.round(window.innerHeight * 0.5)} chip={chip}
    onSelect={(z) => { const t = z && String(z).split('#')[0]; const x = group?.shares?.find((y) => y.token === t); if (x?.route) window.location.hash = `#/members/${x.route}`; }} />;
}

function useHarvests() {
  const api = usePlanClient();
  const members = useUnionMembers(api);
  const shares = useUnionShares(api);
  const prices = useCropPrices();
  const groups = useMemo(() => harvestGroups(members.data, shares.data), [members.data, shares.data]);
  // The crop's rupees per kg: the union's local price on Stellar, else the catalogue's until a leader sets one.
  const priceOf = (crop) => {
    const b = (prices.data || []).find((x) => x.crop === crop);
    if (b?.inrPerKg > 0) return { inrPerKg: b.inrPerKg, set: true, family: b.code };
    return { inrPerKg: b?.catalogueInrPerKg || 0, set: false, family: b?.code };
  };
  return { groups, priceOf, members: members.data, loading: !members.data || !shares.data, refetch: () => { shares.refetch(); prices.refetch(); } };
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

function PriceEditor({ crop, price, onClose }) {
  const u = unitOf(crop.crop);
  const [v, setV] = useState(Math.round(price.inrPerKg * u.per) || 0);
  const { state, set } = useSetPrice();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Stepper value={v} set={setV} step={u.per === 1000 ? 50 : 10} min={0} max={1_000_000} unit={`₹ /${u.name}`} label={`Price per ${u.name}`} />
      <Primary disabled={state.status === 'busy' || !price.family || v <= 0}
        onClick={async () => { if (await set(price.family, v / u.per)) onClose(); }}>
        {state.status === 'busy' ? 'Setting the price…' : `Set ${inr(v)} /${u.name}`}
      </Primary>
      {!price.family && <span style={{ ...sub, color: C.coral }}>This crop has no crop code yet.</span>}
      {state.status === 'failed' && <span style={{ ...sub, color: C.coral }}>{state.error}</span>}
    </div>
  );
}

const ListIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const CalIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
const VIEW_KEY = 'nila.harvests.view';

/** H1a: the harvest groups on a month calendar; the line is today. */
function Calendar({ groups, go }) {
  const all = groups.flatMap((c) => c.groups.map((g) => ({ ...g, name: c.name, colour: c.colour })))
    .sort((a, b) => a.at - b.at);
  if (!all.length) return null;
  const now = Date.now() / 1000;
  const m0 = new Date(Math.min(all[0].at, now) * 1000); m0.setUTCDate(1);
  const end = new Date(all[all.length - 1].at * 1000);
  const months = [];
  for (let d = new Date(m0); d <= end && months.length < 12; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(new Date(d));
  if (!months.length) months.push(new Date(m0));
  const t0 = months[0].getTime() / 1000;
  const last = new Date(months[months.length - 1]); last.setUTCMonth(last.getUTCMonth() + 1);
  const t1 = last.getTime() / 1000;
  const W = 160; const x = (t) => Math.max(0, Math.min(W, ((t - t0) / (t1 - t0)) * W));
  const mon = (d) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return (
    <section style={card} aria-label="Harvest groups">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Harvest groups</h2>
        <span style={sub}>{mon(months[0])} – {mon(months[months.length - 1])} · line = today</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontWeight: 700, color: C.muted }}>
        <span style={{ flex: 1 }}>Group</span>
        <svg width={W} height="14" viewBox={`0 0 ${W} 14`} aria-hidden="true" style={{ flexShrink: 0 }}>
          {months.map((d) => <text key={d.getTime()} x={x(d.getTime() / 1000) + (W / months.length) / 2} y="11" textAnchor="middle" fontSize="11" fill={C.muted} fontWeight="700">{d.toLocaleDateString('en-GB', { month: 'narrow', timeZone: 'UTC' })}</text>)}
        </svg>
        <span style={{ width: 20 }} />
      </div>
      {all.map((g) => {
        const late = g.shares.filter((s) => s.late).length;
        return (
          <button key={g.key} type="button" onClick={() => go(`harvests/${g.key}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 0,
            borderTop: `1px solid ${C.raised}`, background: 'none', padding: '12px 0 0', color: C.text, fontFamily: FONT, textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 700 }}>{g.name}</span>
              <span style={sub}>{g.short} · not sold</span>
              {late > 0 && <span style={{ ...sub, color: C.coral }}>{late} harvest{late === 1 ? '' : 's'} late</span>}
            </span>
            <svg width={W} height="28" viewBox={`0 0 ${W} 28`} aria-hidden="true" style={{ flexShrink: 0 }}>
              {months.map((d) => <line key={d.getTime()} x1={x(d.getTime() / 1000)} x2={x(d.getTime() / 1000)} y1="4" y2="24" stroke={C.raised} strokeWidth="1" />)}
              <rect x={x(g.at) - 4} y="8" width="8" height="12" rx="4" fill={g.colour || C.accent} />
              <line x1={x(now)} x2={x(now)} y1="0" y2="28" stroke={C.text} strokeWidth="2" />
            </svg>
            <ChevronIcon color={C.muted} />
          </button>
        );
      })}
    </section>
  );
}

/** H1: the Harvests tab. The map shows every member's property (25 Oct). */
export function HarvestList({ go }) {
  const { map } = useLeaderMap('members');
  const { groups, priceOf, loading, refetch } = useHarvests();
  const [edit, setEdit] = useState();
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch { return 'list'; } });
  const pickView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const value = groups.reduce((t, c) => t + c.groups.reduce((a, g) => a + g.shares.reduce((b, x) => b + (x.kg || 0), 0), 0) * priceOf(c.crop).inrPerKg, 0);
  return (
    <MapCard head={<Head />} map={map} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section style={{ ...card, padding: '18px 22px', gap: 4, alignItems: 'center', textAlign: 'center' }} aria-label="Crop shares value">
          <div style={{ color: C.muted }}>Crop shares value</div>
          <div style={{ fontSize: 32, lineHeight: 1.2, fontWeight: 700 }}>{loading ? '…' : inr(value)}</div>
          {/* Selling is not built yet (Q2, X6, O8): nothing is sold, so ₹0. */}
          <div style={{ color: C.muted }}>+ {inr(0)} sold</div>
        </section>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
          <Segmented icon width="hug" label="List or calendar" value={view} onChange={pickView}
            options={[['list', <ListIcon key="l" />, 'List'], ['calendar', <CalIcon key="c" />, 'Calendar']]} />
          <RoundButton label="Refresh" onClick={refetch}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
          </RoundButton>
        </div>
        {loading && <section style={card}><SkeletonRows rows={4} /></section>}
        {!loading && !groups.length && <section style={card}><span style={sub}>No crop shares with a harvest ahead.</span></section>}
        {view === 'calendar' && <Calendar groups={groups} go={go} />}
        {view === 'list' && groups.map((c) => {
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
              {open && <PriceEditor crop={c} price={p} onClose={() => setEdit(undefined)} />}
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
  const { groups, priceOf, loading, members } = useHarvests();
  const [open, setOpen] = useState(true);
  const c = groups.find((x) => x.groups.some((g) => g.key === id));
  const g = c?.groups.find((x) => x.key === id);
  const back = () => go('harvests');
  const map = groupMap(g, members);
  if (loading || !g) {
    return (
      <MapCard map={map} full={false} top={Math.round(window.innerHeight * 0.5)} header={{ title: 'Harvest', onBack: back }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
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
    <MapCard map={map} full={false} top={Math.round(window.innerHeight * 0.5)} header={{ title: c.name, onBack: back, onSettings: () => go('settings') }} style={{ padding: '0 8px', fontFamily: FONT, color: C.text }}>
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
