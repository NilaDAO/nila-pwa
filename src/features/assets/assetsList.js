
import { useState } from 'react';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext';
import useTouch from '../../hooks/useTouch';
import { useMintFoodToken, useBurnLandTitle } from '../../hooks/useMintLandTitle.ts'
import { AssetsView, UsdtSwapCard, UpiTransferCard, InfoCard } from './assetsView';
import { useFoodTokenBatches, CROP_UNIT, CROP_CODE_NAMES } from '../../hooks/useFoodTokenBatches.ts';
import { cropColor, cropIconUrl } from '../../utils/cropColors.js';

const AssetList = ({ data, handleTokenView, LAND, handleOpenForm, onViewField }) => {
    const { tokenData, setSelectedAsset, db }       = useDataContext();
    const { tokenview, setTokenview, setCardView }   = useViewModeContext();
    const { handleTouchStart, handleTouchEnd }        = useTouch()
    const { burnFoodToken }                          = useMintFoodToken(Number(process.env.REACT_APP_CHAIN_ID) || 137);
    const { burnLandTitle }                          = useBurnLandTitle(Number(process.env.REACT_APP_CHAIN_ID) || 137);
    const land                                       = LAND.current.hasLand ? LAND.current.LAND : {sym: 'LAND', bal: 0, p: 36000}
    const extendedList                               = [ land, ...tokenData ];
    const sym_short                                  = data?.sym?.split('-')[0].toUpperCase()

    // Batch price lookup — uses React Query cache so no extra RPC call if already fetched
    const { data: batchData }   = useFoodTokenBatches(db?.union?.address);
    const batchPriceLookup      = {};
    if (batchData?.active) {
        for (const batch of batchData.active) {
            if (batch.pricePerKgUsdt > 0n) {
                const key = `${batch.cropCode}_${batch.varietyCode}`;
                const usd = Number(batch.pricePerKgUsdt) / 1e6;
                if (!batchPriceLookup[key] || usd > batchPriceLookup[key]) {
                    batchPriceLookup[key] = usd;
                }
            }
        }
    }

    // USD price per unit for a token. For ERC1155 food tokens, look up the matching batch price.
    // Falls back to varietyCode=0 (wildcard batch) if no exact variety match exists.
    const displayPrice = (t) => {
        if (t.type !== 'ERC1155') return t.p;
        return batchPriceLookup[`${t.cropCode}_${t.varietyCode}`]
            ?? batchPriceLookup[`${t.cropCode}_0`]
            ?? 0;
    };

    const handleBackToList = () => {
        setTokenview(false)
        setCardView('default')
    }

    const handleConfirmBurn = () => {
        const label = data.sym === 'LAND' ? 'your land title NFT'
            : data.type === 'ERC1155' ? `your ${data.sym.split('-')[0].toLowerCase()} asset`
            : `all your ${data.sym} tokens`;
        if (!confirm(`Are you sure you want to burn ${label}? This cannot be undone.`)) return;
        if (data.sym === 'LAND') {
            if (!data?.id) return alert('No land title found to burn.');
            burnLandTitle(Number(data.id));
        } else {
            burnFoodToken(data.id);
        }
    }

    const attr = tokenview ? {
        msg: data.hasOwnProperty('altname') ? data.altname.toUpperCase() : data.symbol,
        title: data.sym,
        subtitle: sym_short === 'USDC' || sym_short === 'NIN' || sym_short === 'USDT' ? 'Stablecoin' : sym_short === 'NIN' ? 'Governance token' : 'Digital land asset',
        disabled: data.sym === 'LAND' ? true : false
    } : ''

    const info = {
        'USDC': 'Note: USDc is a digital dollar issued by Circle. It is pegged to the American dollar on a one-to-one ratio. Nila uses USDc on the Polygon, Algorand or Celo Network.',
        'USDT': 'Note: USDT (Tether) is a popular dollar-pegged stablecoin used worldwide. It tracks the U.S. dollar 1:1 and is available on multiple chains, including Polygon. Nila supports USDT for fast, low-cost transactions.',
        'NIN': "Note: nIN is Nila’s digital INR token. It’s backed by USD in our treasury and always redeemable — not 1:1 with USD, but at the current USD→INR rate.\n\nWhen you swap nIN back, we take a small 2% buffer fee to protect everyone from sudden FX swings.",
        'NILA': 'Note: nIN Holders are the defacto owners of the Nila network. Holders can use their tokens to earn interest from lending, invest in their own farm, and help shape the Nila platform. You can purchase nIN, or earn them by being an active Nila user.',
        'LAND': 'Note: Land data are digital twins of your farmland. Public data is used to monitor soil, cultivations and production values. The land title value is established on 6 year extrapolation of (financial) returns, with a minimum of 36000 nIN.\n\n The data is also used to track progress of investments made to your property.',
        'PADDY': 'Note: Paddy is a digital representation of crops growing or stored by you.',
        'ERC1155': null,
    }

    const imageData = {
        'USDC': "/images/USDC.png",
        'USDT': "/images/USDT0.png",
        'NILA': "/images/NILA.png",
        'LAND': "/images/LAND.png",
        'NIN':  "/images/NILA.png",
        'PADDY': "/images/NIN.png",
    }

    // nIN price (USD/nIN) used for INR conversion throughout the list
    const ninPriceUsd = extendedList[1]?.p ?? 1;

    return (
        <>
        { tokenview && data?.sym ?
            <div className="flex flex-col gap-4 w-full mb-[220px]">
              <AssetsView
                handletouchstart={handleTouchStart}
                handletouchend={handleTouchEnd}
                imagedata={imageData}
                data={data}
                sym_short={sym_short}
                hasLand={LAND.current.hasLand}
                handlebacktolist={handleBackToList}
                handleConfirmBurn={handleConfirmBurn}
                attr={attr}
                onViewField={onViewField}
                handleSendTokens={() => {
                    setSelectedAsset(data);
                    setTokenview(false);
                    handleOpenForm('sendReceiveAssets');
                }}
              />
              {(sym_short === 'NIN' || sym_short === 'NILA' || sym_short === 'USDT') && (
                <UsdtSwapCard
                  ninBalance={tokenData?.find(t => t.sym === 'nIN')?.bal ?? 0}
                  usdtBalance={tokenData?.find(t => t.sym === 'USDT')?.bal ?? 0}
                  exchangeRate={tokenData?.find(t => t.sym === 'nIN')?.p ?? 0}
                  handleOpenForm={handleOpenForm}
                />
              )}
              {(sym_short === 'NIN' || sym_short === 'NILA') && <UpiTransferCard />}
              <InfoCard info={info} data={data} sym_short={sym_short} hasLand={LAND.current.hasLand} />
            </div>
            :
            <div>
            { extendedList.filter(t => t.type !== 'CERT').map((t, i) => {
                const imgSrc  = t.type !== 'ERC1155'
                    ? (imageData[t.sym.split('-')[0].toUpperCase()] ?? '/images/NIN.png')
                    : null;
                const cropName    = t.type === 'ERC1155' ? (CROP_CODE_NAMES[t.cropCode] ?? t.sym.split('-')[0].toLowerCase()) : null;
                const cropIconSrc = t.type === 'ERC1155' ? cropIconUrl(cropName) : null;
                const itemCropColor = t.type === 'ERC1155' ? cropColor(cropName) : null;
                const unit        = t.type === 'ERC1155' ? (CROP_UNIT[t.cropCode] ?? { label: 'kg', toKg: 1 }) : null;
                const matchBatch  = t.type === 'ERC1155'
                    ? (batchData?.active ?? []).find(b => b.cropCode === t.cropCode && (b.varietyCode === 0 || b.varietyCode === t.varietyCode))
                    : null;
                const pricePerKg  = t.sym === 'LAND' ? t.p : displayPrice(t);
                // For ERC1155: price/unit in USDT (same number the union entered at batch creation)
                const pricePerUnit = unit ? pricePerKg * unit.toKg : pricePerKg / ninPriceUsd;
                const balDisplay  = unit
                    ? Number(t.bal / unit.toKg).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                    : Number(t.bal).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                const totalVal    = t.sym === 'LAND'
                    ? (t.p * t.bal)
                    : unit
                        ? pricePerUnit * (t.bal / unit.toKg)
                        : (pricePerKg / ninPriceUsd) * t.bal;
                return (
                <div key={i} onClick={() => {
                    const enriched = unit ? { ...t, _pricePerUnit: pricePerUnit, _batch: matchBatch ?? null } : t;
                    setSelectedAsset(enriched);
                    handleTokenView(enriched);
                }} className="flex flex-row justify-between overflow-hidden">
                    <div className="flex flex-row p-4 mx-4 min-w-0 flex-1">
                        {t.type === 'ERC1155' ? (
                            <div className="h-12 w-12 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: itemCropColor }}>
                                {cropIconSrc && (
                                    <div className="w-9 h-9" style={{
                                        WebkitMaskImage: `url(${cropIconSrc})`,
                                        maskImage: `url(${cropIconSrc})`,
                                        WebkitMaskRepeat: 'no-repeat',
                                        maskRepeat: 'no-repeat',
                                        WebkitMaskSize: 'contain',
                                        maskSize: 'contain',
                                        WebkitMaskPosition: 'center',
                                        maskPosition: 'center',
                                        backgroundColor: 'black',
                                    }} />
                                )}
                            </div>
                        ) : (
                            <img className="h-12 w-12" src={imgSrc} alt={t.sym} />
                        )}
                        <div className="flex flex-col">
                            <p className="font-bold px-4 dark:text-white capitalize truncate">
                                {t.type === 'ERC1155' ? t.sym.replace('-', ' · ') : t.sym}
                            </p>
                            { t.sym === 'LAND'
                                ? <p className="px-4 text-gray-400">₹{t.p.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                                : unit
                                    ? <p className="px-4 text-gray-400">{pricePerUnit > 0 ? `₹${pricePerUnit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/${unit.label}` : '—'}</p>
                                    : <p className="px-4 text-gray-400">{pricePerKg > 0 ? `₹${(pricePerKg / ninPriceUsd).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</p>
                            }
                        </div>
                    </div>
                    <div className="flex flex-col items-end py-4 mx-4 flex-shrink-0">
                        <p className="font-bold px-4 dark:text-white">{balDisplay}</p>
                        { t.sym === 'LAND'
                            ? <p className="px-4 text-gray-400">₹{(t.p * t.bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                            : pricePerUnit > 0
                                ? <p className="px-4 text-gray-400">₹{totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                                : <p className="px-4 text-gray-400">—</p>
                        }
                    </div>
                </div>
                );
            })}
            </div>
        }
        </>
      );
    };

export default AssetList;
