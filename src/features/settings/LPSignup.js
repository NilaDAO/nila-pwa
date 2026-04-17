import React, { useState } from 'react';
import { useDataContext } from '../../utils/NavigationContext';
import { ClaimButton } from '../../components/UI/buttons';
import { saveLPLocal } from '../../hooks/useLPProfile';
import { useContactBook } from '../../hooks/useContactBook';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const WINDOWS = [
    { label: '5 minutes', value: '5m' },
    { label: '1 hour',    value: '1h' },
    { label: '1 day',     value: '1d' },
    { label: '1 week',    value: '1w' },
];

function LPSignup({ lpProfile, onRegistered, onBrowse }) {
    const { db } = useDataContext();
    const { addContact } = useContactBook();
    const [showSheet, setShowSheet] = useState(false);
    const [window_, setWindow_] = useState('1h');
    const [unionAddr, setUnionAddr] = useState('');
    const [unionName, setUnionName] = useState('');
    const [checked, setChecked] = useState(false);
    const [error, setError] = useState(null);

    const handleRegister = async () => {
        setError(null);
        let latLng = null;
        try {
            const pos = await new Promise((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
            );
            latLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch (_) {
            // geolocation optional — proceed without it
        }

        // Save locally — backend sync is best-effort
        saveLPLocal({ isLP: true, responseWindow: window_, fillCount: 0 });

        // Save union name to local contacts so LP can resolve it later
        if (unionAddr && unionName) {
            addContact(unionAddr, unionName);
        }

        // Fire-and-forget backend relay
        fetch(`${API_BASE_URL}/lp/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: db?.address,
                responseWindow: window_,
                latLng,
                declarationTs: new Date().toISOString(),
            }),
        }).catch(() => {});
        setShowSheet(false);
        onRegistered?.();
    };

    // State 3 — active LP with fills
    if (lpProfile?.fillCount > 0) {
        return (
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6 px-4 py-6">
                <div className="flex justify-between items-center px-4 mb-2">
                    <p className="font-bold text-sm dark:text-white">Liquidity Provider</p>
                    <span className="text-xs text-green-600 font-bold">✓ Active</span>
                </div>
                <div className="flex flex-row px-4 py-2 justify-between">
                    <p className="text-sm dark:text-slate-400">Response window</p>
                    <p className="text-sm font-bold dark:text-white">
                        {WINDOWS.find(w => w.value === lpProfile.responseWindow)?.label ?? lpProfile.responseWindow}
                    </p>
                </div>
                <div className="flex flex-row px-4 py-2 justify-between">
                    <p className="text-sm dark:text-slate-400">Fills completed</p>
                    <p className="text-sm font-bold dark:text-white">{lpProfile.fillCount}</p>
                </div>
                {lpProfile.usdtEarned != null && (
                    <div className="flex flex-row px-4 py-2 justify-between">
                        <p className="text-sm dark:text-slate-400">USDT earned (CashOffers)</p>
                        <p className="text-sm font-bold dark:text-white">${lpProfile.usdtEarned}</p>
                    </div>
                )}
                {lpProfile.ninEarned != null && (
                    <div className="flex flex-row px-4 py-2 justify-between">
                        <p className="text-sm dark:text-slate-400">nIN earned (RedeemOrders)</p>
                        <p className="text-sm font-bold dark:text-white">{lpProfile.ninEarned} nIN</p>
                    </div>
                )}
                <div className="px-4 mt-2">
                    <ClaimButton disabled={false} handleClick={onBrowse} title="Browse Offers" />
                </div>
            </div>
        );
    }

    // State 2 — registered, no fills yet
    if (lpProfile?.isLP) {
        return (
            <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 dark:text-slate-400">Status</span>
                    <span className="text-xs font-bold text-blue-500 dark:text-blue-400">Registered</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 dark:text-slate-400">Response window</span>
                    <span className="text-xs font-bold dark:text-white">
                        {WINDOWS.find(w => w.value === lpProfile.responseWindow)?.label ?? lpProfile.responseWindow}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 dark:text-slate-400">Fills completed</span>
                    <span className="text-xs font-bold dark:text-white">0</span>
                </div>
            </div>
        );
    }

    // State 1 — not registered
    if (!showSheet) {
        return (
            <div className="flex flex-col">
                <p className="font-bold text-sm dark:text-white mb-2">Register as a Liquidity Provider</p>
                <p className="text-sm dark:text-slate-400 mb-4">
                    Bring cash to unions, earn USDT + fee. Or deposit USDT and pick up cash.
                </p>
                <ClaimButton disabled={false} handleClick={() => setShowSheet(true)} title="Register as LP" />
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <h3 className="font-bold text-sm dark:text-white mb-4">Register as Liquidity Provider</h3>

            <p className="text-sm font-bold dark:text-slate-300 mb-3">How quickly can you reach a union?</p>
            <div className="flex flex-col gap-2 mb-6">
                {WINDOWS.map(w => (
                    <label key={w.value} className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="radio"
                            name="responseWindow"
                            value={w.value}
                            checked={window_ === w.value}
                            onChange={() => setWindow_(w.value)}
                            className="w-4 h-4"
                        />
                        <span className="text-sm dark:text-white">{w.label}</span>
                    </label>
                ))}
            </div>

            <p className="text-sm font-bold dark:text-slate-300 mb-2">Which union will you serve?</p>
            <input
                type="text"
                placeholder="Union name"
                value={unionName}
                onChange={e => setUnionName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white mb-2"
            />
            <input
                type="text"
                placeholder="Union address (0x…)"
                value={unionAddr}
                onChange={e => setUnionAddr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white font-mono mb-6"
            />

            <label className="flex items-start gap-3 cursor-pointer mb-6">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setChecked(e.target.checked)}
                    className="w-4 h-4 mt-1 flex-shrink-0"
                />
                <span className="text-sm dark:text-slate-300">
                    I can bring at least ₹10,000 cash to a union when called.
                </span>
            </label>

            {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

            <div className="flex gap-4">
                <ClaimButton
                    disabled={!checked}
                    handleClick={handleRegister}
                    title="Confirm"
                    pendingTitle="Registering..."
                    successTitle="Registered!"
                    successDurationMs={1500}
                />
                <ClaimButton
                    disabled={false}
                    handleClick={() => { setShowSheet(false); setError(null); }}
                    title="Cancel"
                    color="white"
                />
            </div>
        </div>
    );
}

export default LPSignup;
