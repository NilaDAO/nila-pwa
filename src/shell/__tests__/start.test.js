import { screenToOpen } from '../start';

const base = { onboarded: true, demoNew: false, privyNew: false, tab: 'assets', arg: '', leader: false };
const t = (titles) => screenToOpen({ ...base, titles });

test('titles still loading: wait', () => {
  expect(t({ loading: true, failed: [], pendingOther: true })).toBe('titleWait');
});
test('one chain failed, the other answered: the app opens (rows 25-26)', () => {
  expect(t({ loading: true, failed: ['polygon'], pendingOther: false })).toBe('tab');
});
test('one chain failed, the other still loading: wait', () => {
  expect(t({ loading: true, failed: ['polygon'], pendingOther: true })).toBe('titleWait');
});
test('both chains failed: the failure screen', () => {
  expect(t({ loading: true, failed: ['polygon', 'stellar'], pendingOther: false })).toBe('titleWait');
});
test('an unknown count never opens registration for a new Privy user', () => {
  expect(screenToOpen({ ...base, onboarded: false, privyNew: true, titles: { loading: true, failed: ['stellar'], pendingOther: false } })).toBe('tab');
});
