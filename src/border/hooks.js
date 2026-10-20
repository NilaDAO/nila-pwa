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

/** L2a–L4: one job, polled while it draws or mints. */
export function useBorderJob(id) {
  const api = useBorderClient();
  return useQuery({ queryKey: qkBorder.job(id), enabled: !!api && !!id, queryFn: () => api.job(id),
    refetchInterval: (q) => poll(q.state.data) });
}

/** R14: her own latest job, or null. */
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

/** L3: accept a shape (locks the field) or None fit (redraw); preview stores nothing. */
export function useBorderDecision(id) {
  const api = useBorderClient();
  const accept = useJobWrite(id, (a, { field, shape }) => a.accept(id, field, shape));
  const noneFit = useJobWrite(id, (a, { field }) => a.noneFit(id, field));
  const preview = useMutation({ mutationFn: ({ field, shape }) => api.preview(id, field, shape) });
  return { accept, noneFit, preview };
}

/** L4: the leader asks the node to mint her land title (signed by the node's title key). */
export function useMintLandTitle(id) {
  return useJobWrite(id, (a, { farm } = {}) => a.mint(id, farm));
}
