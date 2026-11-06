import { STELLAR_CHAIN_ATTR, chainFromCognito } from '../chainAttr';

test('Stellar is stored as a number Cognito accepts (Number attribute, 0..1000000)', () => {
  const n = Number(STELLAR_CHAIN_ATTR);
  expect(Number.isInteger(n) && n >= 0 && n <= 1000000).toBe(true);
});

test('148 from Cognito is the app\'s stellar; everything else is unchanged', () => {
  expect(chainFromCognito('148')).toBe('stellar');
  expect(chainFromCognito(148)).toBe('stellar');
  expect(chainFromCognito('137')).toBe('137');
  expect(chainFromCognito('80002')).toBe('80002');
  expect(chainFromCognito('stellar')).toBe('stellar');   // the demo's Cognito stand-in
  expect(chainFromCognito(undefined)).toBe(undefined);
});
