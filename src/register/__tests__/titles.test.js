// "Does she hold a land title?" (7 Nov): without a Polygon wallet the Stellar titles decide, never a wait for good.
import { useTitleCount } from '../titles';

const mockLegacy = { data: undefined, isError: false, fetchStatus: 'idle' };
let mockSt = { data: 1, isError: false };
jest.mock('../../move/hooks', () => ({ useLegacyBalances: () => mockLegacy }));
jest.mock('../../stellar/hooks', () => ({ useStellarTitleCount: () => mockSt }));

test('no Polygon wallet: the Stellar title decides', () => {
  mockSt = { data: 1, isError: false };
  expect(useTitleCount(undefined, 'CABC')).toMatchObject({ count: 1, polygon: 0, stellar: 1, loading: false });
});

test('a Polygon wallet still waits for its read', () => {
  mockSt = { data: 1, isError: false };
  expect(useTitleCount('0xabc', 'CABC')).toMatchObject({ count: undefined, loading: true });
});
