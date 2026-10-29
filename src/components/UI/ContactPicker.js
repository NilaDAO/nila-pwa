import { useState, useMemo } from 'react';

/**
 * Contact picker that reads from useContactBook.
 * Replaces the hardcoded ContactBook components in sendReceiveAssets.js and assetsSend.js.
 *
 * Props:
 *   contactList  — [{address, name, system}] from useContactBook
 *   onSelect     — (address) => void
 *   selected     — currently selected address (optional, for highlight)
 *   addContact   — (address, name) => void from useContactBook
 */
export default function ContactPicker({ contactList, onSelect, selected, addContact, showAdd = true }) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [newName, setNewName] = useState('');

  const filtered = useMemo(() => {
    if (!search) return contactList;
    const q = search.toLowerCase();
    return contactList.filter(
      (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)
    );
  }, [contactList, search]);

  const handleAdd = () => {
    if (!newAddr || !newName) return;
    addContact(newAddr, newName);
    setAdding(false);
    setNewAddr('');
    setNewName('');
  };

  return (
    <div className="flex flex-col my-4">
      <div className="px-2 pb-2 dark:text-white text-sm font-semibold">
        Contacts ({contactList.length})
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search name or address..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mx-2 mb-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
      />

      {/* Contact list */}
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.map((c) => (
          <div
            key={c.address}
            onClick={() => onSelect(c.address)}
            className={`py-3 px-3 border-b dark:border-slate-600 last:border-none cursor-pointer transition-colors flex justify-between items-center ${
              selected?.toLowerCase() === c.address.toLowerCase()
                ? 'bg-gray-400 dark:bg-slate-800'
                : 'hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            <div>
              <span className="font-semibold dark:text-white text-sm">{c.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                {c.address.slice(0, 6)}...{c.address.slice(-4)}
              </span>
            </div>
            {c.system && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">system</span>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-2">No contacts found</p>
        )}
      </div>

      {/* Add new contact (optional) */}
      {showAdd && (adding ? (
        <div className="flex flex-col gap-2 px-2 pt-3">
          <input
            type="text"
            placeholder="0x address"
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
          />
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-white focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-2 text-sm font-semibold rounded-lg bg-gray-300 dark:bg-slate-600 dark:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mx-2 mt-2 py-2 text-sm font-semibold rounded-lg border border-dashed border-gray-400 dark:border-slate-500 dark:text-white"
        >
          + Add new contact
        </button>
      ))}
    </div>
  );
}
