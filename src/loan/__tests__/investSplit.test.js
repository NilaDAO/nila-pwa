// Invest at the desk (7 Nov): the amount set is invested, the rest of the count is change.
import { investSplit } from '../investSplit';

test('the amount set is invested, the rest is change', () => {
  expect(investSplit(1500, 1234)).toEqual({ invest: 1234, change: 266 });
});

test('counted exactly: no change', () => {
  expect(investSplit(600, 600)).toEqual({ invest: 600, change: 0 });
});

test('without an amount the whole count is invested', () => {
  expect(investSplit(700)).toEqual({ invest: 700, change: 0 });
  expect(investSplit(700, 0)).toEqual({ invest: 700, change: 0 });
});

test('never more than counted', () => {
  expect(investSplit(500, 800)).toEqual({ invest: 500, change: 0 });
});
