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
import { readContract, readFoodTokens, sv } from '../stellar/soroban';
import { borderClient } from '../border/api';
import { keypadClient } from '../keypad/api';
import { fromNodeCached } from '../plan/record';
import { recordFields, shapeToFields } from '../plan/titleFields';
import { useNilaSigner } from '../wallet/signer';
import { opensOf } from '../loan/MyShares';
import { keptGet, keptPut } from '../shell/kept';

const U = 10_000_000;
const n = (v) => Number(BigInt(v ?? 0)) / U;
const FLAG_OVERDUE = 1;
const FLAG_CLOSED = 4;
const FLAG_DRAWN = 8;
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

// Her land as on her title (24 Oct, the leader's Assets map): the title's fields from its metadata (the node's `shape`),
// else the record's fields or areas.
const addFields = (m, tf) => { if (tf?.fields?.length) m.fields.push(...tf.fields); };

// The list as it was last seen, kept on the phone per account and union (22 Oct): G1 shows it at once on the next open
// and refreshes it in the background. Only the list fields are kept (no field records), so it stays small.
const cacheKey = (acct, union) => `nila.members.${union}.${acct}`;
const KEEP = ['key', 'address', 'name', 'phone', 'lands', 'loans', 'places', 'note', 'job', 'titleId', 'recordHash', 'route', 'label'];
function readKept(acct, union) {
  try { const v = JSON.parse(localStorage.getItem(cacheKey(acct, union)) || 'null'); return Array.isArray(v) ? v : undefined; } catch { return undefined; }
}
// The node's rows as last seen, with the list's change counter (25 Oct), kept in IndexedDB: only rows changed since
// that counter are asked for (GET /stellar/union/members?since=N) and merged in.
const rowsKey = (acct, union) => `members.${union}.${acct}`;
async function nodeRows(api, acct, union) {
  const kept = await keptGet(rowsKey(acct, union));
  const node = await api.unionMembers(kept?.seq).catch(() => null);
  if (!Array.isArray(node?.members)) return kept?.rows;
  let rows;
  if (node.full || !kept) rows = Object.fromEntries(node.members.map((r) => [r.key || r.address, r]));
  else {
    rows = { ...kept.rows };
    for (const r of node.members) rows[r.key || r.address] = r;
    for (const k of node.removed || []) delete rows[k];
  }
  keptPut(rowsKey(acct, union), { seq: node.seq || 0, rows });
  return rows;
}
function keep(acct, union, list) {
  try { localStorage.setItem(cacheKey(acct, union), JSON.stringify(list.map((m) => Object.fromEntries(KEEP.map((k) => [k, m[k]]))))); } catch { /* full or private mode */ }
}

/** Her land titles in order, the route id (#/members/<id>: her title id, else her account, else her keypad id) and
 *  the row's label; overdue members first. */
const finish = (members) => members.map((m) => {
  const lands = [...m.lands].sort((a, b) => a - b);
  const route = m.titleId || lands[0] || m.address || `k${m.key.replace(/^keypad:/, '')}`;
  return { ...m, lands, route: String(route), label: m.name || (lands.length ? `Land ${lands.join(', ')}` : m.address ? short(m.address) : m.phone || 'New member') };
}).sort((a, b) => b.loans.some((x) => x.overdue) - a.loans.some((x) => x.overdue) || a.label.localeCompare(b.label));

/** G1's list (22 Oct, lean): the union's titles, keypad members, open border jobs and the loan list, with each loan's
 *  state from one batched read of its crop share (the loan sits inside it). Crop shares per member are read only on
 *  G2 (useMemberShares), so G1 waits on no mint list and no per-token read. */
