import { useState, useEffect, useMemo, useRef } from 'react';
import { useDataContext } from '../../utils/NavigationContext.js';
import { useTransfer, useLoadFundsData } from "../../hooks/useLoadFunds.ts";
import { useActiveLoans } from "../../hooks/useActiveLoans";
import { useContactBook } from "../../hooks/useContactBook";
import useLendingFlow from '../../hooks/useDirectLendingFlow.js'
import { ClaimButton, DropdownButtonLoans, RateSlider } from '../UI/buttons.js';
import { CheckIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/solid';
import QRScanner from "../UI/qrScan.js";
import NameGate from "../UI/NameGate";
import Spinner from '../UI/spinner.js';
import { calculateMINCAP,LoanConditions } from '../../misc/fund_loan_conditions.ts';

const Transfer = ({handleOpenForm }) => {
  const { unionFunds,db }                      = useDataContext()
  const { data: fundsData = [] }               = useLoadFundsData(db?.union?.address, unionFunds ?? [], db?.address)
  const { data: loansData }                     = useActiveLoans(db?.union?.address, db?.union?.leader);
  const { resolveName, hasName, addContact }    = useContactBook();
  const { handleIssueVoucher }                 = useLendingFlow()
  const { transfer }                           = useTransfer()
  const [ fund, setFund ]                      = useState({})
  const [ scan, setScan ]                      = useState(false)
  const [ start, setStart ]                    = useState(false)
  const [ selected, setSelected ]              = useState(false)
  const [ candidate, setCandidate ]            = useState(false)
  const [ _confirm, setConfirm ]               = useState(false)
  const [ conditions, setConditions ]          = useState([])
  const [ openIdx, setOpenIdx ]                = useState(null)
  const [ notEligable, setNotEligable ]        = useState(false)
  const [ APIOffline, setAPIOffline]           = useState(false)
  //const [ amount, setAmount ]                  = useState()  
  //const [ amountConfirmed, setAmountConfirmed ]= useState(false)
  const [ rateConfirmed, setRateConfirmed ]    = useState(false)
  const [ rate, setRate ]                      = useState()
  const [ presets, setPresets ]                = useState()
  const V                                      = useRef()
  const FIXED_APR_TO_PERIODICALLY              = 3.2072 // when we use foodtokens, we can use a crop type specific constant
  const unionLoans                             = loansData?.allItems;

  const bucketThresholdPct = useMemo(() => {
        if (!selected?.fund) return 10;
        const token = fundsData.flatMap(f => f.tokens ?? []).find(t => t.loanType === selected.fund);
        return token?.bucketThresholdPct ?? 10;
  }, [fundsData, selected?.fund]);

  const FUNDCONDITIONS = useMemo(() => {
        const MINCAP = calculateMINCAP(1)
        return LoanConditions(Number(MINCAP), 2000, bucketThresholdPct);
  }, [bucketThresholdPct]);

  const FUNDINFO = {
      "GroundUp Fund":`The loan you selected is part of the ${selected.displayName}. Your new borrower has to meet the same conditions. Select a borrower or rollover the loan (extend the loan to the same borrower).`
  }

  useEffect(() => {
    async function fetchVoucher() {
      // collect CAP, LAND id of farmer
      let fund = unionFunds.filter(f => f[2] === selected.fund)[0]
      console.log('fund', fund)
      console.log('selected', selected)
      if (!fund) return
      // set conditions based on id to the input object
      const conditions = FUNDCONDITIONS[fund[5]]
      setFund(fund)
      const input = {
        conditions: conditions,
        contractname: undefined,
        fundAddress: fund[0],
        fundName: fund[1],
        loanType: fund[2],
        tokenAddress: process.env.REACT_APP_NIN_MAIN,
        type: fund[5],
      }
      const voucher = await handleIssueVoucher(input,undefined,undefined)
      if (!voucher) {
          setAPIOffline(true)
          setNotEligable(false)
      } // if a voucher is returned, we check the conditions.
      else if (voucher && voucher?.conditions.every(x => x[1])){
          setConditions(false)
          // Overwrite the loan ID from the voucher, as this is randomly generated for a new loan
          voucher.voucher.loanId = selected.id // as bytes32, not int
          console.log('voucher with overwritten id', voucher)
          V.current = voucher 
          const amount = voucher.voucher?.normalized_maxAmount   
          const rate_perc = voucher.voucher?.minRateBP / FIXED_APR_TO_PERIODICALLY
          console.log('amount_NIN,rate_perc ', amount,rate_perc )
          setPresets({amount: amount, rate: rate_perc})
          setRate(rate_perc)
          //setAmount(amount_NIN)
          setNotEligable(false)
      } // if the voucher is returned but not all conditions are met, we set the conditions and not eligible.
      else {
          setConditions(voucher.conditions)
          setNotEligable(true)
      }
    }
    fetchVoucher()
    // collect parameters of the fund type (input)

  },[candidate])

  const handleTransfer = () => {
      if (presets.rate <= rate){
          // add choosen amount and rate, format values in voucher
          let _V = V.current.voucher
          _V.chosenRate = rate * 100 * FIXED_APR_TO_PERIODICALLY
          console.log('_V', V)
          // call transfer
          transfer(_V)
      } else {
          // rate is below par. total estimate rate deduction will be transfered to the senior investment bucket!!!
      }
  }

  const [nameGate, setNameGate] = useState(false);

  const handleScanResults = (address) => {
    if (!address) return;
    setCandidate(address)
    if (!hasName(address)) {
      setNameGate(true);
    } else {
      setConfirm(true)
    }
  }

  const measureRate = (rate,pre) => {
      switch (true) {
          case rate < pre:
              return '⚠️ Current Funding conditions make borrowing at this rate unlikely.'
          case rate >= pre && rate <= pre + 3:
              return '🎉 This we think is a fair rate.'
          case rate > pre + 3:
              return 'Your loan will likely get approved soon.'
          default:
              return 'Slide to set a rate.'
      }
  }

  return (
    <div className='p-4'>
      <p className="flex font-bold mb-6 justify-center dark:text-white">Start a transfer</p>
      { !start ?
      <>
      <p className="flex text-xs mb-6 mx-6 dark:text-slate-400">As a leader you can transfer or rollover loans from members, to avoid high cash fees.</p>
      <p className="flex text-xs mb-6 mx-6 dark:text-slate-400">❗to start, make sure the member has paid the interest over the old loan in full, and your union has deposited sufficient collateral. After that you have 3 days to transfer a loan.</p>
      <ClaimButton disabled={false} handleClick={() => setStart(true)} title={'Start'}/>
      </>
      :
      <>
      { selected && selected.withincarryover && <div className='relative mx-4 z-0 my-2 rounded-xl bg-gray-200 px-4 py-3 dark:bg-slate-400 dark:text-white shadow-2xl backdrop-blur'>❗This loan is still within the carryover window. No interest has to paid.</div>}
      { selected && !selected.maturityTs && <div className='relative mx-4 z-10 my-2 rounded-xl bg-gray-200 px-4 py-3 dark:bg-slate-400 dark:text-white shadow-2xl backdrop-blur'>❗There is no harvest detected on this member's field. You can only transfer the loan to another member.</div>}
      {/* Select a member*/}
      <h3 className='p-4 my-6 font-bold dark:text-white'>Please select the loan you wish to transfer:</h3>
      { unionLoans ? 
            <DropdownButtonLoans options={unionLoans} onSelect={(f) => setSelected(f)} color='white' resolveName={resolveName} />
            :
            <div>
            <Spinner size={'small'} stages={'Loading all active loans in your union'} />
            </div>
      }
      {/* Select transfer candidate */}

      { selected && !candidate &&
        <>
        <p className='p-6 text-xs dark:text-slate-400'>{FUNDINFO[selected.displayName]}</p>
        { !candidate && !scan && 
        <div className='flex flex-row justify-evenly'>
          { selected.maturityTs ? <ClaimButton disabled={false} color='white' handleClick={() => setCandidate(selected.borrower)} title='Rollover loan' /> : ''}
          <ClaimButton disabled={false} color='white' handleClick={() => setScan(true)} title='Scan a QR' />
        </div>
        }
        { scan &&
        <>
        <div className="flex flex-col w-[auto] max-w-[98vw] bg-gray-200 dark:bg-slate-800 aspect-square rounded-full justify-between p-4">
            <QRScanner sendTo={handleScanResults}/>
        </div>
        <div className='flex flex-row text-xs p-8' >
          <InformationCircleIcon className='text-gray-300 dark:text-slate-500 w-1/5 mx-3' /> 
          <p className='dark:text-slate-400'>On a members phone, go to <b>Assets</b> and click the <b>QR</b> icon in the left top corner.</p>
        </div>
        <div onClick={() => setScan(false)} className='flex dark:text-white justify-center'>Change method</div>
        </>
        }
        </>
      }
      {/* ── Name gate after QR scan ── */}
      { nameGate && candidate && (
        <NameGate
          address={candidate}
          onConfirm={(addr, name) => {
            addContact(addr, name);
            setNameGate(false);
            setConfirm(true);
          }}
          onSkip={() => {
            setNameGate(false);
            setConfirm(true);
          }}
        />
      )}

      {/* Apply for a voucher*/}
      { candidate && fund &&
          <>
          { conditions && conditions.map((f,i) => (
              <div key={i} onClick={() => setOpenIdx(openIdx === i ? null : i)} className='flex text-xs justify-end p-3 flex-row'>
                  <div className='flex flex-col text-end'>
                      <span>- {f[0]}</span>
                      {openIdx === i && (
                          <p className={`p-2 my-2 w-full font-bold ${f[1] ? 'text-green': 'text-red'}`}>{f[3]}</p>
                      )}
                  </div>
                  <CheckIcon className='mx-3 h-5 w-5 text-green' hidden={!f[1]} />
                  <XMarkIcon className='mx-3 h-5 w-5 text-red' hidden={f[1]} />
              </div>
          ))}
          { !conditions ?
            <>
            <div className='flex flex-row p-8 dark:text-white'>All conditions approved<CheckIcon className='mx-3 h-5 w-5 text-green' /></div>
            {/*
            <hr className="w-full border-t border-gray-500 m-4" />
            <h3 className='p-1 font-bold'>Update amount:</h3>
            { !amountConfirmed ? 
            <AmountInput value={amount} initial={presets?.amount} color='white' onSet={() => setAmountConfirmed(true)} onChange={(e) => setAmount(!e ? 0 : e)} />
            :
            <div className='flex flex-row justify-between my-4 px-4'>
                <div className='flex flex-row'>
                <p>{`nIN ${amount.toFixed(0)}/-`}</p>
                <CheckIcon className={`mx-3 h-5 w-5 ${amount > presets.amount ? ' text-red' : 'text-green'}`} />
                </div>
                <p onClick={() => setAmountConfirmed(false)} className='mx-3 h-5 w-5'>edit</p>
            </div>
            }
            */}
            <>
            <hr className="w-full border-t border-gray-500 m-4" />
            <h3 className='p-1 mb-3 font-bold dark:text-white'>Update rate: <span className='text-red'>(APR: ~{(rate * FIXED_APR_TO_PERIODICALLY).toFixed(2)}%)</span></h3>
            { !rateConfirmed ?
            <div className='flex flex-col items-center'>
                <p className='text-xs p-1 pb-6 dark:text-slate-400'>Rate limits fluctuate, always check fund liquidity!</p>
                <RateSlider type={'percentage'} decimals={1} initial={rate} onSet={() => setRateConfirmed(true)} max={50} onChange={v => setRate(v)} />
                <p className='text-xs p-1 pt-3 pb-9 dark:text-slate-400'>{measureRate(rate,presets.rate)}</p>
            </div>
            :
            <div className='flex flex-row justify-between dark:text-white my-4 px-4'>
                <div className='flex flex-row'>
                <p>{`${rate.toFixed(2)}%`}</p>
                <CheckIcon className={`mx-3 h-5 w-5 ${rate < presets.rate ? ' text-red' : 'text-green'}`} />
                </div>
                <p onClick={() => setRateConfirmed(false)} className='mx-3 h-5 w-5'>edit</p>
            </div>
            }
            <ClaimButton disabled={rateConfirmed ? false : true} handleClick={() => handleTransfer()} title={presets.rate <= rate ? 'Transfer the loan' : 'Low rate, Wait to confirm.'} /> 
            </>
            </>
            :
            <Spinner size={'small'} />
          }
          </>
        }
    </>
    }
    </div>
    );
  };

export default Transfer
