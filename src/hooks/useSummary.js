import { useEffect, useState, useCallback } from 'react';
import { totalFunds } from '../utils/FundsAnalytics.ts';
import { useQuery }  from "@tanstack/react-query";
import { useErc20Balances } from '../hooks/useLoadETH.ts'
import { useLoadFundsData } from '../hooks/useLoadFunds.ts'
import { useDataContext } from '../utils/NavigationContext';
import { setDBitem } from '../utils/db.js';

export function useSummary(chain,address,funds) {
  const { db }              = useDataContext();
  const { data: fundData }  = useLoadFundsData(db?.union?.address,funds,address)
  const { data: tokenData } = useErc20Balances(chain,address,{ enabled: false })

  // 1) set up the sums query, but keep it disabled by default
  const sumsQ = useQuery({
    queryKey: ['sums', fundData, tokenData],
    queryFn: () => totalFunds(fundData, tokenData),
    enabled: false,  // ← is always fetched on refetch(), not on init.
  })

  useEffect(() => {
    if (fundData && tokenData) {
      console.log('tokendata in useSum', tokenData)
      console.log('fundData in useSum', fundData)

      sumsQ.refetch()
      .then(({ data: newSums }) => {
        setDBitem('union_fund_sums', newSums, 'Init')
      })
    }
  }, [fundData, tokenData])


  return sumsQ
}