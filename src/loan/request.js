// The crop share request (L11 → L9 → she scans on her Ready share → N10), lean (executive decision 23 Oct): the QR
// holds only the amounts, `NILA:L:<rupees>:<hours>`. Her share page already knows the share; she sees the amounts on
// her own screen and confirms, and her own signature on fund_core.draw_loan is the consent. The contract enforces the
// caps and one loan per food token. No leader signature, expiry or nonce in the QR (revises 16 Oct).
const PREFIX = 'NILA:L:';

export const NIN = 10_000_000n; // 7 decimals
const MAX_CASH = 10_000; // ₹10,000 per loan (LOAN_RULES §5)

export const makeRequest = (fields) => ({ request: fields, qr: `${PREFIX}${Number(BigInt(fields.cash) / NIN)}:${fields.hours}` });

export const isLoanRequest = (text) => (text || '').trim().toUpperCase().startsWith(PREFIX);

/** { cash (stroops, string), hours } from a scanned request. Throws a plain reason when it is not one. */
export function readRequest(text) {
  const m = /^NILA:L:(\d{1,5}):(\d{1,4})$/.exec((text || '').trim().toUpperCase());
  if (!m) throw new Error('This is not a Nila crop share request.');
  const rupees = Number(m[1]); const hours = Number(m[2]);
  if (rupees > MAX_CASH || (!rupees && !hours)) throw new Error('This request cannot be used.');
  return { cash: String(BigInt(rupees) * NIN), hours };
}
