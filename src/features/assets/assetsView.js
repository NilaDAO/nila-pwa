import { useState, useEffect } from "react";
import { LockClosedIcon } from '@heroicons/react/20/solid'
import { ExchangeButton, ClaimButton, IndividualExchangeButton } from '../../components/UI/buttons';
import { useDataContext } from "../../utils/NavigationContext";
import { useFxPool } from "../../hooks/useWallet.ts";
import { formatUnits } from 'ethers';
import { CROP_UNIT } from '../../hooks/useFoodTokenBatches.ts';
import { CROP_IMG } from '../../hooks/useFilterTasks.js';

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
    {data?.type === 'ERC1155' ? (
      <ul className="text-xs dark:text-slate-400 flex flex-col gap-2 list-disc list-outside pl-4 mt-1">
        <li className="pl-1">Proof that you have joined a certified crop batch for this season.</li>
        <li className="pl-1">The quantity shown is your expected harvest. It may be revised as your crop grows.</li>
        <li className="pl-1">This is the asset you sell — you can also borrow against it before harvest.</li>
        <li className="pl-1">If your harvest is not moved within 3 weeks of the harvest date, the token expires.</li>
      </ul>
    ) : (
      <>
        <p className="text-sm dark:text-slate-400">{info[data?.type]}</p>
        <p className="text-sm whitespace-pre-line dark:text-slate-400">{info[sym_short]}</p>
      </>
    )}
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
    onViewField,
    }) => {
    const { debts, db } = useDataContext();
    const hasActiveDebt = Array.isArray(debts) && debts.length > 0;
    const noLandBalance = (data?.sym === 'LAND' && Number(data?.bal || 0) <= 0);

    // ── ERC1155 food token detail view ──────────────────────────────────────
    if (data?.type === 'ERC1155') {
        const unit         = CROP_UNIT[data.cropCode] ?? { label: 'kg', toKg: 1 };
        const cropImg      = CROP_IMG[data.cropCode] ?? '/images/paddy.png';
        const _symDash = (data.sym ?? '').indexOf('-');
        const cropName = _symDash >= 0 ? data.sym.slice(0, _symDash) : (data.sym ?? '');
        const varName  = _symDash >= 0 ? data.sym.slice(_symDash + 1) : '';
        const balUnits     = data.bal / unit.toKg;
        const pricePerUnit = data._pricePerUnit ?? 0;
        const totalVal     = pricePerUnit * balUnits;
        const batch        = data._batch;
        const targetKg     = batch ? Number(batch.targetQtyKg ?? 0n) : 0;
        const farmerPct    = targetKg > 0 ? Math.round((data.bal / targetKg) * 100) : null;
        const isOpen       = batch ? batch.active && (batch.status ?? 0) === 0 : null;
        const deliveryDate = batch?.deliveryDate > 0
            ? new Date(batch.deliveryDate * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : null;
        const unionName = db?.union?.name ?? null;

        return (
            <div
                className="bg-white dark:bg-gray-700 rounded-3xl w-full py-6 px-4 shadow-bottom flex flex-col items-center"
                onTouchStart={handletouchstart}
                onTouchEnd={handletouchend}
            >
                <img
                    src={cropImg}
                    alt={cropName}
                    onClick={handlebacktolist}
                    className="w-[20%] py-6 object-cover"
                />
                <h3 className="font-bold pb-4 dark:text-white capitalize whitespace-nowrap">
                    {cropName}{varName ? ` · ${varName}` : ''}
                </h3>

                <div className="flex flex-row w-full justify-between pt-4">
                    <div className="flex flex-col py-2 px-4">
                        <p className="text-xs text-gray-400 dark:text-slate-400">Quantity</p>
                        <p className="font-bold dark:text-white">{balUnits.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {unit.label}</p>
                    </div>
                    <div className="flex flex-col items-end py-2 px-4">
                        <p className="text-xs text-gray-400 dark:text-slate-400">Est. value</p>
                        <p className="font-bold dark:text-white">{totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}</p>
                        {pricePerUnit > 0 && (
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">₹{pricePerUnit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/{unit.label}</p>
                        )}
                    </div>
                </div>

                {batch && (
                    <div className="w-full border-t border-gray-100 dark:border-slate-600 pt-3 pb-2 px-4 flex flex-col gap-1.5">
                        <div className="flex flex-row justify-between">
                            <span className="text-xs text-gray-400 dark:text-slate-400">Union</span>
                            <span className="text-xs font-medium dark:text-white">{unionName ?? '—'}</span>
                        </div>
                        <div className="flex flex-row justify-between">
                            <span className="text-xs text-gray-400 dark:text-slate-400">Batch</span>
                            <span className={`text-xs font-medium ${isOpen ? 'text-green dark:text-amber-400' : 'text-gray-500 dark:text-slate-400'}`}>
                                {isOpen === null ? '—' : isOpen ? 'Open' : 'Closed'}
                            </span>
                        </div>
                        <div className="flex flex-row justify-between">
                            <span className="text-xs text-gray-400 dark:text-slate-400">Delivery by</span>
                            <span className="text-xs font-medium dark:text-white">{deliveryDate ?? '~'}</span>
                        </div>
                        <div className="flex flex-row justify-between">
                            <span className="text-xs text-gray-400 dark:text-slate-400">Target</span>
                            <span className="text-xs font-medium dark:text-white">
                                {farmerPct !== null ? `${farmerPct}%` : '~'}
                            </span>
                        </div>
                        <div className="flex flex-row justify-between">
                            <span className="text-xs text-gray-400 dark:text-slate-400">Field</span>
                            <span className="text-xs font-medium font-mono dark:text-white">
                                {data.fieldNumber === 0 ? 'entire property' : `#${String(data.fieldNumber).padStart(2, '0')}`}
                            </span>
                        </div>
                        {data.areaM2 > 0 && (
                            <div className="flex flex-row justify-between">
                                <span className="text-xs text-gray-400 dark:text-slate-400">Area</span>
                                <span className="text-xs font-medium font-mono dark:text-white">{data.areaM2.toLocaleString('en-IN')} m²</span>
                            </div>
                        )}
                    </div>
                )}

                {onViewField && (
                    <ClaimButton
                        color="white"
                        handleClick={onViewField}
                        disabled={false}
                        title="View field"
                    />
                )}
                <ClaimButton
                    color="black"
                    handleClick={handleConfirmBurn}
                    disabled={false}
                    title={`Burn ${cropName?.toLowerCase() ?? 'crop'} asset`}
                />
            </div>
        );
    }

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
            {sym_short === 'LAND' && (
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
