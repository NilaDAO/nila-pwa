import { render, screen, fireEvent } from '@testing-library/react';
import ActivePlan from '../ActivePlan';

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
