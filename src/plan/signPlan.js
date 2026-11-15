// Sign later (plan 050, 15 Nov): her phone signs a crop plan the leader accepted for her, at one scan of her QR. One
// take-up (NILA:L, draw_loan with the plan's cash and hours) per crop agreement and one machine voucher (NILA:V,
// machinery.claim) per planned machine pass, each valid until that crop's last draw date (at most ~6 months: the
// network's max_entry_ttl is 3,110,400 ledgers). The node keeps them: a leader sends the take-up at the desk; a voucher
// goes to a machine owner only with the code from her SMS.
import { server, tokenHex } from '../stellar/soroban';
import { signDeskCode } from '../loan/deskCode';
import { signVoucherCode } from '../machine/voucherCode';

const MAX_LEDGERS = 3_000_000;   // under max_entry_ttl, with room for the ledgers that pass while she signs
const DAY = 17_280;              // ledgers

/** Signs every code of `planId` with her key and stores them on the node. Returns how many were stored. */
export async function signPlan({ cfg, api, s, planId }) {
  const list = await api.mintList(planId);
  const latest = (await server(cfg).getLatestLedger()).sequence;
  const now = Date.now() / 1000;
  let n = 0;   // each code its own expiry ledger: it is also its nonce
  const codes = [];
  for (const m of list.mints || []) {
    if (!m.token_id || !m.attest) continue;
    const token = tokenHex(m.token_id);   // the mint list's token ids are decimal
    const ledgers = Math.min(MAX_LEDGERS, Math.max(DAY, Math.floor((Number(m.attest.final_date) - now) / 5)));
    const l = await signDeskCode({ cfg, account: s.stellarAddress, signer: s.senderAddress, signHash: s.signHash, kind: 'L',
      token, cash: BigInt(m.attest.amount), hours: m.attest.hours, exp: latest + ledgers - n });
    n += 1;
    codes.push({ kind: 'L', token, code: l.qr });
    for (const p of m.attest.passes || []) {
      if (!(p.units > 0)) continue;
      const v = await signVoucherCode({ cfg, signer: s.senderAddress, signHash: s.signHash, token, units: p.units, exp: latest + ledgers - n });
      n += 1;
      codes.push({ kind: 'V', token, code: v.qr });
    }
  }
  const out = await api.storeCodes(planId, codes);
  return out.stored;
}
