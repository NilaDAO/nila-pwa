// G1 (board LeaderGrowers): the union's growers for the leader. Membership is holding a land title her union minted
// (LOAN_RULES "Membership"); there is no member list on chain, so the list is built from what the leader can read:
//  - the union's titles on Stellar (node GET /stellar/union/titles: each checked on-chain; holder, farm, record hash),
//  - keypad members the union added (GET /keypad/members, L14) and the open border jobs (GET /border/jobs: name, points),
//  - the approved crop plans of lands she leads, their crop shares and each share's state on Stellar,
//  - the node's union loan list (O15): what is left to repay and whether it is overdue.
// The map (G1 is a map card) draws every property: her field record's areas per title, and the points of an open
// border job (a small square each, as no shape is accepted yet).
// DESIGN GAPs: no contact book (names from the title's farm or the border job, else "Land <id>" or a short address);
// no "Sold" (no sales yet); crop health (useCropHealth) not shown.
import { useQuery } from '@tanstack/react-query';
import { useStellarConfig } from '../stellar/hooks';
import { readContract, sv } from '../stellar/soroban';
import { borderClient } from '../border/api';
import { keypadClient } from '../keypad/api';
import { fromNode } from '../plan/record';
import { useNilaSigner } from '../wallet/signer';
import { rowOf } from '../loan/MyShares';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const FLAG_DRAWN = 8;
const hexOf = (id) => BigInt(id).toString(16).padStart(64, '0');
const short = (g) => (g ? `${g.slice(0, 4)}…${g.slice(-4)}` : '');
// ~25 m square around a sent field point (an open border job has no accepted shape yet).
const square = ({ lat, lng }) => {
  const d = 0.000225; const e = d / Math.cos((lat * Math.PI) / 180);
  return [[lng - e, lat - d], [lng + e, lat - d], [lng + e, lat + d], [lng - e, lat + d], [lng - e, lat - d]];
};
// One property as one geometry: the record's outline, else all its areas together.
const outline = (record) => record?.meta?.geometry?.out
  || { type: 'MultiPolygon', coordinates: (record?.zones || []).flatMap((z) => (z.geometry?.type === 'Polygon' ? [z.geometry.coordinates]
    : z.geometry?.type === 'MultiPolygon' ? z.geometry.coordinates : [])) };

