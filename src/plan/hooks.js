// Crop-plan hooks (P4; design data/DataHooksRead.md useCropPlan, usePlanJob, useCropCatalogue;
// DataHooksWrite.md useSubmitIntake, useAcceptPlan). Query keys qk.oracle.*.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useProvider } from '../hooks/useWallet.ts';
import { useNilaSigner } from '../wallet/signer';
import { getCatalogue, planClient } from './api';

export const qkPlan = {
  catalogue: () => ['oracle', 'catalogue'],
  plan: (landId) => ['oracle', 'plan', landId],
  job: (jobId) => ['oracle', 'planJob', jobId],
  titles: (addr) => ['polygon', 'titles', addr],
};

export function usePlanClient() {
  const s = useNilaSigner();
  return useMemo(() => (s?.stellarAddress && s?.signHash ? planClient(s) : null), [s]);
}

/** Her Polygon land titles (ids): a plan is made per land (titles stay on Polygon). */
export function useLandTitles(address) {
  const { provider } = useProvider();
  return useQuery({
    queryKey: qkPlan.titles(address), enabled: !!provider && !!address, staleTime: 5 * 60_000,
    queryFn: async () => {
      const c = new ethers.Contract(process.env.REACT_APP_LAND_TITLE_MAIN, [
        'function balanceOf(address) view returns (uint256)',
        'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)'], provider);
      const n = Number(await c.balanceOf(address));
      return Promise.all([...Array(n)].map((_, i) => c.tokenOfOwnerByIndex(address, i).then(Number)));
    },
  });
}

export function useCropCatalogue() {
  return useQuery({ queryKey: qkPlan.catalogue(), queryFn: getCatalogue, staleTime: 7 * 86_400_000 });
}

/** The latest plan of a land (draft, accepted or superseded), or null. */
export function useCropPlan(landId) {
  const api = usePlanClient();
  return useQuery({
    queryKey: qkPlan.plan(landId), enabled: !!api && landId != null,
    queryFn: () => api.latest(landId).catch((e) => { if (e.status === 404) return null; throw e; }),
  });
}

/** A plan job: polled every 10 s until done or error (design usePlanJob). */
export function usePlanJob(jobId) {
  const api = usePlanClient();
  return useQuery({
    queryKey: qkPlan.job(jobId), enabled: !!api && !!jobId,
    queryFn: () => api.job(jobId),
    refetchInterval: (q) => (['done', 'error'].includes(q.state.data?.status) ? false : 10_000),
  });
}

export function useSubmitIntake(landId) {
  const api = usePlanClient();
  return useMutation({ mutationFn: ({ intake, trees, wells }) => api.makePlan(landId, intake, { trees, wells }) });
}

/** CP11 "I accept": every area of the plan (the node accepts per area). */
export function useAcceptPlan(landId) {
  const api = usePlanClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan) => {
      let p = plan;
      for (const zone of Object.keys(plan.plan.proposal)) {
        if (!plan.accepted?.[zone]) p = await api.accept(plan.id, zone);
      }
      return p;
    },
    onSuccess: (p) => qc.setQueryData(qkPlan.plan(landId), p),
  });
}

/** CP6 answer → cows (the engine takes a number). DESIGN GAP: mapping chosen here. */
export const COWS = { None: 0, '1 or 2': 2, '3 to 5': 4, '6 or more': 6 };
/** CP5 answer → land_role (free string on the node). */
export const LAND_ROLE = { 'Our main income': 'main', 'One of several incomes': 'several', 'Food for our home and cattle': 'food' };
