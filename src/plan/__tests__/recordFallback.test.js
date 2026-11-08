// A moved member's record (8 Nov): the node has no copy of her Polygon record hash, so IPFS gives it.
import { fromNode } from '../record';

const mockIpfs = jest.fn();
jest.mock('../../utils/ipfsCid.ts', () => ({ fetchRecordFromIPFS: (...a) => mockIpfs(...a) }));

beforeEach(() => { mockIpfs.mockReset(); global.fetch = jest.fn(async () => ({ ok: false, status: 404 })); });

test('node 404: the record comes from IPFS by the same hash', async () => {
  mockIpfs.mockResolvedValue({ zones: [] });
  await expect(fromNode('AB'.repeat(32))).resolves.toEqual({ zones: [] });
  expect(mockIpfs).toHaveBeenCalledWith(`0x${'ab'.repeat(32)}`);
});

test('neither has it: the node error stays', async () => {
  mockIpfs.mockRejectedValue(new Error('ipfs'));
  await expect(fromNode('ab'.repeat(32))).rejects.toThrow('record 404');
});
