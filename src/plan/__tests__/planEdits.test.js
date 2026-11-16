// The member edits the crop plan (16 Nov): a block sown more than 6 weeks ago (the node's plan.locked) is shown locked
// and cannot be changed; the other blocks can.
import { laneOf } from '../PlanResult';
import { EDIT_TEXT } from '../editTexts';

const plan = {
  plan: {
    seasons: [
      { slot: 'S1', start: '2026-10-01', rows: [{ zone: 'z1', crop: 'paddy', name: 'Paddy', sow: '2026-10-05', harvest: '2027-02-10' }] },
      { slot: 'S2', start: '2027-03-01', rows: [{ zone: 'z1', crop: 'black_gram', name: 'Black gram', sow: '2027-03-01', harvest: '2027-05-15' }] },
    ],
    soil_cover: [{ zone: 'z1', slots: ['S3'], kind: 'mulch', name: 'Mulch', from: '2027-06-01', until: '2027-08-01' }],
    locked: { z1: { S1: { crop: 'paddy', sow: '2026-08-01' }, S3: { crop: 'paddy', sow: '2026-08-01' } } },
  },
};

test('a locked block is not editable and says so; the others are', () => {
  const items = laneOf(plan, 'z1', { y0: 2026 });
  const s1 = items.find((it) => it.slot === 'S1' && !it.soil);
  const s2 = items.find((it) => it.slot === 'S2' && !it.soil);
  expect(s1.editable).toBe(false);
  expect(s1.name).toBe(`Paddy · ${EDIT_TEXT.locked}`);
  expect(s2.editable).toBe(true);
  expect(s2.name).toBe('Black gram');
  // A soil cover in a locked season cannot take a crop either.
  expect(items.find((it) => it.soil).editable).toBe(false);
});

test('read only: nothing is editable, locked or not', () => {
  expect(laneOf(plan, 'z1', { y0: 2026, readOnly: true }).some((it) => it.editable)).toBe(false);
});
