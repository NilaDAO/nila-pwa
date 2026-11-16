// The member edits the crop plan (executive decision 16 Nov, LOAN_RULES "Member review of the crop plan").
// NEW TEXTS, not approved yet: shown to the product owner before release. Each text is used through these constants
// only. The condition wording itself comes from the node (nila-sensing plan/engine.py CONDITION_TEXT).
export const EDIT_TEXT = {
  // After a crop in a block sown more than 6 weeks ago (the bar on the area card, the area in the season list).
  locked: 'locked',
  // The heading over the pros and cons of the last update (Haiku, nila-sensing plan/llm.py pros_cons).
  prosCons: 'What your change means',
  // A pro and a con, before each sentence.
  pro: '+',
  con: '−',
  // The heading over the conditions, each with a checkbox; the plan is accepted only with all of them ticked.
  conditions: 'Tick each one to accept the plan',
};
