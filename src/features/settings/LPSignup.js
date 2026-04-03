import React, { useState } from 'react';
import { useDataContext } from '../../utils/NavigationContext';
import { ClaimButton } from '../../components/UI/buttons';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const WINDOWS = [
    { label: '5 minutes', value: '5m' },
    { label: '1 hour',    value: '1h' },
    { label: '1 day',     value: '1d' },
    { label: '1 week',    value: '1w' },
];

function LPSignup({ lpProfile, onRegistered, onBrowse }) {
    const { db } = useDataContext();
    const [showSheet, setShowSheet] = useState(false);
    const [window_, setWindow_] = useState('1h');
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

        const res = await fetch(`${API_BASE_URL}/lp/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: db?.address,
                responseWindow: window_,
                latLng,
                declarationTs: new Date().toISOString(),
            }),
        });

        if (!res.ok) {
            setError('Registration failed — please try again.');
            throw new Error('lp signup failed');
        }

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
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6 px-4 py-6">
                <div className="flex justify-between items-center px-4 mb-2">
                    <p className="font-bold text-sm dark:text-white">Liquidity Provider</p>
                    <span className="text-xs text-green-600 font-bold">✓ Registered</span>
                </div>
                <div className="flex flex-row px-4 py-2 justify-between">
                    <p className="text-sm dark:text-slate-400">Response window</p>
                    <p className="text-sm font-bold dark:text-white">
                        {WINDOWS.find(w => w.value === lpProfile.responseWindow)?.label ?? lpProfile.responseWindow}
                    </p>
                </div>
                <div className="flex flex-row px-4 py-2 justify-between">
                    <p className="text-sm dark:text-slate-400">Fills completed</p>
                    <p className="text-sm font-bold dark:text-white">0</p>
                </div>
                <div className="px-4 mt-2">
                    <ClaimButton disabled={false} handleClick={onBrowse} title="Browse Offers" />
                </div>
            </div>
        );
    }

    // State 1 — not registered
    return (
        <>
            <div className="flex flex-col bg-white dark:bg-gray-700 rounded-3xl shadow-bottom my-6 px-4 py-6">
                <p className="font-bold text-sm dark:text-white px-4 mb-2">Register as a Liquidity Provider</p>
                <p className="text-sm dark:text-slate-400 px-4 mb-4">
                    Bring cash to unions, earn USDT + fee. Or deposit USDT and pick up cash.
                </p>
                <div className="px-4">
                    <ClaimButton disabled={false} handleClick={() => setShowSheet(true)} title="Register as LP" />
                </div>
            </div>

            {showSheet && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-40">
                    <div className="bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-lg p-8 pb-12">
                        <h3 className="font-bold text-lg dark:text-white mb-6">Register as Liquidity Provider</h3>

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
                </div>
            )}
        </>
    );
}

export default LPSignup;
