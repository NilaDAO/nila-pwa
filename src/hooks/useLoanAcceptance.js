import { useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useAcceptLoan, useRemoveLoan } from './useLoadFunds.ts';
import { useFxPool } from './useWallet.ts';

/**
 * Shared accept/cancel handlers for slow-draw loans awaiting union approval.
 *
 * Consumed by both useFilterTasks (task list) and ActiveLoansCard (Cash & Liquidity).
 *
 * @param onDismiss optional callback fired before the contract call so callers
 *                  can hide the row optimistically (e.g. task-list dismissal).
 */
export function useLoanAcceptance({ onDismiss } = {}) {
  const queryClient = useQueryClient();
  const { acceptLoan } = useAcceptLoan();
  const { removeLoan } = useRemoveLoan();
  const { redeemFarmerNin, postRedeemOrder } = useFxPool();
  const API = process.env.REACT_APP_API_BASE_URL;

  const handleAcceptLoan = async (union, id, borrower, borrowerAddr, amount, lpOpts) => {
    if (!confirm(`Accept the loan of ${Math.round(amount).toLocaleString('en-IN')} nIN to ${borrower}?`)) return;
    onDismiss?.(id);
    await acceptLoan(union, id);

    if (lpOpts?.sendLP && lpOpts.amount > 0) {
      try {
        const amountRaw = ethers.parseUnits(String(lpOpts.amount), 18);
        const usdtOut = await redeemFarmerNin(borrowerAddr, amountRaw);
        await postRedeemOrder(union, borrowerAddr, BigInt(lpOpts.amount), usdtOut, amountRaw, 100);
        queryClient.invalidateQueries({ queryKey: ['globalOpenCashOffers'] });
        queryClient.invalidateQueries({ queryKey: ['globalOpenRedeemOrders'] });
      } catch (e) { console.error('LP offer creation failed:', e); }
    }
    queryClient.invalidateQueries({ queryKey: ['activeLoans'] });
  };

  const handleCancelLoan = async (union, id, borrower, txHash) => {
    if (!confirm(`Cancel the loan request from ${borrower}?`)) return;
    onDismiss?.(id);
    if (txHash) await removeLoan(union, id);
    await fetch(`${API}/filter_events/loan/${union}/${id}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['activeLoans'] });
  };

  return { handleAcceptLoan, handleCancelLoan };
}

export default useLoanAcceptance;
