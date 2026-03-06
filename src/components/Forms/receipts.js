import React, { useState } from 'react';
import { useDataContext } from '../../utils/NavigationContext';
import { ArrowRightCircleIcon, ArrowLeftCircleIcon } from '@heroicons/react/20/solid'
import { usePolygonIndexer, useLatestBlock } from '../../hooks/useChainIndexer';
import Spinner from '../UI/spinner';

const SetDate = (ts) => {
  const fmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

  return fmt.format(new Date(Number(ts * 1000)))
}
const SetTag = (addr,hash) => {
  if (addr === "0xf18e4966731bd6d3a56c1eb23da7c708c9c48070"){
    return <p className='text-sm font-bold uppercase bg-slate-200 text-nowrap py-3 my-3 px-3'>{hash.slice(-15)}</p>

  } 
}

const SetAddr = (addr) => {
  if (addr === "0xf18e4966731bd6d3a56c1eb23da7c708c9c48070"){
    return 'Show tag to collect cash:'
  } else if (addr === "0xbae307fe0a453955c649cd8f81e3da572df448ea"){
    return 'Collect cash at union'
  } else {
    return addr.substring(0,15)
  }
}

const SetDecimals = (d) => {
  const decimals = Number(d?.tokenDecimal ?? 18);
  return decimals === 6 ? 1e6 : 1e18;
}

const ReceiptItem = ({type,d,dictionary}) => (
  <div className='flex flex-row justify-between my-6 w-full'>
    <div className='flex flex-col'>
      <div className='flex flex-row'>
      { type ? 
      <ArrowRightCircleIcon className='w-6 h-6 text-green dark:text-green_dark'/>
      :
      <ArrowLeftCircleIcon className='w-6 h-6 text-red dark:text-red_dark'/>
      }
      <p className="text-sm font-bold px-2 dark:text-slate-400">{type ? 'Receive' : 'Send'}</p>
     </div>
     <div className='my-6'>
      <p className='text-sm dark:text-slate-400'>{SetDate(d.timeStamp)}</p>
      <p className='text-sm dark:text-slate-400'>to: <b>{dictionary[type ? d.from : d.to]}</b></p>
      <p className='text-sm dark:text-slate-400'>acc: {SetAddr(type ? d.from : d.to)}</p>
      <span>{SetTag(type ? d.from : d.to, d.hash)}</span>
     </div>
    </div>
    <div className='flex flex-row'>
      <p className="font-bold text-sm dark:text-slate-400">{(d.value / SetDecimals(d)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
      <p className="font-bold text-sm px-3 dark:text-slate-400">{d.tokenName == 'Nila INR' ? 'nIN': d.tokenName}</p>
    </div>
  </div>
)

const Receipts = () => {
  const { db }                               = useDataContext()
  const { data, error, isFetched }           = usePolygonIndexer(db.address,db?.chain)
  const { data: block }                      = useLatestBlock()
  const receipts = Array.isArray(data) ? data : [];

  // 1) normalize dictionary keys once (lowercase + trim)
  const rawDict = {
    "0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070": "Collect cash at union",
    "0xaF48a2282FD8A3cCb52D17EF08FE5db7d346Dbb7": "Collect cash at exchange",
    "0x4173bbaf66a4f9a2705d05b800e8602370366756": "Nila Funds",
    "0xF18E4966731bD6D3a56c1eb23Da7C708c9C48070": "Mth Teresa Union", // <- this is *a specific address*, not default
    "0xbae307fe0a453955c649cd8f81e3da572df448ea": "USD Exchange",
    "0x0000000000000000000000000000000000000000": "nIN mint"
  };

  const dictionary = Object.fromEntries(
    Object.entries(rawDict).map(([k, v]) => [k.trim().toLowerCase(), v])
  );

  return (
    <div className='flex flex-col mx-12'>
    { isFetched ? receipts.length > 0 ? receipts.map((d,i) => (
        <div key={i} className={`flex flex-col ${i && 'border-t-2'} border-gray-200 dark:border-slate-600`}>
              <ReceiptItem type={d.to === db.address.toLowerCase()} d={d} dictionary={dictionary} />
        </div>
      )) : (
        <div className="flex flex-col items-left justify-center py-8">
          <p className="font-bold text-sm dark:text-white">No transactions yet.</p>
          <p className="text-xs text-gray-400 dark:text-slate-400">Your receipts will appear here once you make your first transaction.</p>
        </div>
      ) :
      <div className='flex justify-center'>
        <Spinner size={'small'} />
      </div>
    }
    </div>
  )
}
export default Receipts