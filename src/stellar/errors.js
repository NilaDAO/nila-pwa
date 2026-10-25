// A contract's refusal in plain words (24 Oct): the RPC's simulation error is a long diagnostic dump; N3 shows this
// instead. The refusing contract is the one whose diagnostic event carries the error; its number is looked up in the
// contract's Error enum (nila-soroban). Unknown codes keep the contract's name and the code.
const MESSAGES = {
  fx_pool: {
    4: 'The amount is zero.',
    5: 'Above the most one count may record (₹10,000).',
    6: 'The rupee rate is out of date. Try again in a few minutes.',
    8: 'The cash desk is paused.',
    9: 'Only a leader of the union can do this.',
    10: 'This account is not a member of the union.',
    11: "The cash at the office would be more than the union's treasury.",
    13: 'Too many open cash batches at the office. Let an LP collect cash first.',
    15: 'This has expired.',
    16: 'This code was used already.',
    18: 'The repay names no loan.',
    25: 'This account is not an accepted LP.',
    28: "The union's USDC does not cover this.",
    33: "The anchor has not checked this account's identity yet.",
  },
  fund_core: {
    2: 'The amount is zero.',
    3: "The union's reserve would be too low.",
    4: 'Not enough member money in the union right now.',
    5: 'Nothing to collect yet.',
    6: 'The 14 days are not over yet.',
    7: 'A land title of the union is needed.',
    15: 'There is no loan on this crop share.',
    16: 'This loan is closed already.',
    27: 'Lending is paused.',
    32: 'Above the loan limit.',
    34: 'At least ₹600 must be invested in the union first.',
    35: 'Lending is on hold: a loan of the union is overdue.',
    37: 'The repay date has not passed yet.',
    39: 'Too many open crop shares.',
    41: 'Only a leader of the union can do this.',
    44: 'This crop share is not attested for this member.',
    45: 'This crop share is used already.',
    46: 'Not open yet: a crop share can be used from a week before its sowing time.',
    47: 'More cash than the crop share allows.',
    48: "The treasury would fall below the cash at the office.",
    53: 'Not enough senior money to back the machine vouchers.',
    56: 'Nothing is owed yet.',
    57: 'This crop share is not this member’s loan.',
    58: 'This crop share is planned outside its crop'\''s sowing time.',
    59: 'This crop share was not used in time and has lapsed.',
    60: 'Too late for this cycle: the last day to use this crop share has passed.',
    61: 'This crop share can still be used: its last day has not passed yet.',
  },
  machinery: {
    5: 'This account is not a member of the union.',
    6: 'This machine is not the owner’s.',
    7: 'The union has no rate for this machine type.',
    10: 'The machine is not confirmed by its owner, or it is on hold.',
    11: 'More hours than the voucher code, the voucher or the machine’s week allows.',
    15: 'Machine vouchers are paused.',
    20: 'An owner cannot claim on their own voucher.',
  },
};

/** The plain reason for a failed call, or the message as it came when it is not a contract error. */
export function plainError(message, cfg) {
  const m = String(message || '');
  const code = /Error\(Contract, #(\d+)\)/.exec(m);
  if (!code) return m;
  // The contract that raised it: "contract:C…, topics:[error, Error(Contract, #N)]".
  const who = new RegExp(`contract:(C[A-Z2-7]{55}), topics:\\[error, Error\\(Contract, #${code[1]}\\)`).exec(m)?.[1];
  const name = Object.entries(cfg?.contracts || {}).find(([, id]) => id === who)?.[0];
  const text = name && MESSAGES[name]?.[Number(code[1])];
  return text || `The ${name ? name.replace('_', ' ') : 'Nila'} contract refused this (error ${code[1]}).`;
}
