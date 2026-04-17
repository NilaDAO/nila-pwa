// src/utils/fundAnalytics.ts
import type { GenericFundData, GenericTokenData } from '../hooks/useLoadFunds.ts';
import type { Bal } from '../hooks/useLoadETH.ts';

export interface FundSummary {
  total_invested: number;
  total_rewards: number;
  total_rewards_raw: number;
  total_investedByUser: number;
  isFrozen: boolean;
  funds: Array<{
    address: string;
    fund_type: string;
    tokens: string[];
    principal: number;
    principal_raw: number;
    pending: number;
    pending_raw: number;
    juniorCash: number;
  }>;
}

export function totalFunds(
  allFunds: GenericFundData[],
  tokenData: Bal[]
): FundSummary {
  let total_rewards = 0;
  let total_rewards_raw = 0;
  let total_invested = 0;
  let total_investedByUser = 0;
  let isFrozen = false;

  const funds = allFunds.map(fund => {
    // Sum principals (priced)
    const principal = fund.tokens.reduce((sum, t) => {
      const price = tokenData.find(td => td.sym === t.name)?.p ?? 1; // fallback 1:1 when price missing
      return sum + t.investor.principal * price;
    }, 0);

    // Sum raw principals
    const principal_raw = fund.tokens.reduce((sum, t) => sum + t.investor.principal, 0);

    // Sum pending withdrawals (priced) — shares requested for unbond, not yet claimed
    const pendingWithdrawal = fund.tokens.reduce((sum, t) => {
      const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;
      return sum + t.investor.pendingWithdrawal * price;
    }, 0);

    // set fund type
    const fund_type = fund.type
    const fund_id = fund.tokens[0].loanType
    const previewRateBP = fund.tokens[0].previewRateBP
    const baseRateBP = fund.tokens[0].baseRateBP
    const requiredReserve = fund.tokens[0].requiredReserve
    const junior = fund.tokens[0].investor.junior
    const senior = fund.tokens[0].investor.senior
    const seniorPendingSnap = fund.tokens[0].investor.seniorPendingSnap ?? 0
    const indexes = fund.tokens[0].indexes
    const entryIndexes = fund.tokens[0].entryIndexes
    // list accepted tokens
    const tokens = fund.tokens.map(t => t.token);

    let pending = 0;
    let pending_raw = 0;
    let pendingByTranche = {
      'junior': 0,
      'senior': 0,
    }
    // Sum pending rewards (priced)

    // FIX-INPUT -> manually remove INPUT fund rewards
    console.log('fund_type', fund_type)
    if(fund_type !== 'INPUT'){
        pending = fund.tokens.reduce((sum, t) => {
        const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;
        return sum + t.investor.pending * price;
      }, 0);

      // Sum pending rewards
      pending_raw = fund.tokens.reduce((sum, t) => sum + t.investor.pending, 0);

      pendingByTranche = {
        'junior': fund.tokens[0].investor.j_pending,
        'senior':fund.tokens[0].investor.s_pending
      }
    }

    // Sum total funds for this fund (priced)
    const totals = fund.tokens.reduce((sum, t) => {
      const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;
      return sum + t.totals.funds * price;
    }, 0);

    // Sum total funds for this fund (priced)
    const lent = fund.tokens.reduce((sum, t) => {
      const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;
      return sum + t.totals.lent * price;
    }, 0);

    // Accumulate global totals
    total_rewards += pending;
    total_rewards_raw += pending_raw
    total_investedByUser += fund.tokens.reduce((sum, t) => {
      const price = tokenData.find(td => td.sym === t.name)?.p ?? 1;
      return sum + (t.investor.principal - t.investor.pendingWithdrawal) * price;
    }, 0);
    total_invested += totals;
    if (fund.tokens.some(t => t.investor.isFrozen)) {
      isFrozen = true;
    }

    return {
      address: fund.fund,
      tokens,
      fund_type,
      fund_id,
      junior,
      senior,
      seniorPendingSnap,
      indexes,
      entryIndexes,
      previewRateBP,
      baseRateBP,
      requiredReserve,
      idleCash: fund.tokens[0].idleCash ?? 0,
      claimableReserved: fund.tokens[0].claimableReserved ?? 0,
      juniorCash: fund.tokens[0].juniorCash ?? 0,
      principal,
      principal_raw,
      pendingByTranche,
      pending,
      pending_raw,
      pendingWithdrawal,
      totals,
      lent,
    };
  });

  return {
    total_rewards,
    total_rewards_raw,
    total_investedByUser,
    total_invested,
    isFrozen,
    funds,
  };
}
