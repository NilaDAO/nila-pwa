import { useEffect, useState} from 'react'
import { ClaimButton } from '../../components/UI/buttons.js'
import useLoadCerts from '../../hooks/useLoadCerts.js';
import { useCollectGrant } from '../../hooks/useCollectGrant.ts';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext.js';
import useTouch from '../../hooks/useTouch.js';
import Spinner from '../../components/UI/spinner.js';

const CertGrid = ({ data,handleTokenView }) => {
    const { db,tokenData }                        = useDataContext();
    const { handleTouchStart, handleTouchEnd }    = useTouch()
    const { tokenview, setTokenview,setCardView } = useViewModeContext();
    const { collectGrant }                        = useCollectGrant();
    const { imageList }                           = useLoadCerts() 

    if (!imageList || imageList.length === 0) {
        return <Spinner size='small' stages="loading certificates and grants" />
    }
    
    const foodtokens                              = tokenData && tokenData.filter(b => b.type === 'ERC1155').length + 1 // 0 is false...
    const nila_price                              = tokenData.filter((t) => t.sym === 'NILA').map(t => t.p)
    const nowMth                                  = imageList[0].month // take month from first in imageList
    

    const handleBackToList = () => {
        setTokenview(false)
        setCardView('default')
    }

    const attr = tokenview ?  {
        opacity: nowMth === data.month && !data.claimed ? '' : 'opacity-50 dark:opacity-90',
        msg: data.date === '-' ? 'unavailable' : data.claimed ? 'claimed' : nowMth !== data.month ? 'expired' : 'claim',
        buttonTitle: data.date === '-' ? 'not yet availabe in your region' : 'claim',
        title: data.type === '1' ? 'Nila Grant ' + data.date : data.label,
        subtitle: data.type === '1' ? 'expires ' + data.date: 'limited certificate',
        disabled: data.claimed || nowMth !== data.month ? false : true,
        usd_price: nila_price ? nila_price : 0,
        amount: data.amount ? data.amount : 5
    } : ''

    const info = {
        '1': 'Nila Grants is an early adopter reward program that periodically distributes Nila tokens. Make sure to claim your grant before it expires!',
        '2': 'Nila Protected Designation of Origin (PDO) certificate is a geographical indication verifying the origin of specific food products. If a farmer holds a PDO label, any food tokens minted on a Nila-supported blockchain are guaranteed to come from the protected region.',
        '3': 'Nila Fair trade labels assure end-consumers that farmers have received a fair renumeration for their work. Fair trade labels can only be rewarded if the sale of a complete cultivation is recorded on a Nila-supported blockchain.',
        '4': 'Nila Organic Certificates ensures that products are grown and processed without synthetic chemicals, pesticides, following strict ecological standards. This certification also covers neighboring farmland, ensuring a fully organic and sustainable environment.',
        '5': 'Nila Quality labels certify that products meet specific standards for seed type, freshness, and storage conditions, as defined by the Nila community. It ensures that seeds are of superior quality and that produce is sold within a set timeframe to maintain freshness.',
        '6': 'Nila Sustainable labels certify that products are produced with environmentally conscious practices, emphasizing reduced chemical use, water conservation, and support for biodiversity. It reflects a commitment to responsible and eco-friendly farming methods.',
    }

    const imageData = {
        '1': "/images/label-06.webp",
        '2': "/images/label-04.webp",
        '3': "/images/label-01.webp",
        '4': "/images/label-03.webp",
        '5': "/images/label-05.webp",
        '6': "/images/label-02.webp",
    }

    return (
        <>
        { tokenview ? 
            <div 
                className="flex flex-col w-full h-full dark:text-white items-center"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <img
                src={imageData[data.type]}
                alt={`${data.type}`}
                onClick={handleBackToList}
                className={`w-[56%] py-6 ${attr.opacity} object-cover`}
                />
                <h3 className={`font-bold pb-12 ${attr.opacity}`} >{attr.msg}</h3>
                <div className="flex flex-row w-full justify-between">
                    <div className="flex flex-row">
                        <div className="flex flex-col py-4">
                            <p className="font-bold px-4">{attr.title}</p>
                            <p className="px-4 text-gray-400 dark:text-slate-400">{attr.subtitle}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end py-4">
                        <p className="font-bold px-4">{attr.amount.toFixed(2)}</p>
                        <p className="px-4 text-gray-400 dark:text-slate-400">₹{(attr.usd_price * attr.amount).toFixed(2)}</p>
                    </div>
                </div>
                <ClaimButton disabled={!attr.disabled} handleClick={() => collectGrant(db.address,db.union.address,foodtokens)} title={attr.buttonTitle}/>
                <div className='flex flex-col  p-4'>
                    <h3 className="font-bold text-sm py-4">Info</h3>
                    <p className='text-sm dark:text-slate-400 pb-4'>{info[data.type]}</p>                
                    {data.type !== '1' ? 
                    <p className='text-sm dark:text-slate-400'>Note: Nila certificates are not affiliated with or a substitute for any national, or state government-issued {data.label} certifications.</p> : 
                    <p className='text-sm dark:text-slate-400'>Grant amounts vary based on recent investments and your farm's price to earnings ratio. Invest your money to receive larger grants. </p>
                    }
                </div>
                { data.type === '1' && 
                <div className='w-full p-4'>
                    <h3 className="flex items-start font-bold text-sm py-4">History</h3>
                    {imageList.filter((t) => t.type === '1').map((hist, index) => (
                        <div key={index} className="flex flex-row w-full items-center justify-between">
                            <div className="flex flex-row w-full justify-between ">
                            <div className="flex flex-row">
                                <div className="flex flex-col py-4">
                                    <p className={`font-bold ${nowMth === hist.month && !data.claimed ? '' :'text-gray-400 dark:text-white'}`}>{hist.date}</p>
                                    <p className=" text-gray-400 dark:text-slate-400">exp: {hist.date}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end py-4">
                                <p className={`font-bold ${nowMth === hist.month && !data.claimed ? '':'text-gray-400 dark:text-white'}`}>{hist.amount}</p>
                                <p className=" text-gray-400 dark:text-slate-400">₹{(attr.usd_price * hist.amount).toFixed(0)}</p>
                            </div>
                        </div>
                    </div>
                    ))}
                </div> 
                }
            </div> 
            : 
          <>
          <div className="grid grid-cols-4 gap-6 mx-6">
          {imageList.map((certificate, index) => (
            <div onClick={() => handleTokenView(certificate)} key={index} className="flex flex-col aspect-square items-center">
              <img
                src={imageData[certificate.type]}
                alt={`${certificate.type}`}
                className={`w-full h-full ${index === 0 && !certificate.claimed ? '' : 'opacity-50 dark:opacity-90'} object-cover`}
              />
              <p className={`flex ${index === 0 && !certificate.claimed ? 'font-bold dark:text-white':'text-gray-400 dark:text-slate-400 text-sm'} `}>
                { certificate.date === '-' ? 'unavailable'
                : index !== 0 && !certificate.claimed ? 'expired' 
                : index === 0 && certificate.claimed ? 'claimed' : 'claim' 
                }
            </p>
            </div>
          ))}
          </div>
        </>
        }
        </>
      );
    };
    
export default CertGrid;