export function useUnionMembers(api) {
  const s = useNilaSigner();
  const { data: cfg } = useStellarConfig();
  const acct = s?.stellarAddress || '';
  return useQuery({
    queryKey: ['stellar', 'unionMembers', cfg?.union], enabled: !!api && !!s?.signHash && !!cfg?.contracts?.fund_core,
    staleTime: 2 * 60_000,
    placeholderData: () => (cfg?.union && acct ? readKept(acct, cfg.union) : undefined),
    queryFn: async () => {
      // The node's compact members list (map-centred lane, 23 Oct): one row per member, with its crop shares (25 Oct);
      // the property outlines from the records kept on this phone. Until the node has it (404), the list is built
      // from the lists below. Kept on the phone with its change counter: only changed rows are fetched (25 Oct).
      const rows = await nodeRows(api, acct, cfg.union);
      if (rows) {
        const list = finish(await Promise.all(Object.values(rows).map(async (r) => {
          const m = { key: r.key || r.address, address: r.address || '', name: r.name || '', phone: r.phone || '', lands: new Set(), places: [], fields: [],
            note: r.note || '', job: r.job, nextHarvest: r.next_harvest || null, shareCounts: r.shares || {},
            seq: r.seq || 0, shareList: r.share_list || [],
            loans: (r.loans || []).map((l) => ({ token: String(l.token_id).toLowerCase().replace(/^0x/, '').padStart(64, '0'), left: Number(l.left ?? l.cash ?? 0), overdue: !!l.overdue, due: Number(l.due || 0) })) };
          await Promise.all((r.titles || []).map(async (t) => {
            m.lands.add(t.title_id);
            const record = t.record_hash ? await fromNodeCached(t.record_hash).catch(() => null) : null;
            if (record) { m.places.push({ id: `land-${t.title_id}`, geometry: outline(record) }); if (!m.record) Object.assign(m, { record, recordHash: t.record_hash, titleId: t.title_id }); }
            addFields(m, shapeToFields(t.shape) || recordFields(record));
          }));
          return m;
        })));
        if (acct) keep(acct, cfg.union, list);
        return list;
      }
      const by = new Map();
      const get = (key) => {
        if (!by.has(key)) by.set(key, { key, address: key.startsWith('G') ? key : '', name: '', phone: '', lands: new Set(), loans: [], places: [], fields: [], note: '' });
        return by.get(key);
      };
      const border = borderClient(s);
      const [titles, keypad, jobs, loanList] = await Promise.all([
        api.unionTitles().then((r) => r.titles || []).catch(() => []),
        keypadClient(s).list().then((r) => r.members || []).catch(() => []),
        border.jobs().then((r) => r || []).catch(() => []),
        api.unionLoans().then((r) => r.loans || []).catch(() => []),
      ]);
      const hexes = loanList.map((l) => String(l.token_id).toLowerCase().replace(/^0x/, '').padStart(64, '0'));
      const [, , fts] = await Promise.all([
        // Titles: the membership, and each property on the map from its field record.
        Promise.all(titles.map(async (t) => {
          const m = get(t.holder); m.lands.add(t.title_id); m.name = m.name || t.farm || '';
          const record = t.record_hash ? await fromNodeCached(t.record_hash).catch(() => null) : null;
          if (record) { m.places.push({ id: `land-${t.title_id}`, geometry: outline(record) }); if (!m.record) Object.assign(m, { record, recordHash: t.record_hash, titleId: t.title_id }); }
          addFields(m, shapeToFields(t.shape) || recordFields(record));
        })),
        Promise.all(jobs.map(async (j) => {
          if (!j.member) return;
          const m = get(j.member); m.name = m.name || j.farm || j.name || ''; m.job = j.id;
          if (!m.lands.size) m.note = `Fields sent · ${j.fields} field${j.fields === 1 ? '' : 's'} · borders ${j.status === 'minting' ? 'done, title on its way' : 'to check'}`;
          const full = await border.job(j.id).catch(() => null);
          const pts = (full?.job || full)?.fields || [];
          if (!m.places.length && pts.length) {
            m.places.push({ id: `job-${j.id}`, geometry: { type: 'MultiPolygon', coordinates: pts.filter((f) => f.point).map((f) => [square(f.point)]) } });
          }
        })),
        hexes.length ? readFoodTokens(cfg, cfg.union, hexes).catch(() => ({})) : {},
      ]);
      for (const k of keypad) {
        const m = get(`keypad:${k.id}`); m.name = m.name || k.name || ''; m.phone = k.phone || '';
        if (!m.lands.size) m.note = k.device ? 'Keypad phone set up' : k.link?.opened ? 'Opened the app link' : 'App link sent';
      }
      // Loans: what is left and whether it is overdue, from the loan inside its crop share (one batched read).
      loanList.forEach((l, i) => {
        const g = fts[hexes[i]]?.loan;
        if (!g || (Number(g.flags ?? 0) & FLAG_CLOSED)) return;
        const left = n(g.principal) - n(g.principal_paid) + n(g.interest_accrued) - n(g.interest_paid);
        get(l.borrower).loans.push({ token: hexes[i], left, overdue: !!(Number(g.flags ?? 0) & FLAG_OVERDUE) });
      });
      const list = finish([...by.values()]);
      if (acct) keep(acct, cfg.union, list);
      return list;
    },
  });
}

