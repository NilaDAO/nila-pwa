// Border hooks (P11; design data/DataHooksRead.md useBorderJob, DataHooksWrite.md useSendFieldPoints,
// useBorderDecision, useMintLandTitle). Query keys qk.oracle.border. Leader-only reads run only for a leader.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNilaSigner } from '../wallet/signer';
import { borderClient } from './api';

export const qkBorder = {
  all: () => ['oracle', 'border'],
  jobs: () => ['oracle', 'border', 'jobs'],
  job: (id) => ['oracle', 'border', 'job', id],
  mine: (acct) => ['oracle', 'border', 'mine', acct],
};

const BUSY = ['drawing', 'minting'];
// The design polls every 30 s while drawing (DataHooksRead.md); 5 s keeps the leader's L2a and L4 live.
const poll = (job) => (job && BUSY.includes(job.status) ? 5_000 : 30_000);

export function useBorderClient() {
  const s = useNilaSigner();
  return useMemo(() => (s?.stellarAddress && s?.signHash ? borderClient(s) : null), [s]);
}

/** L1: the union's open border jobs (leader). */
export function useBorderJobs(enabled = true) {
  const api = useBorderClient();
  return useQuery({ queryKey: qkBorder.jobs(), enabled: !!api && enabled, queryFn: () => api.jobs(), refetchInterval: 30_000 });
}

/** The soil the leader accepted per field (13 Nov): job id → { field n: 1–5 }, for this session. A field the node
 *  returns with no soil (a node from before soil on accept, or a reply that dropped it) keeps the one picked on L3, so
 *  its fill stays on the map after Accept. */
const SOIL_KEY = 'nila.border.soils';
const soilsPicked = (() => { try { return JSON.parse(sessionStorage.getItem(SOIL_KEY) || '{}'); } catch (e) { return {}; } })();
function keepSoil(jid, n, soil) {
  if (!jid || !n || !soil) return;
  soilsPicked[jid] = { ...(soilsPicked[jid] || {}), [n]: soil };
  try { sessionStorage.setItem(SOIL_KEY, JSON.stringify(soilsPicked)); } catch (e) { /* private mode: memory only */ }
}
/** The job with each field's soil: the node's, else the one accepted here (13 Nov). */
export function withSoils(job) {
  const mine = job?.id && soilsPicked[job.id];
  if (!mine || !Array.isArray(job.fields)) return job;
  return { ...job, fields: job.fields.map((f) => (!f.soil && mine[f.n] ? { ...f, soil: mine[f.n] } : f)) };
}

/** L2a–L4: one job, polled while it draws or mints. */
export function useBorderJob(id) {
  const api = useBorderClient();
  return useQuery({ queryKey: qkBorder.job(id), enabled: !!api && !!id, queryFn: () => api.job(id),
    refetchInterval: (q) => poll(q.state.data), select: withSoils });
}

/** R14: her own latest job, or null. */
/** A land title minted and not read on the chains yet (12 Nov): her border job is minting, or was minted in the last
 *  10 minutes while her titles still read none (the node writes the title; the app's reads catch up). An older minted
 *  job with no title is a title she has burned since. */
export const titlePending = (job, none) => !!none && !!job
  && (job.status === 'minting' || (job.status === 'minted' && Date.now() / 1000 - Number(job.updated || 0) < 600));

export function useMyBorderJob() {
  const s = useNilaSigner();
  const api = useBorderClient();
  return useQuery({ queryKey: qkBorder.mine(s?.stellarAddress), enabled: !!api, queryFn: () => api.mine(),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'minted' ? 15_000 : false) });
}

function useJobWrite(id, fn) {
  const api = useBorderClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args) => fn(api, args),
    onSuccess: (job) => {
      if (job && job.id) qc.setQueryData(qkBorder.job(job.id), job);
      qc.invalidateQueries({ queryKey: qkBorder.jobs() });
      if (id) qc.invalidateQueries({ queryKey: qkBorder.job(id) });
    },
  });
}

/** R5–R7 → R14: her points, with the union she chose (R9), sent at the end of registration (starts the border job). */
export function useSendFieldPoints() {
  const s = useNilaSigner();
  const api = useBorderClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ points, farm, union }) => api.sendPoints({ polygon: s.evmAddress, farm, union, points }),
    onSuccess: (job) => qc.setQueryData(qkBorder.mine(s?.stellarAddress), job),
  });
}

/** L3: accept a shape (locks the field) or None fit (redraw); no preview call (4 Nov). */
export function useBorderDecision(id) {
  // 13 Nov: the soil is kept with the accepted field here too (withSoils), so its fill stays after Accept.
  const accept = useJobWrite(id, (a, { field, shape, soil }) => a.accept(id, field, shape, soil)
    .then((job) => { keepSoil(id, field, soil); return job; }));
  const noneFit = useJobWrite(id, (a, { field }) => a.noneFit(id, field));
  const retry = useJobWrite(id, (a, { field }) => a.retry(id, field));
  const remove = useJobWrite(id, (a, { field }) => a.remove(id, field));   // delete the field and its point (1 Nov)
  // 28 Oct: the proposed plan at once (L2), and a neighbour plot added to a field or made a field of its own.
  const acceptPlan = useJobWrite(id, (a, { soil } = {}) => a.acceptPlan(id, soil));
  const addPlot = useJobWrite(id, (a, { field, plot }) => a.addPlot(id, field, plot));
  const newField = useJobWrite(id, (a, { plot }) => a.newField(id, plot));
  return { accept, noneFit, retry, remove, acceptPlan, addPlot, newField };
}

/** L4: the leader asks the node to mint her land title (signed by the node's title key). */
export function useMintLandTitle(id) {
  return useJobWrite(id, (a, { farm, soils, tenant } = {}) => a.mint(id, farm, soils, tenant));
}
