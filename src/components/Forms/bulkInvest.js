import { useEffect, useMemo, useState } from 'react';
import { useDataContext } from '../../utils/NavigationContext.js';
import { ClaimButton } from '../UI/buttons.js';
import QRScanner from '../UI/qrScan.js';
import { InformationCircleIcon } from '@heroicons/react/24/solid';

const CONTACTS_KEY = 'contacts';

const createRow = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
  address: '',
  name: '',
  amount: '',
  fundName: '',
  loanType: '',
  scanning: false,
  saved: false,
});

const getStoredContacts = () => {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('contacts parse failed', e);
    return [];
  }
};

const saveContacts = (contacts) => {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch (e) {
    console.error('contacts save failed', e);
  }
};

const normalizeAddr = (addr) => (addr ? addr.toLowerCase() : '');

const formatAddress = (addr) => {
  if (!addr) return '';
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
};

const BulkJuniorInvest = () => {
  const { unionFunds } = useDataContext();
  const [start, setStart] = useState(false);
  const [rows, setRows] = useState([createRow()]);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    setContacts(getStoredContacts());
  }, []);

  const funds = useMemo(() => {
    if (!Array.isArray(unionFunds)) return [];
    return unionFunds.map((f) => ({
      address: f[0],
      name: f[1],
      loanType: f[2],
    }));
  }, [unionFunds]);

  const findContactName = (addr) => {
    if (!addr) return '';
    const match = contacts.find((c) => normalizeAddr(c.address) === normalizeAddr(addr));
    return match?.name || '';
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addContactIfNeeded = (name, address) => {
    if (!name || !address) return;
    const exists = contacts.some((c) => normalizeAddr(c.address) === normalizeAddr(address));
    if (exists) return;
    const next = [...contacts, { name, address }];
    setContacts(next);
    saveContacts(next);
  };

  const handleScanResults = (rowId, payload) => {
    const address = String(payload || '').trim();
    if (!address) {
      updateRow(rowId, { scanning: false });
      return;
    }
    const contactName = findContactName(address);
    updateRow(rowId, { address, name: contactName, scanning: false });
  };

  const handleFundSelect = (rowId, loanType) => {
    const fund = funds.find((f) => f.loanType === loanType);
    if (!fund) return;
    updateRow(rowId, { loanType: fund.loanType, fundName: fund.name });
  };

  const validateRow = (row) => {
    if (!row.address || !row.loanType || !row.amount) {
      alert('Address, amount and fund are required.');
      return false;
    }
    const amt = Number(row.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter a valid amount.');
      return false;
    }
    if (amt > 1000) {
      const ok = confirm(`You entered ${amt} nIN. Continue?`);
      if (!ok) return false;
    }
    return true;
  };

  const finalizeRow = (rowId, addNew) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    if (!validateRow(row)) return;
    addContactIfNeeded(row.name, row.address);
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, saved: true, scanning: false } : r));
      return addNew ? [...next, createRow()] : next;
    });
  };

  const editingRow = rows.find((r) => !r.saved);

  return (
    <div className="p-4">
      <p className="flex font-bold mb-6 justify-center dark:text-white">Invest for your members</p>
      {!start ? (
        <>
          <p className="flex text-xs mb-6 mx-6 dark:text-slate-400">You can help union members invest in a fund. Fund shares will automatically be sent to their account.</p>
          <p className="flex text-xs mb-6 mx-6 dark:text-slate-400">❗Double-check the amount you enter. Transactions cannot be reversed.</p>
          <ClaimButton disabled={false} handleClick={() => setStart(true)} title={'New list'} />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-2xl bg-gray-100 dark:bg-slate-800 p-4">
              {row.saved ? (
                <div className="flex flex-col gap-1 dark:text-white">
                  <p className="font-bold">{row.fundName}</p>
                  <p className="text-sm">{row.name || formatAddress(row.address)}</p>
                  <p className="text-sm">{Number(row.amount).toLocaleString('en-IN')} nIN</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-row items-center gap-2">
                    <input
                      className="flex-1 rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                      placeholder="Member address"
                      value={row.address}
                      onChange={(e) => updateRow(row.id, { address: e.target.value })}
                    />
                    <ClaimButton
                      color="white"
                      disabled={false}
                      handleClick={() => updateRow(row.id, { scanning: !row.scanning })}
                      title={row.scanning ? 'Close' : 'Scan QR'}
                    />
                  </div>
                  {row.scanning && (
                    <div className="flex flex-col bg-gray-200 dark:bg-slate-900 rounded-xl p-3">
                      <QRScanner sendTo={(data) => handleScanResults(row.id, data)} />
                      <div className="flex flex-row text-xs pt-2 dark:text-slate-400">
                        <InformationCircleIcon className="text-gray-400 dark:text-slate-600 w-5 h-5 mr-2" />
                        <p>Scan the member QR to autofill their address.</p>
                      </div>
                    </div>
                  )}
                  <input
                    className="rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                    placeholder="Amount (nIN)"
                    type="number"
                    min="0"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                  />
                  <select
                    className="rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                    value={row.loanType}
                    onChange={(e) => handleFundSelect(row.id, e.target.value)}
                  >
                    <option value="">Select fund</option>
                    {funds.map((f) => (
                      <option key={f.loanType} value={f.loanType}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-md p-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                    placeholder="Save as contact name (optional)"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                  <div className="flex flex-row gap-3 pt-2">
                    <ClaimButton
                      color="white"
                      disabled={false}
                      handleClick={() => finalizeRow(row.id, false)}
                      title={'Save row'}
                    />
                    <ClaimButton
                      color="white"
                      disabled={false}
                      handleClick={() => finalizeRow(row.id, true)}
                      title={'Add another'}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Saving will store the contact locally when a name is provided. Adding will save this row and open a new one.
                  </p>
                </div>
              )}
            </div>
          ))}
          {!editingRow && (
            <ClaimButton
              color="white"
              disabled={false}
              handleClick={() => setRows((prev) => [...prev, createRow()])}
              title="Add new row"
            />
          )}
        </div>
      )}
    </div>
  );
};

export default BulkJuniorInvest;