/** The union's crop shares per member (25 Oct): from the members list's rows (token, crop, area, season, window —
 *  no mint list per plan), with each share's state on Stellar. Chain reads are kept on this phone and read again only
 *  for members whose row changed since the last read (their counter), in batches of 100; `fresh`: one member whose
 *  shares are always read again (her G2, so a share just drawn on her own phone does not still offer Take up). */
export function useUnionShares(api, { fresh } = {}) {
  const { data: cfg } = useStellarConfig();
  const members = useUnionMembers(api);
  const list = members.data;
  return useQuery({
    queryKey: ['stellar', 'unionShares', cfg?.union, members.dataUpdatedAt, fresh || ''],
    enabled: !!api && !!cfg?.contracts?.fund_core && Array.isArray(list),
    staleTime: 2 * 60_000, placeholderData: (prev) => prev,
    queryFn: async () => {
      const now = Date.now() / 1000;
      const key = `chain.${cfg.union}`;
      const kept = (await keptGet(key)) || { seqs: {}, fts: {} };
      const need = [];
      for (const m of list) {
        const again = m.key === fresh || kept.seqs[m.key] !== m.seq;
        for (const x of m.shareList || []) if (again || !(x.token in kept.fts)) need.push(x.token);
      }
      const read = need.length ? await readFoodTokens(cfg, cfg.union, need).catch(() => null) : {};
      const fts = { ...kept.fts };
      if (read) for (const t of need) fts[t] = read[t] || null;
      keptPut(key, { seqs: read ? Object.fromEntries(list.map((m) => [m.key, m.seq])) : kept.seqs, fts });
      const by = {};
      for (const m of list) {
        if (!m.address || !(m.shareList || []).length) continue;
        const shares = m.shareList.map((x) => {
          const ft = fts[x.token];
          const flags = Number(ft?.loan?.flags ?? 0);
          const drawn = ft ? !!(flags & FLAG_DRAWN) : ['financed', 'overdue', 'repaid'].includes(x.state);
          // Her loan read from the share itself (23 Oct): a fresh draw is not in the node's loan list until its next sync.
          const g = ft?.loan || {};
          const loan = drawn && ft && !(flags & FLAG_CLOSED)
            ? { token: x.token, left: n(g.principal) - n(g.principal_paid) + n(g.interest_accrued) - n(g.interest_paid), overdue: !!(flags & FLAG_OVERDUE) } : null;
          // Its window (25 Oct): Ready from its opening (a week before its sowing window) until the last draw date.
          const from = ft ? opensOf(ft) : Number(x.open || 0);
          // Attested before the last-date rule (25 Oct): no last date on-chain, so never lapsed.
          const final = ft ? Number(ft.final_date || 0) : Number(x.final || 0);
          const lapsed = !drawn && (!!ft?.lapsed || (final > 0 && now > final));
          return { token: x.token, planId: x.plan_id, crop: x.name || String(x.crop).replace(/_/g, ' '), colour: x.colour, area: x.area,
            zones: x.zones || [], harvest: x.harvest, kg: x.kg, slot: x.slot, from, final, drawn, loan, lapsed,
            ready: !drawn && !lapsed && now >= from };
        });
        by[m.address] = { planId: shares.find((x) => x.ready)?.planId || shares[shares.length - 1]?.planId, shares };
      }
      return by;
    },
  });
}

/** G2: the due date of each of her loans (fund_core.due_date), read only for her. */
export function useLoanDues(loans) {
  const { data: cfg } = useStellarConfig();
  const tokens = (loans || []).map((l) => l.token);
  return useQuery({
    queryKey: ['stellar', 'loanDues', cfg?.union, tokens.join(',')], enabled: !!cfg?.contracts?.fund_core && tokens.length > 0,
    staleTime: 60_000,
    queryFn: async () => Object.fromEntries(await Promise.all(tokens.map(async (t) => [t,
      Number(await readContract(cfg, 'fund_core', 'due_date', [sv.address(cfg.union), sv.bytes32(t)]).catch(() => 0) || 0)]))),
  });
}

/** Her wallet QR (A1a: a Stellar address, possibly as a stellar: / web+stellar: URI) → that address. */
export const addressFromQr = (text) => (String(text || '').match(/G[A-Z2-7]{55}/) || [])[0] || '';
