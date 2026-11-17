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
  expect(screen.getByText(/sow 15 Jun – 31 Jul/)).toBeTruthy();
  fireEvent.click(screen.getByText('Plough'));
  expect(screen.getByRole('status').textContent).toBe('Maize · Plough · ₹2,000');
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
