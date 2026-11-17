import { fill, iso, rowOf, toChanges } from '../yearRow';

const seasons = [{ slot: 'S1', start: '2026-10-01' }, { slot: 'S2', start: '2027-03-01' }, { slot: 'S3', start: '2027-06-01' }];
const cat = {
  sugarcane: { days: 330, sow_months: [12, 1, 2, 3], whole_year: true },
  black_gram: { days: 75, sow_months: [10, 11, 12, 2, 3, 6, 7] },
  green_gram: { days: 70, sow_months: [3, 6, 7] },
  maize: { days: 115, sow_months: [6, 7, 10, 11, 1, 2] },
};
const show = (bars) => bars.map((b) => [b.key, b.slot, iso(b.sow)]);

test('black gram, green manure, maize follow each other, one per season', () => {
  const { bars, dropped } = fill(['black_gram', 'green_manure', 'maize'], { seasons, cat });
  expect(dropped).toEqual([]);
  expect(show(bars)).toEqual([['black_gram', 'S1', '2026-10-01'], ['green_manure', 'S2', '2027-03-01'], ['maize', 'S3', '2027-06-01']]);
  expect(toChanges(bars, seasons)).toEqual({ S1: 'black_gram', S2: 'green_manure', S3: 'maize' });
});

test('sugarcane fills the year: green gram in March has no room', () => {
  const { bars, dropped } = fill(['sugarcane', 'green_gram'], { seasons, cat });
  expect(bars).toHaveLength(1);
  expect(bars[0].whole).toBe(true);
  expect(dropped).toEqual(['green_gram']);
  expect(toChanges(bars, seasons)).toEqual({ S1: 'sugarcane', S2: 'sugarcane', S3: 'sugarcane' });
});

test('a crop is sown only once the field is free, and locked seasons are not sent', () => {
  const { bars } = fill(['maize'], { seasons, cat, free0: '2027-01-15' });
  expect(show(bars)).toEqual([['maize', 'S1', '2027-01-15']]);
  expect(toChanges(bars, seasons, { S1: { crop: 'paddy' } })).toEqual({ S2: null, S3: null });
});

test('the row as planned: crops after the locked ones, green manure in time order', () => {
  const plan = { plan: {
    seasons: [
      { slot: 'S1', start: '2026-10-01', rows: [{ zone: 'z1', crop: 'paddy', sow: '2026-09-01', harvest: '2027-01-10' }] },
      { slot: 'S2', start: '2027-03-01', rows: [] },
      { slot: 'S3', start: '2027-06-01', rows: [{ zone: 'z1', crop: 'maize', sow: '2027-06-01' }] },
    ],
    locked: { z1: { S1: { crop: 'paddy' } } },
    soil_cover: [{ zone: 'z1', kind: 'green_manure', sow: '2027-03-20' }],
  } };
  expect(rowOf(plan, 'z1')).toEqual({ keys: ['green_manure', 'maize'], free0: '2027-01-10', locked: { S1: { crop: 'paddy' } } });
});
