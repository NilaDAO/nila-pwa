import { useState } from 'react';

/**
 * Blocking name input shown after QR scan when the scanned address
 * is not in the contact book. Leader must enter a name to proceed.
 *
 * Props:
 *   address     — the scanned address
 *   onConfirm   — (address, name) => void — called when name is entered
 *   onSkip      — (address) => void — skip saving and proceed
 */
export default function NameGate({ address, onConfirm, onSkip }) {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(address, trimmed);
  };

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-8">
      <p className="text-sm font-bold dark:text-white">New address scanned</p>
      <p className="text-xs font-mono text-gray-500 dark:text-slate-400">
        {address.slice(0, 6)}...{address.slice(-4)}
      </p>
      <p className="text-xs text-gray-500 dark:text-slate-400 text-center">
        Add a name for this contact, or skip.
      </p>
      <input
        type="text"
        placeholder="Enter name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
        className="w-full px-4 py-3 text-sm rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-3 w-full">
        <button
          onClick={() => onSkip(address)}
          className="flex-1 py-3 text-sm font-bold rounded-xl bg-green-600 text-white disabled:opacity-40"
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 py-3 text-sm font-bold rounded-xl bg-gray-200 dark:bg-slate-600 dark:text-white"
        >
          Save
        </button>
      </div>
    </div>
  );
}
