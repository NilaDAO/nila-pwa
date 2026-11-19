import { fill, iso, rowOf, toChanges, whyNoRoom } from '../yearRow';
import { seasonsCounted } from '../seasonChips';

// Bio manure (19 Nov, executive decision): spread before the next crop, its own agreement; it takes no season.
const seasons = [{ slot: 'S1', start: '2026-10-01' }, { slot: 'S2', start: '2027-03-01' }, { slot: 'S3', start: '2027-06-01' }];
const cat = {
  black_gram: { days: 75, sow_months: [10, 11, 12, 2, 3, 6, 7] },
  maize: { days: 115, sow_months: [6, 7, 10, 11, 1, 2] },
};

test('goat manure goes before the next crop, 14 days before its sowing, and is sent with it', () => {
  const { bars, dropped } = fill(['black_gram', 'bio_manure:goat', 'maize'], { seasons, cat });
  expect(dropped).toEqual([]);
  const [, bio, mz] = bars;
  expect(bio.bio && !bio.waiting && bio.slot).toBe('S3');
  expect(iso(mz.sow)).toBe('2027-06-01');
  expect(iso(bio.sow)).toBe('2027-05-18');
  expect(toChanges(bars, seasons)).toEqual({ S1: 'black_gram', S2: null, S3: 'bio_manure:goat+maize' });
});

test('not before the field is free: after the black gram harvest', () => {
  const { bars } = fill(['black_gram', 'bio_manure:cow', 'black_gram'], { seasons, cat });
  // black gram Oct 1 + 75 days = Dec 15; the second black gram in S2 from Feb? S2 months 3-5: March 1.
  expect(iso(bars[2].sow)).toBe('2027-03-01');
  expect(iso(bars[1].sow)).toBe('2027-02-15');
  expect(toChanges(bars, seasons).S2).toBe('bio_manure:cow+black_gram');
});

test('waiting for a crop: drawn, but nothing sent with it; one manure before each crop', () => {
  const { bars, dropped } = fill(['maize', 'bio_manure:lake_silt', 'bio_manure:goat'], { seasons, cat });
  expect(bars[1].waiting).toBe(true);
  expect(dropped).toEqual(['bio_manure:goat']);
  expect(whyNoRoom('bio_manure:goat', ['maize', 'bio_manure:lake_silt'], { seasons, cat })).toBe('One manure before each crop');
  expect(toChanges(bars, seasons)).toEqual({ S1: 'maize', S2: null, S3: null });
});

test('the plan row reads its bio manures back before their crop', () => {
  const plan = { plan: { seasons: [{ slot: 'S3', start: '2027-06-01', rows: [{ zone: 'z1', crop: 'maize', sow: '2027-06-01' }] }],
    bio_manure: [{ zone: 'z1', slot: 'S3', type: 'goat', on: '2027-05-18' }] } };
  expect(rowOf(plan, 'z1').keys).toEqual(['bio_manure:goat', 'maize']);
});

test('its agreement counts in the season of the crop it goes before', () => {
  const p = { seasons: [{ slot: 'S1', rows: [] }, { slot: 'S3', rows: [] }],
    bio_manure: [{ zone: 'z1', slot: 'S3', finance: { cash: 100, voucher_value: 50 } }] };
  expect(seasonsCounted(p).gm).toEqual([expect.objectContaining({ kind: 'bio_manure', slots: ['S3'] })]);
  expect(seasonsCounted(p, [1]).gm).toEqual([]);
});
