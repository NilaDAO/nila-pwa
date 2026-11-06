import { isDue, parseMove, waitsFor } from './move';

test('parses a waiting union move and its time', () => {
  const m = parseMove({ to: ['Union', 'CUNION'], at: 1800003600n });
  expect(m).toEqual({ kind: 'Union', target: 'CUNION', at: 1800003600 });
  expect(waitsFor(m, 'CUNION')).toBe(true);
  expect(waitsFor(m, 'COTHER')).toBe(false);
});

test('due only once its time has come', () => {
  const m = parseMove({ to: ['Union', 'CUNION'], at: 100n });
  expect(isDue(m, 99)).toBe(false);
  expect(isDue(m, 100)).toBe(true);
  expect(isDue(null, 100)).toBe(false);
});

test('no move, or a code move, is not a union move', () => {
  expect(parseMove(null)).toBe(null);
  expect(waitsFor(parseMove({ to: ['Code', new Uint8Array(32)], at: 1n }), 'CUNION')).toBe(false);
});
