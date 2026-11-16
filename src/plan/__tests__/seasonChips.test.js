// The plan overview's season chips (16 Nov): the money rows and the table count only the seasons whose chip is on.
import { seasonsCounted, seasonsOff, seasonsOn, yearSeasons } from '../seasonChips';

const row = (cash, voucher) => ({ finance: { cash, voucher_value: voucher, interest: 0 } });
const plan = {
  seasons: [
    { slot: 'S1', start: '2026-10-01', rows: [row(100, 10)] },
    { slot: 'S2', start: '2027-03-01', rows: [row(200, 20)] },
    { slot: 'S3', start: '2027-06-01', rows: [row(300, 30)] },
  ],
  soil_cover: [{ slots: ['S2'], finance: { cash: 5, voucher_value: 0, interest: 0 } }, { slots: ['S3'] }],
};
const cash = ({ seasons, gm }) => [...seasons.flatMap((s) => s.rows), ...gm].reduce((a, r) => a + r.finance.cash, 0);

test('all chips on (the default): the whole plan counts', () => {
  const off = seasonsOff(plan.seasons, 0, new Set(['S1', 'S2', 'S3']));
  expect(off).toEqual([]);
  expect(cash(seasonsCounted(plan, off))).toBe(605);
});

test('a chip off: its season and its green manure leave the sums', () => {
  const off = seasonsOff(plan.seasons, 0, new Set(['S1', 'S3']));
  expect(off).toEqual([1]);
  const part = seasonsCounted(plan, off);
  expect(part.seasons.map((s) => s.slot)).toEqual(['S1', 'S3']);
  expect(part.gm).toEqual([]);
  expect(cash(part)).toBe(400);
});

test('no chip on in this year counts as all on', () => {
  expect(seasonsOn(plan.seasons, 0, new Set())).toEqual([0, 1, 2]);
  expect(seasonsOff(plan.seasons, 0, new Set())).toEqual([]);
});

test('a season of another plan year has no chip and stays counted', () => {
  const ss = [{ slot: 'S3', start: '2026-06-01', rows: [row(1, 0)] }, ...plan.seasons.slice(0, 2)];
  expect(yearSeasons(ss, 1)).toEqual([1, 2]);
  const off = seasonsOff(ss, 1, new Set(['S2']));
  expect(off).toEqual([1]);
  expect(seasonsCounted({ seasons: ss }, off).seasons.map((s) => s.slot)).toEqual(['S3', 'S2']);
});

test('no filter: every financed green manure, as before', () => {
  expect(seasonsCounted(plan).gm).toHaveLength(1);
});
