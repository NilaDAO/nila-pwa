import { ClaimButton } from '../../components/UI/buttons.js';
import useLoadCerts from '../../hooks/useLoadCerts.js';
import { useCollectGrant } from '../../hooks/useCollectGrant.ts';
import { useDataContext, useViewModeContext } from '../../utils/NavigationContext.js';
import { useCertRegistry } from '../../hooks/useCertRegistry.ts';
import useTouch from '../../hooks/useTouch.js';

const GRANT_IMAGE = '/images/label-06.webp';
const GRANT_INFO  = 'Nila Grants is an early adopter reward program that periodically distributes Nila tokens. Make sure to claim your grant before it expires!';

// Static list of all 5 cert types — always rendered regardless of on-chain state
const CERT_DEFS = [
    { name: 'Fair Pay',          imgSrc: '/images/label-01.webp', info: 'Nila Fair Pay labels assure end-consumers that farmers have received fair remuneration for their work. Fair Pay labels can only be awarded if the sale of a complete cultivation is recorded on a Nila-supported blockchain.' },
    { name: 'Farm Identity',     imgSrc: '/images/label-04.webp', info: 'Nila Farm Identity certificates are a geographical indication verifying the origin of specific food products. If a farmer holds a Farm Identity label, any food tokens minted on a Nila-supported blockchain are guaranteed to come from that registered farm or region.' },
    { name: 'Soil & Water Care', imgSrc: '/images/label-02.webp', info: 'Nila Soil & Water Care labels certify that products are produced with environmentally conscious practices, emphasising water conservation, reduced chemical use, and support for soil health and biodiversity.' },
    { name: 'Chemical Free',     imgSrc: '/images/label-03.webp', info: 'Nila Chemical Free certificates confirm that products are grown and processed without synthetic pesticides or fertilisers, following strict ecological standards verified by the Nila community.' },
    { name: 'Clean Harvest',     imgSrc: '/images/label-05.webp', info: 'Nila Clean Harvest labels certify that products meet specific standards for seed type, freshness, and storage conditions at harvest and post-harvest handling, as defined by the Nila community.' },
];

const STATUS_STYLE = {
    valid:    'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    expiring: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    expired:  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    missing:  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};
const STATUS_LABEL = { valid: 'certified', expiring: 'expiring', expired: 'expired', missing: 'not held' };

// Inner structure matches the Card component in Cards.js
const SectionCard = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-700 rounded-3xl w-full shadow-bottom overflow-hidden">
        <div className="relative flex flex-col p-4 pb-3">
            <div className="pt-2 pb-2">
                {children}
            </div>
            <h3 className="font-bold text-sm mt-1 dark:text-slate-400">{title}</h3>
        </div>
    </div>
);

