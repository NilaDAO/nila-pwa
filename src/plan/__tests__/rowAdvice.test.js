import { ordered, rowAdvice } from '../rowAdvice';
import { GREEN_MANURE } from '../yearRow';

const seasons = [{ slot: 'S1', start: '2026-10-01' }, { slot: 'S2', start: '2027-03-01' }, { slot: 'S3', start: '2027-06-01' }];
const cat = {
  maize: { key: 'maize', name: 'Maize', days: 115, sow_months: [6, 7, 10, 11, 1, 2], family: 'grass', water: 'medium' },
  paddy: { key: 'paddy', name: 'Paddy', days: 130, sow_months: [6, 7, 8, 9, 10, 11, 12, 1], family: 'grass', water: 'high' },
  black_gram: { key: 'black_gram', name: 'Black gram', days: 75, sow_months: [10, 11, 12, 2, 3, 6, 7], family: 'legume', legume: true, water: 'low' },
  banana: { key: 'banana', name: 'Banana', days: 330, sow_months: [2, 3, 4, 5, 6], family: 'musa', water: 'high', whole_year: true },
};
const list = [cat.maize, cat.paddy, cat.banana, GREEN_MANURE, cat.black_gram];

test('after maize: paddy faded as the same family, black gram feeds the soil and comes first', () => {
  const a = rowAdvice(list, ['maize'], { seasons, cat });
  expect(a.tags.paddy).toEqual([{ text: 'Same family as maize', good: false }]);
  expect(a.faded.has('paddy')).toBe(true);
  expect(a.tags.black_gram).toEqual([{ text: 'Feeds the soil', good: true }]);
  expect(a.sentence).toBe('After maize, a pulse such as black gram feeds the soil.');
  expect(ordered(list, a).slice(0, 2).map((c) => c.key)).toEqual(['green_manure', 'black_gram']);
  // Green manure in March (the dry months) is advised too.
  expect(a.tags.green_manure).toEqual([{ text: 'Covers the dry months', good: true }]);
});

test('paddy after maize warns on the row; no well fades high-water crops; a harvest in a hard month is shown', () => {
  expect(rowAdvice(list, ['maize', 'paddy'], { seasons, cat }).sentence).toBe('Paddy after maize: the same family, so the soil gets tired.');
  const a = rowAdvice(list, [], { seasons, cat, wells: false, hardMonths: [1] });
  expect(a.tags.paddy).toContainEqual({ text: 'Needs a well', good: false });
  expect(a.tags.maize).toContainEqual({ text: 'Harvest in Jan', good: true });   // sown Oct, 115 days
});

test('no room is a tag, never a block', () => {
  const a = rowAdvice(list, ['maize', 'black_gram', 'maize'], { seasons, cat });
  expect(a.tags.banana).toEqual([{ text: 'No room this year', good: false }]);
  expect(ordered(list, a).map((c) => c.key)).toContain('banana');
});
