// The node's border job (oracle O16, nila-sensing docs/stellar/O16.md): her GPS points (R5–R7), the leader's
// check (L1–L4) and the title mint. Signed like /plan (her or the leader's Stellar wallet, SEP-53).
import { signedCall } from '../plan/api';

/** GET /border/mine and /border/job answer the job itself or { job }; GET /border/jobs a list or { jobs }. */
const jobOf = (r) => (r && r.job !== undefined ? r.job : r);
const listOf = (r) => (Array.isArray(r) ? r : r?.jobs || []);

export function borderClient(signer) {
  const call = signedCall(signer);
  return {
    sendPoints: ({ polygon, farm, union, points }) => call('POST', '/border/points', { polygon, farm: farm || undefined, union: union || undefined, points }).then(jobOf),
    // L14 for a smartphone member (29 Oct): the leader sends the points with the account and Polygon address of the
    // member's help QR.
    leaderPoints: ({ account, polygon, name, phone, farm, points }) =>
      call('POST', '/border/points/leader', { account, polygon, name: name || '', phone: phone || '', farm: farm || '', points }).then(jobOf),
    mine: () => call('GET', '/border/mine').then(jobOf),
    jobs: () => call('GET', '/border/jobs').then(listOf),
    job: (id) => call('GET', `/border/job/${id}`).then(jobOf),
    preview: (id, field, shape) => call('POST', `/border/job/${id}/preview`, { field, shape }),
    accept: (id, field, shape) => call('POST', `/border/job/${id}/decide`, { field, action: 'accept', shape }).then(jobOf),
    noneFit: (id, field) => call('POST', `/border/job/${id}/decide`, { field, action: 'none_fit' }).then(jobOf),
    retry: (id, field) => call('POST', `/border/job/${id}/decide`, { field, action: 'retry' }).then(jobOf),
    acceptPlan: (id) => call('POST', `/border/job/${id}/decide`, { field: 0, action: 'accept_plan' }).then(jobOf),
    addPlot: (id, field, plot) => call('POST', `/border/job/${id}/decide`, { field, action: 'add_plot', shape: plot }).then(jobOf),
    newField: (id, plot) => call('POST', `/border/job/${id}/decide`, { field: 0, action: 'new_field', shape: plot }).then(jobOf),
    // L2 + Add a point (26 Oct): more fields for an open job, taken on the leader's phone.
    addPoints: (id, points) => call('POST', `/border/job/${id}/points`, { points }).then(jobOf),
    mint: (id, farm) => call('POST', `/border/job/${id}/mint`, farm ? { farm } : {}).then(jobOf),
  };
}

/** The shape shown for a field: the accepted one, else the plan's (or a preview's). */
export function shapeFor(field, plan = {}) {
  const id = field.accepted || plan[String(field.n)];
  return field.shapes?.find((s) => s.id === id) || null;
}

export const acres = (a) => `${Number(a || 0).toFixed(2)} acres`;
