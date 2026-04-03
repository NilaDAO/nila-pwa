
import { useState } from 'react';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext';
import useTouch from '../../hooks/useTouch';
import { useMintFoodToken, useBurnLandTitle } from '../../hooks/useMintLandTitle.ts'
import { AssetsView, UsdtSwapCard, UpiTransferCard, InfoCard } from './assetsView';


const AssetList = ({ data,handleTokenView,LAND, handleOpenForm }) => {
    const { tokenData, setSelectedAsset }          = useDataContext();
    const { tokenview, setTokenview, setCardView } = useViewModeContext();
    const { handleTouchStart, handleTouchEnd}      = useTouch()
    const { burnFoodToken }                        = useMintFoodToken(Number(process.env.REACT_APP_CHAIN_ID) || 137);
    const { burnLandTitle }                        = useBurnLandTitle(Number(process.env.REACT_APP_CHAIN_ID) || 137);
    const land                                     = LAND.current.hasLand ? LAND.current.LAND : {sym: 'LAND', bal: 0, p: 36000}
    const extendedList                             = [ land, ...tokenData ];
    const sym_short                                = data?.sym?.split('-')[0].toUpperCase()

    const handleBackToList = () => {
        setTokenview(false)
        setCardView('default')
    }

    const handleConfirmBurn = () => {
        const label = data.sym === 'LAND' ? 'your land title NFT' : `all your ${data.sym} tokens`;
        if (!confirm(`Are you sure you want to burn ${label}? This cannot be undone.`)) return;
        if (data.sym === 'LAND') {
            if (!data?.id) return alert('No land title found to burn.');
            burnLandTitle(Number(data.id));
        } else {
            burnFoodToken(data.id);
        }
    }

    const attr = tokenview ? {
        msg: data.hasOwnProperty('altname') ? data.altname.toUpperCase() : data.symbol, // use altname (farm name) if available, otherwise symbol name
        title: data.sym,
        subtitle: sym_short === 'USDC' || sym_short === 'NIN' || sym_short === 'USDT' ? 'Stablecoin' : sym_short === 'NIN' ? 'Governance token' : 'Digital land asset',
        disabled: data.sym === 'LAND' ? true : false
    } : ''

    const info = {
        'USDC': 'Note: USDc is a digital dollar issued by Circle. It is pegged to the American dollar on a one-to-one ratio. Nila uses USDc on the Polygon, Algorand or Celo Network.',
        'USDT': 'Note: USDT (Tether) is a popular dollar-pegged stablecoin used worldwide. It tracks the U.S. dollar 1:1 and is available on multiple chains, including Polygon. Nila supports USDT for fast, low-cost transactions.',
        'NIN': 'Note: nIN is Nila’s digital INR token. It’s backed by USD in our treasury and always redeemable — not 1:1 with USD, but at the current USD→INR rate.\n\n When you swap nIN back, we take a small 2% buffer fee to protect everyone from sudden FX swings.',
        'NILA': 'Note: nIN Holders are the defacto owners of the Nila network. Holders can use their tokens to earn interest from lending, invest in their own farm, and help shape the Nila platform. You can purchase nIN, or earn them by being an active Nila user.',
        'LAND': 'Note: Land data are digital twins of your farmland. Public data is used to monitor soil, cultivations and production values. The land title value is established on 6 year extrapolation of (financial) returns, with a minimum of 36000 nIN.\n\n The data is also used to track progress of investments made to your property.',
        'PADDY': 'Note: Paddy is a digital representation of crops growing or stored by you.',
    }

    const imageData = {
        'USDC': "/images/USDC.png",
        'USDT': "/images/USDT0.png",
        'NILA': "/images/NILA.png",
        'LAND': "/images/LAND.png",
        'NIN': "/images/NILA.png", //"/images/NIN.png",
        'PADDY': "/images/NIN.png",
    }

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
            { extendedList.map((t,i) => (
                <div key={i} onClick={() => {
                    setSelectedAsset(t);
                    handleTokenView(t);
                }} className="flex flex-row justify-between">
                    <div className="flex flex-row p-4 mx-4">
                        <img className="h-12 w-12" src={imageData[t.sym.split('-')[0].toUpperCase()]} alt={t.dym}/>
                        <div className="flex flex-col">
                            <p className="font-bold px-4 dark:text-white">{t.sym}</p>
                            { t.sym === 'LAND' ? 
                                <p className="px-4 text-gray-400">₹{(t.p).toLocaleString('en-IN', { maximumFractionDigits:2 })}</p>
                                : <p className="px-4 text-gray-400">₹{(t.p * 1/extendedList[1].p).toLocaleString('en-IN', { maximumFractionDigits:2 })}</p>
                            }
                        </div>
                    </div>
                    <div className="flex flex-col items-end py-4 mx-4">
                        <p className="font-bold px-4 dark:text-white">{Number(t.bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                        { t.sym === 'LAND' ? 
                                <p className="px-4 text-gray-400">₹{(t.p *  t.bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                                : <p className="px-4 text-gray-400">₹{((t.p * 1/extendedList[1].p) * t.bal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                            }
                        
                    </div>
                </div>
            ))}
            </div>
        }
        </>
      );
    };
    
export default AssetList;