export function useUnionMembers(api) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  return useQuery({
    queryKey: ['stellar', 'unionMembers', cfg?.union], enabled: !!api && !!s?.signHash && !!cfg?.contracts?.fund_core,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const u = sv.address(cfg.union);
      const now = Date.now() / 1000;
      const by = new Map();
      const get = (key) => {
        if (!by.has(key)) by.set(key, { key, address: key.startsWith('G') ? key : '', name: '', phone: '', lands: new Set(), shares: [], loans: [], places: [], note: '' });
        return by.get(key);
      };
      const border = borderClient(s);
      const [titles, keypad, jobs, plans, loanList] = await Promise.all([
        api.unionTitles().then((r) => r.titles || []).catch(() => []),
        keypadClient(s).list().then((r) => r.members || []).catch(() => []),
        border.jobs().then((r) => r || []).catch(() => []),
        api.approvedPlans().then((r) => r.plans || []).catch(() => []),
        api.unionLoans().then((r) => r.loans || []).catch(() => []),
      ]);
      // Titles: the membership, and each property on the map from its field record.
      await Promise.all(titles.map(async (t) => {
        const m = get(t.holder); m.lands.add(t.title_id); m.name = m.name || t.farm || '';
        const record = t.record_hash ? await fromNode(t.record_hash).catch(() => null) : null;
        if (record) { m.places.push({ id: `land-${t.title_id}`, geometry: outline(record) }); if (!m.record) Object.assign(m, { record, recordHash: t.record_hash, titleId: t.title_id }); }
      }));
      for (const k of keypad) {
        const m = get(`keypad:${k.id}`); m.name = m.name || k.name || ''; m.phone = k.phone || '';
        if (!m.lands.size) m.note = k.device ? 'Keypad phone set up' : k.link?.opened ? 'Opened the app link' : 'App link sent';
      }
      await Promise.all(jobs.map(async (j) => {
        if (!j.member) return;
        const m = get(j.member); m.name = m.name || j.farm || j.name || ''; m.job = j.id;
        if (!m.lands.size) m.note = `Fields sent · ${j.fields} field${j.fields === 1 ? '' : 's'} · borders ${j.status === 'minting' ? 'done, title on its way' : 'to check'}`;
        const full = await border.job(j.id).catch(() => null);
        const pts = (full?.job || full)?.fields || [];
        if (!m.places.length && pts.length) {
          m.places.push({ id: `job-${j.id}`, geometry: { type: 'MultiPolygon', coordinates: pts.filter((f) => f.point).map((f) => [square(f.point)]) } });
        }
      }));
      const loans = new Map(loanList.map((l) => [String(l.token_id).toLowerCase().replace(/^0x/, ''), l]));
      for (const p of plans) {
        const { mints } = await api.mintList(p.id).catch(() => ({ mints: [] }));
        const zones = Object.keys(p.plan?.proposal || {}).sort();
        await Promise.all(mints.filter((x) => x.token_id).map(async (x) => {
          const hex = hexOf(x.token_id);
          const ft = await readContract(cfg, 'fund_core', 'food_token', [u, sv.bytes32(hex)]).catch(() => null);
          if (!ft?.member) return;
          const share = (p.plan.shares || []).find((y) => y.key === x.share) || {};
          const r = rowOf({ ...x, share, plan: p }) || {};
          const drawn = !!(Number(ft.loan?.flags ?? 0) & FLAG_DRAWN);
          const m = get(ft.member); m.lands.add(p.land_id); m.plan = m.plan || p;
          m.shares.push({ token: hex, crop: r.name || x.crop.replace(/_/g, ' '), colour: r.colour, area: zones.indexOf(x.zone) + 1,
            harvest: r.harvest, kg: r.kg, from: Number(ft.from_date), drawn, ready: !drawn && Number(ft.from_date) <= now });
        }));
      }
      // Loans: what is left and overdue, on the share it was drawn on (or a row of its own for a loan without a plan here).
      await Promise.all([...loans.entries()].map(async ([hex, l]) => {
        const [g, due] = await Promise.all([
          readContract(cfg, 'fund_core', 'get_loan', [u, sv.bytes32(hex)]).catch(() => null),
          readContract(cfg, 'fund_core', 'due_date', [u, sv.bytes32(hex)]).catch(() => null),
        ]);
        if (!g || g.closed) return;
        const left = n(g.principal) - n(g.principal_paid) + n(g.interest_accrued) - n(g.interest_paid);
        const overdue = !!g.overdue || (Number(due || 0) > 0 && Number(due) < now);
        const m = get(l.borrower);
        const sh = m.shares.find((x) => x.token === hex);
        m.loans.push({ token: hex, left, overdue, due: Number(due || 0), crop: sh?.crop, area: sh?.area });
        if (sh) Object.assign(sh, { left, overdue, drawn: true, ready: false });
        else m.shares.push({ token: hex, crop: 'Loan', left, overdue, drawn: true });
      }));
      return [...by.values()].map((m) => {
        const lands = [...m.lands].sort((a, b) => a - b);
        m.shares.sort((a, b) => String(a.harvest || '').localeCompare(String(b.harvest || '')));
        // The route id (#/members/<id>): her title id, else her account, else her keypad id.
        const route = m.titleId || lands[0] || m.address || `k${m.key.replace(/^keypad:/, '')}`;
        return { ...m, lands, route: String(route), label: m.name || (lands.length ? `Land ${lands.join(', ')}` : m.address ? short(m.address) : m.phone || 'New member') };
      }).sort((a, b) => b.shares.some((x) => x.overdue) - a.shares.some((x) => x.overdue) || a.label.localeCompare(b.label));
    },
  });
}

/** Her wallet QR (A1a: a Stellar address, possibly as a stellar: / web+stellar: URI) → that address. */
export const addressFromQr = (text) => (String(text || '').match(/G[A-Z2-7]{55}/) || [])[0] || '';
