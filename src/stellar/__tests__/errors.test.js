import { plainError } from '../errors';

test('an expired QR in plain words, and no event log dump (20 Nov)', () => {
  const dump = 'HostError: Error(Auth, InvalidInput)\n\nEvent log (newest first):\n   0: [Diagnostic Event] ... "signature has expired", C..., 202076, 202019]';
  expect(plainError(dump, {})).toBe('This QR has expired. Ask the member to show a new one.');
  const other = 'HostError: Error(Auth, InvalidAction)\n\nEvent log (newest first):\n   0: lots of text';
  expect(plainError(other, {})).toBe('HostError: Error(Auth, InvalidAction)');
  expect(plainError('x'.repeat(300), {}).length).toBe(158);
});
