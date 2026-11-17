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