const CertGrid = ({ data, handleTokenView }) => {
    const { db, tokenData }                        = useDataContext();
    const { handleTouchStart, handleTouchEnd }     = useTouch();
    const { tokenview, setTokenview, setCardView } = useViewModeContext();
    const { collectGrant }                         = useCollectGrant();
    const { imageList }                            = useLoadCerts();
    const { certs }                                = useCertRegistry(db?.address);

    const foodtokens = tokenData ? tokenData.filter(b => b.type === 'ERC1155').length + 1 : 1;
    const ninPrice   = tokenData?.find(t => t.sym === 'nIN' || t.sym === 'NILA')?.p ?? 0;
    const grantItems = imageList.filter(t => t.type === '1');
    const grant      = grantItems[0];
    const nowMth     = grant?.month;

    // Always 5 tiles — on-chain status overlaid when useCertRegistry returns data
    const certItems = CERT_DEFS.map((def, i) => {
        const onchain = certs.find(c => c.index === i);
        return { certIndex: i, ...def, status: onchain?.status ?? 'missing', expiresAt: onchain?.expiresAt ?? 0 };
    });

    const handleBack = () => { setTokenview(false); setCardView('default'); };
    const isGrant    = data && !('certIndex' in data);

    // ── Detail view ───────────────────────────────────────────────────────────
    if (tokenview && data) {
        if (isGrant) {
            const canClaim  = !data.claimed && nowMth === data.month && data.date !== '-';
            const opacity   = canClaim ? '' : 'opacity-50 dark:opacity-90';
            const statusMsg = data.date === '-' ? 'unavailable' : data.claimed ? 'claimed' : nowMth !== data.month ? 'expired' : 'claim';
            const amount    = data.amount ?? 5;
            return (
                <div className="flex flex-col w-full dark:text-white items-center" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                    <img src={GRANT_IMAGE} alt="Nila Grant" onClick={handleBack} className={`w-[56%] py-6 ${opacity} object-cover`} />
                    <h3 className={`font-bold pb-12 ${opacity}`}>{statusMsg}</h3>
                    <div className="flex flex-row w-full justify-between">
                        <div className="flex flex-col py-4">
                            <p className="font-bold px-4">{'Nila Grant ' + data.date}</p>
                            <p className="px-4 text-gray-400 dark:text-slate-400">{'expires ' + data.date}</p>
                        </div>
                        <div className="flex flex-col items-end py-4">
                            <p className="font-bold px-4">{amount.toFixed(2)}</p>
                            <p className="px-4 text-gray-400 dark:text-slate-400">₹{(ninPrice * amount).toFixed(2)}</p>
                        </div>
                    </div>
                    <ClaimButton
                        disabled={!canClaim}
                        handleClick={() => collectGrant(db.address, db.union.address, foodtokens)}
                        title={data.date === '-' ? 'not yet available in your region' : 'claim'}
                    />
                    <div className="w-full p-4">
                        <h3 className="font-bold text-sm py-4">History</h3>
                        {grantItems.map((hist, i) => (
                            <div key={i} className="flex flex-row w-full justify-between">
                                <div className="flex flex-col py-4">
                                    <p className={`font-bold ${nowMth === hist.month && !data.claimed ? '' : 'text-gray-400 dark:text-white'}`}>{hist.date}</p>
                                    <p className="text-gray-400 dark:text-slate-400">exp: {hist.date}</p>
                                </div>
                                <div className="flex flex-col items-end py-4">
                                    <p className={`font-bold ${nowMth === hist.month && !data.claimed ? '' : 'text-gray-400 dark:text-white'}`}>{hist.amount}</p>
                                    <p className="text-gray-400 dark:text-slate-400">₹{(ninPrice * hist.amount).toFixed(0)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col p-4 w-full">
                        <h3 className="font-bold text-sm py-4">Info</h3>
                        <p className="text-sm dark:text-slate-400 pb-4">{GRANT_INFO}</p>
                        <p className="text-sm dark:text-slate-400">Grant amounts vary based on recent investments and your farm's price to earnings ratio.</p>
                    </div>
                </div>
            );
        }

        const held = data.status === 'valid' || data.status === 'expiring';
        const expiryLabel = data.expiresAt
            ? 'expires ' + new Date(data.expiresAt * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'no expiry on record';
        return (
            <div className="flex flex-col w-full dark:text-white items-center" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                <img src={data.imgSrc} alt={data.name} onClick={handleBack} className={`w-[56%] py-6 ${held ? '' : 'opacity-50 dark:opacity-90'} object-cover`} />
                <div className="flex items-center gap-2 pb-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_STYLE[data.status] ?? STATUS_STYLE.missing}`}>
                        {STATUS_LABEL[data.status] ?? 'not held'}
                    </span>
                </div>
                <div className="flex flex-row w-full justify-between">
                    <div className="flex flex-col py-4">
                        <p className="font-bold px-4">{data.name}</p>
                        <p className="px-4 text-gray-400 dark:text-slate-400">{expiryLabel}</p>
                    </div>
                </div>
                <div className="flex flex-col p-4 w-full">
                    <h3 className="font-bold text-sm py-4">Info</h3>
                    <p className="text-sm dark:text-slate-400 pb-4">{data.info}</p>
                    <p className="text-sm dark:text-slate-400">Note: Nila certificates are not affiliated with or a substitute for any national or state government-issued {data.name} certifications.</p>
                </div>
            </div>
        );
    }

    // ── Grid view ─────────────────────────────────────────────────────────────
    const grantTile  = grant ?? { date: '-', claimed: false, amount: 0, month: -1 };
    const grantLabel = grantTile.date === '-' ? 'unavailable' : grantTile.claimed ? 'claimed' : 'claim';

    return (
        <div className="flex flex-col gap-4">
            <SectionCard title="Grants">
                <div className="grid grid-cols-4 gap-4">
                    <div onClick={() => grant && handleTokenView(grant)} className="flex flex-col aspect-square items-center">
                        <img
                            src={GRANT_IMAGE}
                            alt="Nila Grant"
                            className={`w-full h-full ${grantTile.claimed ? 'opacity-50 dark:opacity-90' : ''} object-cover`}
                        />
                        <p className={`text-xs text-center mt-1 ${grantTile.claimed ? 'text-gray-400 dark:text-slate-400' : 'font-bold dark:text-white'}`}>
                            {grantLabel}
                        </p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Certifications">
                <div className="grid grid-cols-4 gap-4">
                    {certItems.map(cert => {
                        const held = cert.status === 'valid' || cert.status === 'expiring';
                        return (
                            <div onClick={() => handleTokenView(cert)} key={cert.certIndex} className="flex flex-col aspect-square items-center">
                                <img
                                    src={cert.imgSrc}
                                    alt={cert.name}
                                    className={`w-full h-full ${held ? '' : 'opacity-30 dark:opacity-20'} object-cover`}
                                />
                                <p className={`text-center text-xs mt-1 ${held ? 'font-bold dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                                    {STATUS_LABEL[cert.status]}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>
        </div>
    );
};

export default CertGrid;
