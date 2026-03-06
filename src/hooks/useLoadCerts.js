// useLoadCerts.js
import { useState, useEffect, useMemo } from 'react'
import { useDataContext } from '../utils/NavigationContext';
import { ethers, EventLog } from "ethers";
import { useProvider } from "./useWallet.ts";
import nilaGrantAbi  from '../components/ABI/NilaGrant.json';
import { readItem,setDBitem } from "../utils/db";
import { converseDate } from "../utils/loadfund_helpers.ts"
const nilaGrantContract = String(process.env.REACT_APP_GRANT_ADDRESS)


export default function useLoadCerts() {
  const { db, grantData } = useDataContext()
  const { provider } = useProvider()
  const [imageList, setImageList] = useState([])

  // static labels (never change)
  const labels = useMemo(() => [
    { month: 0, type: '2', label: 'protected designation (PDO)', claimed: true, date: '-', amount: 1, tab: false },
    { month: 0, type: '5', label: 'quality',            claimed: true, date: '-', amount: 1, tab: false },
    { month: 0, type: '6', label: 'sustainability',     claimed: true, date: '-', amount: 1, tab: false },
    { month: 0, type: '3', label: 'fair trade',         claimed: true, date: '-', amount: 1, tab: false },
    { month: 0, type: '4', label: 'organic',            claimed: true, date: '-', amount: 1, tab: false },
  ], [])

  async function updateGrantDB(i, mth, amt, claimed) {
    // 1) pull the single reload record
    const rec = await readItem("reload", "Init");
    const { expired, land } = rec.value          

    // guard in case nothing is there yet
    const { months = [], amounts = [], claims = [] } = rec.value.grant || {}

    // 2) mutate only the grant sub‐object
    months[i]   = mth
    amounts[i]  = amt
    claims[i]   = claimed

    // 3) write it back
    const updated = { 
      expired,
      land,
      grant:  { ...rec.value.grant, months, amounts, claims },
    }
    console.log('updated', updated)
    await setDBitem('reload', updated, 'Init')            // or your equivalent .set/.put API
  }

  // WE NEED TO UPDATE THE GRANT CLAIM (NOT USE FILTER), SIMPLE LAST TARGETMONTH BY USER IN A MAPPING! THE FILTER HERE SHOULD BE REMOVED!!!  
  useEffect(() => {
    if (!grantData) return

    let cancelled = false
    const grant = new ethers.Contract(nilaGrantContract, nilaGrantAbi, provider)

    const load = async () => {
      // 1) latestGrant (always present)
      const latestGrant = {
        month:   Math.floor(grantData.currentMonth),
        type:    '1',
        label:   '',
        date:    converseDate(grantData.currentUnix),
        date_epoch: new Date(grantData.currentUnix * 1000),
        amount:  grantData.pending,
        tab:     false,
        claimed: grantData.alreadyClaimed,
      }

      // 2) historical arrays from IndexedDB
      const { months: histMths, amounts: histAmts, claims: histClaims } = db?.reload?.grant || {}

      // 3) fetch per-month events for the past 12 months
      const GRANTS = []
      const ONE_MONTH_BLOCKS = 1142101

      for (let i = 0; i < 12; i++) {
        // compute the “month index” we’re asking about
        const targetMonth = Math.floor(grantData.currentMonth) - i
        const unixForMonth = grantData.currentUnix - (2629743 * i)
        
        // already in storage?
        if (histMths?.[i] != null) {
          GRANTS.push({
            month:  histMths[i],
            type:   '1',
            label:  '',
            date:   converseDate(unixForMonth),
            date_epoch: new Date(unixForMonth * 1000),
            amount: histAmts[i],
            tab:    false,
            claimed: histClaims[i],
          })

        } else {
          // need to query chain
          const filter = grant.filters.GrantClaimed(db.address, targetMonth)
          let events = []
          const startBlock = grantData.currentBlock - ONE_MONTH_BLOCKS
          const step       = 100_000

          for (let start = startBlock; start <= grantData.currentBlock; start += step) {
            const end   = Math.min(start + step - 1, grantData.currentBlock)
            const chunk = await grant.queryFilter(filter, start, end)
            events.push(...chunk)
          }

          // take the first matching event (if any)
          const ev = events[0]
          const amt   = ev ? Number(ev.args[2]) / 1e18 : 0
          const mth   = ev ? Number(ev.args[1]) : false

          GRANTS.push({
            month:  targetMonth,
            type:   '1',
            label:  '',
            date:   converseDate(unixForMonth),
            date_epoch: new Date(unixForMonth * 1000),
            amount: amt,
            tab:    false,
            claimed: mth,
          })

          await updateGrantDB(i, targetMonth, amt, mth)

        }
      }

      if (!cancelled) {
        const FIRSTITEM = grantData.alreadyClaimed ? GRANTS[0] : latestGrant
        // note: slice(1) on labels to drop the first “0” placeholder if you want…
        setImageList([FIRSTITEM,...labels, ...GRANTS?.slice(1)])
      }
    }

    load()
      .catch(console.error)

    return () => { cancelled = true }
  }, [grantData, db, labels, provider])

  return { imageList }
}
