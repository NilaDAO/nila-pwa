import { movedToStellar } from '../chainRefresh';

const attrs = (chain) => async () => [{ Name: 'phone_number', Value: '+910000000000' }, { Name: 'custom:chain', Value: chain }];

test('a Polygon wallet the operator moved (148) opens Stellar', async () => {
  expect(await movedToStellar('137', attrs('148'))).toBe('stellar');
});

test('still Polygon, testnet or already Stellar: nothing changes, and Cognito is read only for 137', async () => {
  expect(await movedToStellar('137', attrs('137'))).toBe(null);
  const never = async () => { throw new Error('read'); };
  expect(await movedToStellar('stellar', never)).toBe(null);
  expect(await movedToStellar('80002', never)).toBe(null);
  expect(await movedToStellar(undefined, never)).toBe(null);
});
