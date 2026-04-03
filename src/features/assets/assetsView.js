import { useState, useEffect } from "react";
import { LockClosedIcon } from '@heroicons/react/20/solid'
import { ExchangeButton, ClaimButton, IndividualExchangeButton } from '../../components/UI/buttons';
import { useDataContext } from "../../utils/NavigationContext";
import { useFxPool } from "../../hooks/useWallet.ts";
import { formatUnits } from 'ethers';

const FEE = 0.998;

// ── USDT Swap card ────────────────────────────────────────────────────────────
export const UsdtSwapCard = ({ ninBalance, usdtBalance, exchangeRate, handleOpenForm }) => {
  const { redeemNin, mintNin, quoteRedeem } = useFxPool();
  const [dir, setDir]         = useState('sell'); // 'sell' nIN→USDT, 'buy' USDT→nIN
  const [amount, setAmount]   = useState(0);
  const [step, setStep]       = useState('input'); // 'input' | 'confirm'
  const [quote, setQuote]     = useState(null);
  const [quoteLoading, setQL] = useState(false);

  const isSell  = dir === 'sell';
  const maxNin  = Number(ninBalance  ?? 0);
  const maxUsdt = Number(usdtBalance ?? 0);

  useEffect(() => { setAmount(0); setQuote(null); setStep('input'); }, [dir]);

  useEffect(() => {
    if (!isSell || amount <= 0 || !quoteRedeem) { setQuote(null); return; }
    let active = true;
    setQL(true);
    quoteRedeem(amount)
      .then(res => {
        if (!active) return;
        const usdtOut = res?.usdtOut ?? res?.[0] ?? 0n;
        const feeUsdt = res?.feeUsdt ?? res?.[1] ?? 0n;
        setQuote({ usdtOut: Number(formatUnits(usdtOut, 6)), feeUsdt: Number(formatUnits(feeUsdt, 6)) });
      })
      .catch(() => setQuote(null))
      .finally(() => { if (active) setQL(false); });
    return () => { active = false; };
  }, [amount, isSell, quoteRedeem]);

  const handleStep = (n) => setAmount(a => Math.max(0, a + n));
  const handleMax  = () => setAmount(
    isSell
      ? Math.floor(maxNin / 100) * 100
      : Math.floor((maxUsdt / exchangeRate) / 100) * 100
  );

  const handleConfirm = async () => {
    const ok = isSell
      ? await redeemNin(amount)
      : await mintNin(amount * exchangeRate);
    if (ok) handleOpenForm('receipts');
  };

  const receiveLabel = isSell
    ? (quote ? `${quote.usdtOut.toLocaleString('en-IN', { maximumFractionDigits: 2 })} USDT` : `≈${(amount * FEE).toLocaleString('en-IN')} USDT`)
    : `${amount.toLocaleString('en-IN')} nIN`;

  return (
    <div className="bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 shadow-bottom flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">USDT Swap</p>
        <div className="flex gap-1">
          <button
            onClick={() => setDir('sell')}
            className={`text-xs px-3 py-1 rounded-full font-semibold ${isSell ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
          >nIN → USDT</button>
          <button
            onClick={() => setDir('buy')}
            className={`text-xs px-3 py-1 rounded-full font-semibold ${!isSell ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-slate-600 dark:text-white'}`}
          >USDT → nIN</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-400">
        Balance: {isSell
          ? `${maxNin.toLocaleString('en-IN')} nIN`
          : `${Math.max(0, maxUsdt - amount * exchangeRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })} USDT`}
      </p>
      {step === 'input' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold dark:text-white">
              {amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </p>
            <div className="flex items-end">
              <IndividualExchangeButton
                disabled_add={isSell ? maxNin <= 0 : maxUsdt <= 0}
                disabled_remove={amount <= 0}
                handleTx={e => handleStep(e === 'add' ? 1000 : e === 'remove' ? -1000 : e === 0 ? 100 : -100)}
                title=""
                texts={{ plus: 'add', minus: 'remove' }}
              />
              <p className="flex text-sm items-end px-1 dark:text-white" onClick={handleMax}>max</p>
            </div>
          </div>
          {amount > 0 && (
            <p className="text-xs text-gray-400 dark:text-slate-400">
              {quoteLoading ? 'Calculating…' : `You receive ${receiveLabel}`}
              {quote?.feeUsdt ? ` · Fee: ${quote.feeUsdt.toLocaleString('en-IN')} USDT` : ''}
            </p>
          )}
          <ClaimButton disabled={amount <= 0} handleClick={() => setStep('confirm')} title="Set" />
        </>
      )}
      {step === 'confirm' && (
        <div className="flex flex-col gap-2 items-center">
          <p className="text-sm dark:text-white">You receive <span className="font-bold">{receiveLabel}</span></p>
          <ClaimButton disabled={false} handleClick={handleConfirm} title="Swap" />
          <button onClick={() => setStep('input')} className="text-xs text-gray-400 dark:text-slate-400">change amount</button>
        </div>
      )}
    </div>
  );
};

// ── UPI Transfer card ─────────────────────────────────────────────────────────
export const UpiTransferCard = () => (
  <div className="bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 shadow-bottom flex flex-col gap-2">
    <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">UPI / Bank Transfer</p>
    <p className="text-sm text-gray-400 dark:text-slate-400">
      Direct bank transfers are not available yet.
    </p>
  </div>
);

// ── Info card ─────────────────────────────────────────────────────────────────
export const InfoCard = ({ info, data, sym_short, hasLand }) => (
  <div className="bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 shadow-bottom flex flex-col gap-2">
    <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Info</p>
    <p className="text-sm dark:text-slate-400">{info[data.type]}</p>
    <p className="text-sm whitespace-pre-line dark:text-slate-400">{info[sym_short]}</p>
    {!hasLand && sym_short === 'NILA' && (
      <p className="flex flex-row text-sm pt-2 dark:text-slate-400">
        <LockClosedIcon className="m-4 h-6 w-8" />
        Nila tokens are non-transferable until you have verified your LAND asset.
      </p>
    )}
  </div>
);

// ── AssetsView — token identity + balance + send/receive only ─────────────────
export const AssetsView = ({
    handletouchstart,
    handletouchend,
    imagedata,
    data,
    sym_short,
    handlebacktolist,
    handleConfirmBurn,
    attr,
    hasLand,
    handleSendTokens,
    }) => {
    const { debts } = useDataContext();
    const hasActiveDebt = Array.isArray(debts) && debts.length > 0;
    const noLandBalance = (data?.sym === 'LAND' && Number(data?.bal || 0) <= 0);

    return (
        <div
            className="bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 shadow-bottom flex flex-col items-center"
            onTouchStart={handletouchstart}
            onTouchEnd={handletouchend}
        >
            <img
                src={imagedata[sym_short]}
                alt={sym_short}
                onClick={handlebacktolist}
                className="w-[20%] py-6 object-cover"
            />
            <h3 className={`font-bold pb-6 ${attr.opacity}`}>{attr.msg}</h3>
            {!hasLand && sym_short === 'NILA' ? <LockClosedIcon className="h-4 w-4 mb-2" /> : null}
            <div className="flex flex-row w-full justify-between">
                <div className="flex flex-col py-4">
                    <p className="flex flex-row dark:text-white font-bold px-4">{attr.title}</p>
                    <div>
                        {sym_short === 'LAND'
                            ? <div className="flex flex-row px-4 dark:text-slate-400 text-gray-400">{attr.subtitle} <span className="pl-2">(id:{data?.id})</span></div>
                            : <p className="px-4 dark:text-slate-400 text-gray-400">{attr.subtitle} (₹{data.p.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</p>
                        }
                    </div>
                </div>
                <div className="flex flex-col items-end py-4">
                    <p className="font-bold dark:text-white px-4">{Number(data.bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    <p className="px-4 text-gray-400">{`₹${(data.bal * data.p).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}</p>
                </div>
            </div>
            <ExchangeButton disabled={attr.disabled} handleTx={handleSendTokens} title={attr.buttonTitle} texts={{ 'plus': 'receive', 'minus': 'send' }} />
            {(data.type === 'ERC1155' || sym_short === 'LAND') && (
                <ClaimButton
                    color="black"
                    handleClick={handleConfirmBurn}
                    disabled={hasActiveDebt || noLandBalance}
                    title={
                        hasActiveDebt ? 'Burn inactive (pay debt first)'
                        : noLandBalance ? 'No land title'
                        : 'Burn my land title'
                    }
                />
            )}
        </div>
    );
};
