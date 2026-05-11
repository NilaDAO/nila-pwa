import { useState, useEffect } from 'react';
import { ethers, decodeBytes32String } from 'ethers';
import { useProvider } from './useWallet.ts';
import { useDataContext } from '../utils/NavigationContext.js';
import genericFundViewerArtifact from '../components/ABI/genericFundViewer.json';
import genericFundCoreArtifact from '../components/ABI/genericFundCore.json';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
import MulticallAbi from '../components/ABI/MultiCall3.json';

const genericFundViewerAbi = genericFundViewerArtifact.abi;
const genericFundCoreAbi = genericFundCoreArtifact.abi;
const nilaFxPoolAbi = nilaFxPoolArtifact.abi ?? nilaFxPoolArtifact;
const genericFundViewerAddress = process.env.REACT_APP_VIEWER_MAIN;
const genericFundCoreAddress = process.env.REACT_APP_CORE_MAIN;
const fxPoolAddress = process.env.REACT_APP_FX_POOL_MAIN;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const decimals = 18;

/**
 * Fetch all open loans for a given member address in the user's union.
 * Also fetches collectDeadline and escrowDuration (seconds) from the union's ReserveCfg.
 * Returns { loans, collectDeadline, escrowDuration, loading, error }
 * Each loan: { loanID, loanType, principal, outstanding, rateBP, drawdownTs, union }
 */
export function useMemberLoans(memberAddress, loanId = null) {
  const { provider } = useProvider();
  const { db } = useDataContext();
  const [loans, setLoans] = useState([]);
  const [collectDeadline, setCollectDeadline] = useState(null); // seconds (uint32), null until loaded
  const [escrowDuration, setEscrowDuration] = useState(null);   // seconds — effective escrow window
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const unionAddress = db?.union?.address;

  useEffect(() => {
    if ((!memberAddress && !loanId) || !unionAddress || !provider) {
      setLoans([]);
      setCollectDeadline(null);
      setEscrowDuration(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const viewer = new ethers.Contract(genericFundViewerAddress, genericFundViewerAbi, provider);
        const core = new ethers.Contract(genericFundCoreAddress, genericFundCoreAbi, provider);
        const fxPool = new ethers.Contract(fxPoolAddress, nilaFxPoolAbi, provider);
        const mc = new ethers.Contract(MULTICALL3, MulticallAbi, provider);
        const viewerIface = new ethers.Interface(genericFundViewerAbi);

        // Fetch reserveCfg and FxPool global escrow duration.
        // Loan IDs: if a loanId was pre-supplied (from portfolio view), use it directly
        // to bypass the borrower index (which can fail for transferred loans).
        // Otherwise fall back to getLoansByBorrower.
        const [idsFromChain, reserveCfg, globalEscrow] = await Promise.all([
          loanId
            ? Promise.resolve([BigInt(loanId)])
            : viewer.getLoansByBorrower(unionAddress, memberAddress),
          core.reserveCfgByUnion(unionAddress),
          fxPool.escrowDuration(),
        ]);
        const ids = idsFromChain;

        if (!cancelled) {
          setCollectDeadline(Number(reserveCfg.collectDeadline));
          const perUnion = Number(reserveCfg.escrowDuration);
          setEscrowDuration(perUnion > 0 ? perUnion : Number(globalEscrow));
        }

        if (!ids || ids.length === 0) {
          if (!cancelled) { setLoans([]); setLoading(false); }
          return;
        }

        const calls = [...ids].map((id) => [
          genericFundViewerAddress,
          viewerIface.encodeFunctionData('getBorrowerInfo', [unionAddress, id]),
        ]);

        const [, ret] = await mc.aggregate.staticCall(calls);

        const result = [];
        ret.forEach((data, j) => {
          const {
            borrower,
            loanType,
            principal,
            principalRepaid,
            rateBP,
            dueDate,
            closed,
            defaulted,
            outstanding,
            drawdownTs,
            digestTs,
          } = viewerIface.decodeFunctionResult('getBorrowerInfo', data);

          if (closed) return;

          result.push({
            loanID: ids[j],
            loanType: decodeBytes32String(loanType),
            principalRaw: principal,     // exact bigint — use for on-chain calls
            principal: Number(ethers.formatUnits(principal, decimals)),
            principalRepaid: Number(ethers.formatUnits(principalRepaid, decimals)),
            outstanding: Number(ethers.formatUnits(outstanding, decimals)),
            rateBP: Number(rateBP),
            defaulted,
            drawdownTs,   // 0n = pending (not yet drawn), non-zero = active
            digestTs,
            dueDate: Number(dueDate),
            union: unionAddress,
            borrower,
          });
        });

        if (!cancelled) {
          setLoans(result);
          setLoading(false);
        }
      } catch (e) {
        console.error('useMemberLoans error', e);
        if (!cancelled) { setError(e); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [memberAddress, loanId, unionAddress, provider]);

  return { loans, collectDeadline, escrowDuration, loading, error };
}

/**
 * Pick the best matching loan for a given purpose.
 * 'repay' → active loan (drawdownTs != 0) with highest rateBP
 * 'give'  → pending loan first; if none, active loan within collectDeadline window
 */
export function pickLoan(loans, purpose, collectDeadline = null) {
  if (!loans || loans.length === 0) return null;
  if (purpose === 'give') {
    const pending = loans.find((l) => l.drawdownTs === 0n || l.drawdownTs === BigInt(0));
    if (pending) return pending;
    // Active loan within the cash-out window (drawdownTs + collectDeadline > now)
    if (collectDeadline !== null) {
      const nowSec = Math.floor(Date.now() / 1000);
      const withinWindow = loans
        .filter((l) => l.drawdownTs !== 0n && l.drawdownTs !== BigInt(0) && !l.defaulted)
        .filter((l) => nowSec - Number(l.drawdownTs) < collectDeadline);
      if (withinWindow.length > 0) return withinWindow[0];
    }
    return null;
  }
  // repay: active loans sorted by rate desc
  const active = loans.filter((l) => l.drawdownTs !== 0n && l.drawdownTs !== BigInt(0) && !l.defaulted);
  if (active.length === 0) return null;
  return active.sort((a, b) => b.rateBP - a.rateBP)[0];
}
