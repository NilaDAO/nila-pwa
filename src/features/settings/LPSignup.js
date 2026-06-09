import React, { useState } from 'react';
import { useDataContext } from '../../utils/NavigationContext';
import { ClaimButton, EnableNotifications } from '../../components/UI/buttons';
import { saveLPLocal, removeLPLocal } from '../../hooks/useLPProfile';
import { useContactBook } from '../../hooks/useContactBook';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const WINDOWS = [
    { label: '5 minutes', value: '5m' },
    { label: '1 hour',    value: '1h' },
    { label: '1 day',     value: '1d' },
    { label: '1 week',    value: '1w' },
];

function LPSignup({ lpProfile, onRegistered, notificationsEnabled, onEnableNotifications, address }) {
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

        // LPs are reached by push — being an LP without notifications is pointless.
        if (!notificationsEnabled) {
            setError('Enable notifications first — LPs are alerted by push when a union needs cash.');
            return;
        }

        // Save locally — responseWindow is PWA-only preference, never sent to backend
        saveLPLocal({ isLP: true, responseWindow: window_ });

        // Save union name to local contacts so LP can resolve it later
        if (unionAddr && unionName) {
            addContact(unionAddr, unionName);
        }

        // Fire-and-forget backend relay
        fetch(`${API_BASE_URL}/lp/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                union_addr: unionAddr,
                lp_addr: db?.address,
            }),
        }).catch(() => {});
        setShowSheet(false);
        onRegistered?.();
    };

    const handleCancel = () => {
        removeLPLocal();
        onRegistered?.();   // refetch → profile clears → falls back to the register CTA
    };

    // Registered state
    if (lpProfile?.isLP) {
        return (
            <div className="flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <p className="font-bold text-xs dark:text-white">Liquidity Provider</p>
                    <span className="text-xs text-green-600 font-bold">✓ Active</span>
                </div>
                <div className="flex flex-row py-2 justify-between">
                    <p className="text-xs dark:text-slate-400">Response window</p>
                    <p className="text-xs font-bold dark:text-white">
                        {WINDOWS.find(w => w.value === lpProfile.responseWindow)?.label ?? lpProfile.responseWindow}
                    </p>
                </div>
                <button
                    onClick={handleCancel}
                    className="mt-3 w-full py-2.5 rounded-xl border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-semibold active:scale-[0.98]"
                >
                    Cancel LP signup
                </button>
            </div>
        );
    }

    // Not registered
    if (!showSheet) {
        return (
            <div className="rounded-xl bg-gray-50 dark:bg-slate-700/40 border border-gray-200 dark:border-slate-600 px-3 py-2.5 flex flex-col">
                <p className="font-bold text-xs dark:text-white mb-1">Register as a Liquidity Provider</p>
                <p className="text-xs dark:text-slate-400 mb-3">
                    Bring cash to unions, earn USDT + fee. Or deposit USDT and pick up cash.
                </p>
                <ClaimButton compact disabled={false} handleClick={() => setShowSheet(true)} title="Register as a LP" />
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <h3 className="font-bold text-xs dark:text-white mb-4">Register as Liquidity Provider</h3>

            {!notificationsEnabled && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mb-4 flex flex-col gap-2">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        Enable notifications to sign up — you'll be alerted by push when a union needs cash.
                    </p>
                    <EnableNotifications compact autoResolve={false} onAdd={onEnableNotifications} address={address} />
                </div>
            )}

            <p className="text-xs font-bold dark:text-slate-300 mb-3">How quickly can you reach a union?</p>
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
                        <span className="text-xs dark:text-white">{w.label}</span>
                    </label>
                ))}
            </div>

            <p className="text-xs font-bold dark:text-slate-300 mb-2">Which union will you serve?</p>
            <input
                type="text"
                placeholder="Union name"
                value={unionName}
                onChange={e => setUnionName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs dark:text-white mb-2"
            />
            <input
                type="text"
                placeholder="Union address (0x…)"
                value={unionAddr}
                onChange={e => setUnionAddr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs dark:text-white font-mono mb-6"
            />

            <label className="flex items-start gap-3 cursor-pointer mb-6">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => setChecked(e.target.checked)}
                    className="w-4 h-4 mt-1 flex-shrink-0"
                />
                <span className="text-xs dark:text-slate-300">
                    I can bring at least ₹10,000 cash to a union when called.
                </span>
            </label>

            {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

            <div className="flex gap-4">
                <ClaimButton
                    compact
                    disabled={!checked || !notificationsEnabled}
                    handleClick={handleRegister}
                    title="Confirm"
                    pendingTitle="Registering..."
                    successTitle="Registered!"
                    successDurationMs={1500}
                />
                <ClaimButton
                    compact
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
