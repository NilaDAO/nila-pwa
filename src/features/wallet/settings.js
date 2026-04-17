import { useState, useEffect, useRef } from "react";
import { motion, useDragControls } from 'framer-motion';
import { useDataContext, useNavContext, useViewModeContext } from '../../utils/NavigationContext'
import { useHardReload } from '../../hooks/useHardReload';
import { updateItem, deleteAllItems,readAllItems } from '../../utils/db'
import { ClipboardIcon as ClipboardOutline } from '@heroicons/react/24/outline';
import { ClipboardIcon as ClipboardSolid, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ClaimButton, EnableNotifications,DisableNotifications } from '../../components/UI/buttons';
import LPSignup from '../settings/LPSignup';
import { useLPProfile } from '../../hooks/useLPProfile';

const getInitialNotificationPermission = () => {
    if (typeof window === 'undefined') return 'default';
    const stored = localStorage.getItem('notificationPermissionOverride');
    if (stored) return stored;
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
}

function Settings({ handleOpenForm, LAND }) {
    const { db, setDb } = useDataContext();
    const hasLand = LAND?.current?.hasLand ?? false;
    const landReady = LAND?.current !== null && typeof LAND?.current?.hasLand === 'boolean';
    const isLeader = Boolean(db?.union?.leader);
    const { profile: lpProfile, refetch: refetchLP } = useLPProfile();
    const [isCollapsed, setIsCollapsed] = useState();
    const [copyAddress, setCopyAddress] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(() => getInitialNotificationPermission());
    const { setIx } = useNavContext();
    const { setTokenview, setCardView } = useViewModeContext();
    const hardReload = useHardReload();
    const controls = useDragControls();
    const startYRef = useRef(0);

    useEffect(() => {
        setCardView('transactionview');
    }, []);

    console.log('notificationPermission:', notificationPermission);

    const close = () => {
        setIx(null);
        setTokenview(false);
        setCardView('default');
    };

    const handleNotificationPermissionChange = (status) => {
        const normalized = status === 'skipped' ? 'denied' : status;
        setNotificationPermission(normalized);
        if (normalized === 'denied') {
            localStorage.setItem('notificationPermissionOverride', 'denied');
            hardReload();
        } else {
            localStorage.removeItem('notificationPermissionOverride');
        }
    };

    const handleCopy = (wallet) => {
        navigator.clipboard.writeText(wallet === 0 ? db['address'] : db['union'].address);
        setCopyAddress(true);
        setTimeout(() => setCopyAddress(false), 2000);
    };

    const getChainName = () => {
        const chain = db['chain'];
        if (chain) {
            if (chain === '137')    return 'Polygon';
            if (chain === '80002')  return 'Polygon Amoy';
            if (chain === '44787')  return 'Celo';
            if (chain === '100010') return 'Vechain';
            if (chain === '416002') return 'Algorand';
        }
        return 'loading issue';
    };

    const settings = [
        { t: 'Farm name',      data: db['farmname'] || 'mint a land title' },
        { t: 'Currency',       data: ['INR'] },
        { t: 'Theme',          data: ['Light'] },
        { t: 'Phone number',   data: db['phone'] },
        { t: 'Chain id',       data: db['chain'] },
        { t: 'Chain name',     data: getChainName() },
        { t: 'Wallet address', data: db.hasOwnProperty('address') ? db['address'].substring(0, 5) + '...' : '' },
        { t: 'Version',        data: process.env.REACT_APP_VERSION },
    ];

    const union = db['union'] && db['union'].hasOwnProperty('address') ? [
        { t: 'Union Address',  data: db['union']['address'].substring(0, 5) + '...' },
        { t: 'Representative', data: db['union']['rep'] },
        { t: 'Profile',        data: db['union']['name'] }
    ] : [
        { t: 'Address',        data: 'no union' },
        { t: 'Representative', data: 'no union' },
        { t: 'Profile',        data: 'no union' }
    ];

    const help = [
        { t: 'Resources' },
        { t: 'Support' }
    ];

    const handleChangeUnion = async () => {
        let u = updateItem({ id: 'union', value: undefined }, 'Init');
        let i = updateItem({ id: 'invest', value: undefined }, 'FarmData');
        await Promise.all([u, i]).then(async () => {
            const init_db = await readAllItems('Init');
            const farm_db = await readAllItems('FarmData');
            setDb({ ...farm_db, ...init_db });
            handleOpenForm('union');
        });
    };

    const handleSkipWaiting = () => { hardReload(); };

    const handleLogout = () => {
        try {
            localStorage.removeItem('fields');
            localStorage.removeItem('positions');
            document.cookie = "offsite=; Max-Age=0; path=/;";
        } catch (_) {}
        deleteAllItems();
        hardReload();
    };

    const SectionLabel = ({ label }) => (
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
        </p>
    );

    return (
        <>
        {/* Page title — outside draggable area, same as all other form pages */}
        <h3 className="font-bold dark:text-white p-4">Settings</h3>

        {/* Transparent drag wrapper — no own background, cards manage their own styling */}
        <motion.div
            initial={{ y: -300 }}
            animate={{ y: 0 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 300 }}
            dragListener={false}
            dragControls={controls}
            dragElastic={0.12}
            onDragEnd={(_, info) => { if (info.offset.y > 80) close(); }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
            className="flex flex-col mb-64"
        >
            {/* HELP — drag handle lives at the top of this card */}
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-2">
                <div
                    onPointerDown={(e) => controls.start(e)}
                    onTouchStart={(e) => { startYRef.current = e.touches[0].clientY; }}
                    onTouchEnd={(e) => { if (e.changedTouches[0].clientY - startYRef.current > 25) close(); }}
                    className="h-10 w-full select-none cursor-grab active:cursor-grabbing flex justify-center items-center"
                >
                    <span className="h-1 w-16 rounded-full bg-slate-300 dark:bg-slate-500" />
                </div>
                <div className="px-4 pb-6 flex flex-col gap-3"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    <SectionLabel label="Help" />
                    <div className="flex flex-col">
                        {help.map((s, i) => (
                            <div key={i}>
                                <div onClick={() => setIsCollapsed(isCollapsed === i ? null : i)} className="flex justify-between items-center py-2">
                                    <span className="text-xs text-gray-500 dark:text-slate-400">{s.t}</span>
                                    <span className="text-xs dark:text-slate-400">coming soon</span>
                                </div>
                                {isCollapsed === i && (
                                    <div onClick={() => setIsCollapsed(null)} className="text-xs dark:text-slate-400 py-2">
                                        {isCollapsed === 0 ? <div>Resources</div> : isCollapsed === 1 && <div>Support</div>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Remaining cards — stopPropagation prevents Wallet.js swipe handlers from misfiring on scroll */}
            <div
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
            >
                {/* YOUR CREDIT UNION */}
                <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-2 py-6 px-4 gap-3">
                    <SectionLabel label="Your Credit Union" />
                    <div className="flex flex-col gap-3">
                        {union.map((s, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-xs text-gray-500 dark:text-slate-400">{s.t}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold dark:text-white">{s.data}</span>
                                    {i === 0 && (
                                        <>
                                            {copyAddress
                                                ? <ClipboardSolid className="w-4 h-4 dark:text-white" />
                                                : <ClipboardOutline onClick={() => handleCopy(1)} className="w-4 h-4 dark:text-white" />}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <ClaimButton disabled={false} handleClick={handleChangeUnion} title={'Change Union'} />
                </div>

                {/* LIQUIDITY (leaders + non-landholders) */}
                {(!hasLand || isLeader) && (
                    <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-2 py-6 px-4 gap-3">
                        <SectionLabel label="Liquidity" />
                        <LPSignup lpProfile={lpProfile} onRegistered={refetchLP} onBrowse={() => handleOpenForm('lp-offers')} />
                    </div>
                )}

                {/* NOTIFICATIONS */}
                <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-2 py-6 px-4 gap-3">
                    <SectionLabel label="Notifications" />
                    {notificationPermission !== 'granted'
                        ? <EnableNotifications autoResolve={false} onAdd={handleNotificationPermissionChange} address={db?.address} />
                        : <DisableNotifications onAdd={handleNotificationPermissionChange} address={db?.address} />
                    }
                </div>

                {/* SETTINGS */}
                <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-2 py-6 px-4 gap-3">
                    <SectionLabel label="Settings" />
                    <div className="flex flex-col gap-3">
                        {settings.map((s, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-xs text-gray-500 dark:text-slate-400">{s.t}</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold dark:text-white">{settings[i].data}</span>
                                    {i === 6 && (
                                        <>
                                            {copyAddress
                                                ? <ClipboardSolid className="w-4 h-4 dark:text-white" />
                                                : <ClipboardOutline onClick={() => handleCopy(0)} className="w-4 h-4 dark:text-white" />}
                                        </>
                                    )}
                                    {i === 7 && <ArrowPathIcon onClick={handleSkipWaiting} className="w-4 h-4 dark:text-white" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="py-4">
                    <ClaimButton disabled={false} handleClick={handleLogout} title={'Reset Account'} />
                </div>
            </div>
        </motion.div>
        </>
    );
}

export default Settings
