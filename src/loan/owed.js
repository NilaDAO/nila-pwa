// What a crop share owes today (executive decision 26 Oct): the cash part and the voucher's value, both lent at the
// draw, each with simple interest at the loan's rate since its last accrual, plus the union treasury's 5% of handed-back
// voucher hours. In nIN units (7 decimals), as fund_core keeps them; `vb` is fund_core.voucher_book (null: no voucher).
const YEAR = 365n * 86_400n;
const FLAG = { overdue: 1, defaulted: 2, closed: 4, drawn: 8 };   // fund_core LoanState.flags

/** The loan inside a fund_core.food_token entry (get_loan was dropped 30 Oct): the loan's fields with the borrower and
 *  the flags unpacked; null when the share was never drawn. */
export function loanOf(ft) {
  const l = ft?.loan;
  if (!l || !(Number(l.flags) & FLAG.drawn)) return null;
  const f = Number(l.flags);
  return { ...l, borrower: ft.member, overdue: !!(f & FLAG.overdue), defaulted: !!(f & FLAG.defaulted), closed: !!(f & FLAG.closed) };
}
const big = (v) => BigInt(v ?? 0);

export function owedOf(loan, vb, now = Math.floor(Date.now() / 1000)) {
  if (!loan) return 0n;
  const t = BigInt(now);
  const cashOut = big(loan.principal) - big(loan.principal_paid);
  const cashInt = big(loan.interest_accrued) - big(loan.interest_paid)
    + (cashOut * big(loan.rate_bp) * (t > big(loan.last_accrual_ts) ? t - big(loan.last_accrual_ts) : 0n)) / (10_000n * YEAR);
  if (!vb) return cashOut + cashInt;
  const vOut = big(vb.value) - big(vb.repaid);
  const vInt = big(vb.interest_accrued) - big(vb.interest_paid)
    + (vOut * big(loan.rate_bp) * (t > big(vb.last_accrual_ts) ? t - big(vb.last_accrual_ts) : 0n)) / (10_000n * YEAR);
  return cashOut + cashInt + vOut + vInt + big(vb.fee_due);
}
