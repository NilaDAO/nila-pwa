import { actionOf, gridsOf } from '../jobGrid';

const plan = { plan: {
  seasons: [{ slot: 'S3', start: '2027-06-01', rows: [{
    zone: 'z1', crop: 'maize', name: 'Maize', sow: '2027-06-15', harvest: '2027-10-08', kg: 2000,
    finance: { seed: 2400, cash_inputs: 6500, cash: 9400, voucher_value: 3000, interest: 400, due: '2027-10-29',
      machines: { tractor: { for: 'ploughing', acres: 1, value: 2000, when: '2027-06-10' }, weeder: { for: 'weeding', acres: 1, value: 1000 } },
      hand_work: { spray: { for: 'spraying by hand', acres: 1, value: 500 } } },
  }] }],
  shares: [{ key: 'k1', zone: 'z1', from_date: '2027-06-15', final_date: '2027-07-31', loan_amount: 9400 }],
} };

test('a crop: collect, seed and inputs in cash, machine jobs as vouchers, hired work in cash, harvest and repay', () => {
  const [g] = gridsOf(plan, 0, { shares: [{ share: 'k1', ready: true }] });
  expect(g.crop).toBe('Maize');
  expect(g.tiles.map((t) => [t.label, t.kind])).toEqual([
    ['Collect', 'cash'], ['Seed', 'cash'], ['Inputs', 'cash'], ['Plough', 'voucher'], ['Weed', 'voucher'], ['Spray', 'cash'],
    ['Harvest', 'self'], ['Transport', 'self'], ['Repay', 'self']]);
  expect(g.tiles[0].ready).toBe(true);
  expect(g.tiles.find((t) => t.key === 'repay').value).toBe(12800);
});

test('the action is named from the job, never the voucher type', () => {
  expect(actionOf('land preparation')).toBe('Prepare');
  expect(actionOf('ridging')).toBe('Ridge');
  expect(actionOf('mulching')).toBe('Mulching');
});

test('20 Nov: a green manure in its crop agreement is one grid for its areas, no Collect or Repay; a bio manure has its tiles', () => {
  const { coverGrids, manureGrids } = require('../jobGrid');
  const fin = { seed: 500, cash: 500, voucher_value: 0, interest: 10, due: '2027-09-01', machine_weeks: [], machines: {}, hand_work: {} };
  const plan = { plan: { seasons: [{ slot: 'S2', rows: [] }, { slot: 'S3', rows: [] }], shares: [],
    soil_cover: ['z1', 'z2', 'z3'].map((z) => ({ zone: z, kind: 'green_manure', cover: 'wild_indigo', sow: '2027-04-01', turn_in: '2027-05-31',
      slots: ['S2'], colour: '#8FA36B', agreement: 'L:maize:2027-28K:z1+z2+z3', finance: fin })),
    bio_manure: [{ zone: 'z1', slot: 'S3', type: 'cow', name: 'Cow manure', colour: '#6B5A3E', on: '2027-05-31', agreement: 'L:maize:2027-28K:z1+z2+z3',
      finance: { manure: 0, voucher_value: 800, hand_work_cash: 0, machines: { trailer: { acres: 1 } } } }] } };
  const g = coverGrids(plan);
  expect(g).toHaveLength(1);
  expect(g[0].zones).toEqual(['z1', 'z2', 'z3']);
  expect(g[0].tiles.map((t) => t.key)).toEqual(['seed', 'turn_in']);
  expect(g[0].tiles[0].value).toBe(1500);
  const b = manureGrids(plan);
  expect(b).toHaveLength(1);
  expect(b[0].tiles.map((t) => [t.key, t.kind])).toEqual([['manure', 'self'], ['haul', 'voucher']]);
});
