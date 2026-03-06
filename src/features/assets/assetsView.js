import React from "react";
import { LockClosedIcon } from '@heroicons/react/20/solid'
import { ExchangeButton, ClaimButton } from '../../components/UI/buttons';
import { useDataContext } from "../../utils/NavigationContext";

export const AssetsView = ({ 
    handletouchstart,
    handletouchend,
    imagedata,
    data,
    sym_short,
    handlebacktolist,
    handleConfirmBurn,
    attr,
    info,
    hasLand,
    handleSendTokens
    }) => {
    const { debts } = useDataContext();
    const hasActiveDebt = Array.isArray(debts) && debts.length > 0;
    const noLandBalance = (data?.sym === 'LAND' && Number(data?.bal || 0) <= 0);

    return (
        <div 
            className="flex flex-col w-full h-full items-center"
            onTouchStart={handletouchstart}
            onTouchEnd={handletouchend}
        >
            <img
            src={imagedata[sym_short]}
            alt={`${sym_short}`}
            onClick={handlebacktolist}
            className={`w-[20%] py-6 object-cover`}
            />
            <h3 className={`font-bold pb-12 ${attr.opacity}`} >{attr.msg}</h3>
            {!hasLand && sym_short === 'NILA' ? <LockClosedIcon className='h-4 w-4'/> : ''}
            <div className="flex flex-row w-full justify-between ">
            <div className="flex flex-row">
                <div className="flex flex-col py-4">
                    <p className="flex flex-row dark:text-white font-bold px-4">{attr.title}</p>
                    <div>
                        { sym_short === 'LAND' ?
                            <div className="flex flex-row px-4 dark:text-slate-400 text-gray-400">{attr.subtitle} <span className="pl-2">(id:{data?.id})</span></div> :
                            <p className="px-4 dark:text-slate-400 text-gray-400">{attr.subtitle} (₹{data.p.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</p>
                        }
                    </div>
                </div>
            </div>
            <div className="flex flex-col items-end py-4">
                <p className="font-bold dark:text-white px-4">{Number(data.bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                <p className="px-4 text-gray-400">{`₹${(data.bal * data.p).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}</p>
            </div>
            </div>
            <ExchangeButton disabled={attr.disabled} handleTx={handleSendTokens} title={attr.buttonTitle} texts={{ 'plus': 'receive','minus': 'send'}}/>
            <div key="info" className='flex flex-col p-4'>
                <h3 className="font-bold text-sm dark:text-white py-4">Info</h3>
                <p className='text-sm dark:text-slate-400'>{info[data.type]}</p>                
                <p className='text-sm whitespace-pre-line dark:text-slate-400'>{info[sym_short]}</p>
                { !hasLand && sym_short === 'NILA' ? <p className='flex flex-row text-sm pt-4 dark:text-slate-400' ><LockClosedIcon className='m-4 h-6 w-8'/> Nila tokens are non-transferable untill you have verified your LAND asset.</p> : <></> }
            </div>
            { (data.type === 'ERC1155' || sym_short === 'LAND') &&  (
                <ClaimButton
                    color='black'
                    handleClick={handleConfirmBurn}
                    disabled={hasActiveDebt || noLandBalance}
                    title={
                        hasActiveDebt
                            ? 'Burn inactive (pay debt first)'
                            : noLandBalance
                            ? 'No land title'
                            : 'Burn my land title'
                    }
                />
            )}
        </div> 
    )
}
