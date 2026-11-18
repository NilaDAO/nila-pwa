import { render, screen, fireEvent } from '@testing-library/react';
import ActivePlan, { inkOn } from '../ActivePlan';

const plan = { approval: { ts: 1795000000 }, plan: {
  seasons: [{ slot: 'S3', start: '2027-06-01', rows: [{
    zone: 'z1', crop: 'maize', name: 'Maize', sow: '2027-06-15', harvest: '2027-10-08', kg: 2000,
    finance: { seed: 2400, cash_inputs: 6500, cash: 9400, voucher_value: 2000, interest: 400, due: '2027-10-29',
      machines: { tractor: { for: 'ploughing', acres: 1, value: 2000 } } },
  }] }],
  shares: [{ key: 'k1', zone: 'z1', from_date: '2027-06-15', final_date: '2027-07-31', loan_amount: 9400 }],
} };

test('the approved plan renders its job grid and a tap shows the detail', () => {
  render(<ActivePlan plan={plan} areaNo={() => 1} areaName={() => 'A · 1'} season={0} shares={[{ share: 'k1', ready: true }]} />);
  expect(screen.getByText('Plough')).toBeTruthy();
  expect(screen.getByText('Ready')).toBeTruthy();
  const tapped = [];
  render(<ActivePlan plan={plan} areaNo={() => 1} areaName={() => 'A · 1'} season={0} shares={[]} onTile={(t) => tapped.push(t)} />);
  fireEvent.click(screen.getAllByText('Plough')[1]);
  expect(screen.getByRole('status', { hidden: true }).textContent).toBe('Maize · Plough · ₹2,000');
  // 17 Nov: the tap hands its areas and season to the screen (map focus, season chip).
  expect(tapped[0]).toMatchObject({ zones: ['z1'], season: 0 });
});

test('text on a crop colour: black on light, white on dark', () => {
  expect(inkOn('#E8B33A')).toBe('#121212');   // maize
  expect(inkOn('#4F7A3A')).toBe('#ffffff');   // a dark green
});

test('the tiles are in time order across the crops', () => {
  const two = { ...plan, plan: { ...plan.plan, seasons: [{ ...plan.plan.seasons[0], rows: [
    { ...plan.plan.seasons[0].rows[0], zone: 'z1', sow: '2027-07-01', harvest: '2027-10-20' },
    { ...plan.plan.seasons[0].rows[0], zone: 'z2', crop: 'sesame', name: 'Sesame', sow: '2027-06-10', harvest: '2027-09-10', finance: { seed: 100 } }] }] } };
  render(<ActivePlan plan={two} areaNo={() => 1} areaName={() => 'A'} season={0} shares={[]} />);
  const names = screen.getAllByRole('listitem').map((b) => b.getAttribute('aria-label').split(' · ').slice(0, 2).join(' '));
  expect(names.slice(0, 2)).toEqual(['Sesame Seed', 'Maize Seed']);
});

test('the whole plan: one row per month with its letter, a line per season', () => {
  const two = { ...plan, plan: { ...plan.plan, seasons: [
    { slot: 'S2', start: '2027-03-01', rows: [{ ...plan.plan.seasons[0].rows[0], sow: '2027-03-05', harvest: '2027-05-20', finance: { seed: 100 } }] },
    plan.plan.seasons[0]] } };
  render(<ActivePlan plan={two} areaNo={() => 1} areaName={() => 'A'} season={0} shares={[]} />);
  expect(screen.getByRole('group', { name: 'Mar to May' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Jun to Aug' })).toBeTruthy();
  expect(screen.getByRole('list', { name: 'March' })).toBeTruthy();
});

test('a green manure has its own tiles in the grid (17 Nov)', () => {
  const gm = { ...plan, plan: { ...plan.plan,
    soil_cover: [{ zone: 'z1', kind: 'green_manure', cover: 'sunnhemp', colour: '#8FA36B', sow: '2027-04-01', turn_in: '2027-05-31',
      finance: { seed: 750, cash: 750, voucher_value: 0, interest: 100, due: '2027-10-29', machines: {}, machine_weeks: [] } }],
    shares: [...plan.plan.shares, { key: 'g1', zone: 'z1', zones: ['z1'], green_manure: true, from_date: '2027-04-01', final_date: '2027-04-30', loan_amount: 750 }] } };
  render(<ActivePlan plan={gm} areaNo={() => 1} areaName={() => 'A'} season={0} shares={[]} />);
  const labels = screen.getAllByRole('listitem').map((b) => b.getAttribute('aria-label'));
  expect(labels.some((l) => /^Green manure · Seed/.test(l))).toBe(true);
  expect(labels.some((l) => /^Green manure · Turn in/.test(l))).toBe(true);
  expect(labels.filter((l) => /^Green manure · (Collect|Repay)/.test(l)).length).toBe(2);
});

test('green manures merged into one crop agreement show one Collect and one Repay (17 Nov)', () => {
  const c = (zone) => ({ zone, kind: 'green_manure', cover: 'sunnhemp', colour: '#8FA36B', sow: '2027-04-01', turn_in: '2027-05-31',
    finance: { seed: 500, cash: 500, voucher_value: 0, interest: 50, due: '2027-10-29', machines: {}, machine_weeks: [] } });
  const gm = { ...plan, plan: { ...plan.plan, soil_cover: [c('z1'), c('z2'), c('z3')],
    shares: [...plan.plan.shares, { key: 'g1', crop: 'sunnhemp', zone: 'z1', zones: ['z1', 'z2', 'z3'], green_manure: true, from_date: '2027-04-01', final_date: '2027-04-30', loan_amount: 1500 }] } };
  render(<ActivePlan plan={gm} areaNo={() => 1} areaName={() => 'A'} season={0} shares={[]} />);
  const labels = screen.getAllByRole('listitem').map((b) => b.getAttribute('aria-label')).filter((l) => /^Green manure/.test(l));
  expect(labels.filter((l) => /· Collect/.test(l))).toEqual(['Green manure · Collect · ₹1,500']);
  expect(labels.filter((l) => /· Seed/.test(l))).toEqual(['Green manure · Seed · ₹1,500']);
  expect(labels.filter((l) => /· Repay/.test(l)).length).toBe(1);
});

test('the grid filtered by a season chip and by an area (17 Nov)', () => {
  const two = { ...plan, plan: { ...plan.plan, seasons: [
    { slot: 'S2', start: '2027-03-01', rows: [{ ...plan.plan.seasons[0].rows[0], zone: 'z2', crop: 'sesame', name: 'Sesame', sow: '2027-03-05', harvest: '2027-05-20', finance: { seed: 100 } }] },
    plan.plan.seasons[0]] } };
  const crops = (f) => {
    const { unmount } = render(<ActivePlan plan={two} areaNo={() => 1} areaName={() => 'A'} season={0} shares={[]} filter={f} />);
    const out = [...new Set(screen.getAllByRole('listitem').map((b) => b.getAttribute('aria-label').split(' · ')[0]))].sort();
    unmount();
    return out;
  };
  expect(crops({})).toEqual(['Maize', 'Sesame']);
  expect(crops({ season: 0 })).toEqual(['Sesame']);
  expect(crops({ zones: ['z1'] })).toEqual(['Maize']);
  expect(crops({ zones: ['z1', 'z2'] })).toEqual(['Maize', 'Sesame']);
});
