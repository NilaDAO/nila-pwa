import React, { useState } from "react";
import { useDataContext } from '../../utils/NavigationContext'
import { useHardReload } from '../../hooks/useHardReload';
import { updateItem, deleteAllItems,readAllItems } from '../../utils/db'
import { ClipboardIcon as ClipboardOutline } from '@heroicons/react/24/outline';
import { ClipboardIcon as ClipboardSolid, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ClaimButton, EnableNotifications,DisableNotifications } from '../../components/UI/buttons';
import useTouch from "../../hooks/useTouch";

const getInitialNotificationPermission = () => {
    if (typeof window === 'undefined') return 'default';
    const stored = localStorage.getItem('notificationPermissionOverride');
    if (stored) return stored;
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
}

function Settings({ handleOpenForm }) {
    const [isCollapsed, setIsCollapsed] = useState();
    const [copyAddress, setCopyAddress] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(() => getInitialNotificationPermission());
    const { db, setDb } = useDataContext();
    const hardReload = useHardReload();
    const { handleTouchStart, handleTouchEnd } = useTouch();

    console.log('notificationPermission:', notificationPermission);

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
        setTimeout(() => setCopyAddress(false), 2000); // Reset icon after 2s
    };

    const getChainName = () => {
        const chain = db['chain'];
        if (chain) {
            if (chain === '137') {
                return 'Polygon';
            }
            else if (chain === '80002') {
                return 'Polygon Amoy';
            }
            else if (chain === '44787') {
                return 'Celo';
            }
            else if (chain === '100010') {
                return 'Vechain';
            }
            else if (chain === '416002') {
                return 'Algorand';
            }
        }
        return 'loading issue';
    };

    const settings = [
        { t: 'Farm name', data: db['farmname'] || 'mint a land title', edit: false },
        { t: 'Currency', data: ['INR'], edit: false },
        { t: 'Theme', data: ['Light'], edit: false },
        { t: 'Phone number', data: db['phone'], edit: false },
        { t: 'Chain id', data: db['chain'], edit: false },
        { t: 'Chain name', data: getChainName(), edit: false },
        { t: 'Wallet address', data: db.hasOwnProperty('address') ? db['address'].substring(0, 5) + '...' : '', edit: false },
        { t: 'version', data: process.env.REACT_APP_VERSION, edit: false },
    ];

    const union = db['union'] && db['union'].hasOwnProperty('address') ? [
        { t: 'Union Address', data: db['union']['address'].substring(0, 5) + '...' },
        { t: 'Representative', data: db['union']['rep'] },
        { t: 'Profile', data: db['union']['name'] }
    ] : [
        { t: 'Address', data: 'no union' },
        { t: 'Representative', data: 'no union' },
        { t: 'Profile', data: 'no union' }
    ];

    const help = [
        { t: 'Resources' },
        { t: 'Support' }
    ];

    const handleChangeUnion = async () => {
        // remove the union, requires reload of DB
        let u = updateItem({ id: 'union', value: undefined }, 'Init');
        let i = updateItem({ id: 'invest', value: undefined }, 'FarmData');
        await Promise.all([u, i]).then(async () => {
            const init_db = await readAllItems('Init');
            const farm_db = await readAllItems('FarmData');
            setDb({ ...farm_db, ...init_db });
            handleOpenForm('union');
        });
    };

    const handleSkipWaiting = () => {
        // hard reload but NOT RESET
        hardReload();
    };

    const handleLogout = () => {
        // remove all storages, incl SW Cache, reload app
        try {
            localStorage.removeItem('fields');
            localStorage.removeItem('positions'); // legacy key
            // clear offsite cookie (remote bordering)
            document.cookie = "offsite=; Max-Age=0; path=/;";
        } catch (_) {}
        deleteAllItems();
        hardReload();
    };

    return (
        <div
            className="mb-64"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <h3 className={`font-bold dark:text-white p-4`}>Help</h3>
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6">
                {help.map((s, i) => (
                    <div key={i}>
                        <div onClick={() => setIsCollapsed(isCollapsed === i ? null : i)} className="flex flex-row px-4 py-8 justify-between">
                            <p className="flex font-bold text-sm  dark:text-slate-400 px-4">{s.t}</p>
                            <p className="font-bold text-sm dark:text-white px-4">coming soon</p>

                        </div>
                        {isCollapsed === i &&
                            <div onClick={() => setIsCollapsed(null)} className="flex flex-row dark:text-slate-400 px-4 py-8">
                                {isCollapsed === 0 ? <div>Resources</div> : isCollapsed === 1 && <div>Support</div>}
                            </div>}
                    </div>
                ))}
            </div>
            <h3 className={`font-bold dark:text-white p-4`}>Your Credit Union</h3>
            <div className="flex flex-col bg-white dark:bg-gray-700 dark:text-slate-400 rounded-3xl shadow-bottom my-6">
                {union.map((s, i) => (
                    <div key={i} className="flex flex-row px-4 py-8 justify-between">
                        <p className="flex font-bold text-sm px-4">{s.t}</p>
                        <div className="flex px-4">
                            <p className="flex font-bold text-sm dark:text-white">{s.data}</p>
                            {i == 0 &&
                                <>
                                    {copyAddress ? <ClipboardSolid className="w-5 h-5 dark:text-white" /> : <ClipboardOutline onClick={() => handleCopy(1)} className="w-5 h-5 dark:text-white" />}
                                </>}
                        </div>
                    </div>
                ))}
                <div className={`p-4`}><ClaimButton disabled={false} handleClick={handleChangeUnion} title={'Change Union'} /></div>
            </div>
            <h3 className={`font-bold dark:text-white p-4`}>Notifications</h3>
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6">
                {notificationPermission !== 'granted' ?
                    <EnableNotifications autoResolve={false} onAdd={handleNotificationPermissionChange} address={db?.address} />
                    :
                    <DisableNotifications onAdd={handleNotificationPermissionChange} address={db?.address} />}
            </div>
            <h3 className={`font-bold dark:text-white p-4`}>Settings</h3>
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6">
                {settings.map((s, i) => (
                    <div key={i} className="flex flex-row px-4 py-8 justify-between items-center">
                        <p className="flex font-bold text-sm dark:text-slate-400 px-4">{s.t}</p>
                        <div className="flex px-4">
                            <p className="font-bold dark:text-white text-sm">{settings[i].data}</p>
                            {i == 6 &&
                                <>
                                    {copyAddress ? <ClipboardSolid className="w-5 h-5 ml-3 dark:text-white" /> : <ClipboardOutline onClick={() => handleCopy(0)} className="w-5 h-5 ml-3 dark:text-white" />}
                                </>}
                            {i == 7 &&
                                <ArrowPathIcon onClick={handleSkipWaiting} className="w-5 h-5 ml-3 dark:text-white" />}

                        </div>
                    </div>
                ))}
            </div>
            <ClaimButton disabled={false} handleClick={handleLogout} title={'Reset Account'} />
        </div>
    );
}

export default Settings
