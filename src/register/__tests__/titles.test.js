// "Does she hold a land title?" (7 Nov): without a Polygon wallet the Stellar titles decide, never a wait for good.
// 19 Nov (SCF T2 row 25): a failed read is never "none".
import { useTitleCount } from '../titles';

let mockLegacy = { data: undefined, isError: false, fetchStatus: 'idle' };
let mockSt = { data: 1, isError: false };
jest.mock('../../move/hooks', () => ({ useLegacyBalances: () => mockLegacy }));
jest.mock('../../stellar/hooks', () => ({ useStellarTitleCount: () => mockSt }));

test('no Polygon wallet: the Stellar title decides', () => {
  mockLegacy = { data: undefined, isError: false }; mockSt = { data: 1, isError: false };
  expect(useTitleCount(undefined, 'CABC')).toMatchObject({ count: 1, polygon: 0, stellar: 1, loading: false });
});

test('a Polygon wallet still waits for its read', () => {
  mockLegacy = { data: undefined, isError: false }; mockSt = { data: 1, isError: false };
  expect(useTitleCount('0xabc', 'CABC')).toMatchObject({ count: undefined, loading: true, failed: [] });
});

test('a failed Polygon read with no Stellar title is unknown, not 0', () => {
  mockLegacy = { data: undefined, isError: true }; mockSt = { data: 0, isError: false };
  expect(useTitleCount('0xabc', 'CABC')).toMatchObject({ count: undefined, loading: true, failed: ['polygon'] });
});

test('a failed Polygon read does not matter when Stellar shows a title', () => {
  mockLegacy = { data: undefined, isError: true }; mockSt = { data: 1, isError: false };
  expect(useTitleCount('0xabc', 'CABC')).toMatchObject({ count: 1, loading: false, failed: [] });
});

test('a failed Stellar read is unknown too', () => {
  mockLegacy = { data: { titles: 0 }, isError: false }; mockSt = { data: undefined, isError: true };
  expect(useTitleCount('0xabc', 'CABC')).toMatchObject({ count: undefined, failed: ['stellar'] });
});
