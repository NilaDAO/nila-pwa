/** Invest at the desk (7 Nov): the amount set under Bring cash to the office is invested; the rest of the count is
 *  handed back as change. Without an amount the whole count is invested (as before). Whole rupees. */
export function investSplit(total, amount) {
  const invest = amount > 0 ? Math.min(Math.round(amount), Math.round(total)) : Math.round(total);
  return { invest, change: Math.max(0, Math.round(total) - invest) };
}
