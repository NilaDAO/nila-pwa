import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useDataContext, useNavContext } from '../../utils/NavigationContext';
import { useDonationPrograms, recordDonation } from '../../hooks/useDonationPrograms.ts';
import { useSendTokens } from '../../hooks/useWallet.ts';
import { getUsdInr } from '../../utils/usdInr.ts';
import { ClaimButton, IndividualExchangeButton } from '../UI/buttons';
import { subscribeUser } from '../../features/apis/pushManager';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

// Reusable [10px] number field (module-scope so inputs keep focus across renders).
const NumField = ({ label, value, onChange, min = 0 }) => (
  <label className="flex flex-col min-w-0">
    <span className="text-gray-400 dark:text-slate-500">{label}</span>
    <input
      type="number" inputMode="numeric" min={min} value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-lg px-2 py-1.5 text-[10px] bg-gray-50 dark:bg-slate-800 dark:text-white border border-gray-200 dark:border-slate-700"
    />
  </label>
);

// Teaching example (QF programs only). Standard quadratic-funding model in ₹:
// the round pool (the program's matchingPoolInr) is split across the field by QF
// score, so a project's match is its SHARE of the pool, capped at MaEarth's
// $15k-per-project maximum. The round is assumed to hold 50 projects. The project
// receives what it raised PLUS that match. NOTE: ignores COCM cluster-discounting —
// a possible later refinement.
const NUM_OTHER_PROJECTS   = 50;           // hardcoded size of the competing field
const PER_PROJECT_CAP_USD  = 15000;        // MaEarth's max match per project

const ExampleCalc = ({ pool, rate }) => {
  // your project (donor count × average donation — keeps the existing mechanism)
  const [donors, setDonors] = useState(100);
  const [each, setEach]     = useState(2000);
  // the competing field
  const [avgDonorsPerOtherProject, setAvgDonorsPerOther] = useState(80);
  const [avgDonationOther, setAvgDonationOther]          = useState(2000);

  const P  = Math.max(0, Number(pool) || 0);     // round pool in ₹ (matchingPoolInr)
  const n  = Math.max(0, Math.floor(Number(donors) || 0));
  const a  = Math.max(0, Number(each) || 0);
  const od = Math.max(0, Math.floor(Number(avgDonorsPerOtherProject) || 0));
  const oa = Math.max(0, Number(avgDonationOther) || 0);

  // QF score = (Σ √donationᵢ)². With equal gifts that's (count · √avg)².
  const yourScore      = Math.pow(n * Math.sqrt(a), 2);
  const oneOtherScore  = Math.pow(od * Math.sqrt(oa), 2);
  const sumOtherScores = NUM_OTHER_PROJECTS * oneOtherScore;

  const cap = PER_PROJECT_CAP_USD * (rate > 0 ? rate : 95.8);  // $15k → ₹
  const directRaised = n * a;
  const share = (yourScore + sumOtherScores) > 0 ? yourScore / (yourScore + sumOtherScores) : 0;
  const rawMatch = share * P;                    // share of the pool
  const match = Math.min(rawMatch, cap);         // capped at MaEarth's $15k max
  const total = directRaised + match;            // raised + match

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-slate-700 px-4 py-3 flex flex-col gap-3 text-[10px]">
      <p className="text-gray-500 dark:text-slate-400">
        The {inr(P)} pool is split across {NUM_OTHER_PROJECTS} projects by quadratic score — your match is your share, so it shrinks as the field gets stronger.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Your donors" value={donors} onChange={setDonors} />
        <NumField label="Your ₹ each" value={each} onChange={setEach} />
        <NumField label="Avg donors / other" value={avgDonorsPerOtherProject} onChange={setAvgDonorsPerOther} />
        <NumField label="Avg ₹ / other" value={avgDonationOther} onChange={setAvgDonationOther} />
      </div>
      <div className="rounded-xl bg-green_light/40 dark:bg-slate-800 px-3 py-2 dark:text-white">
        <p>You raise <b>{inr(directRaised)}</b> from {n.toLocaleString('en-IN')} donors</p>
        <p>QF share <b>{(share * 100).toFixed(1)}%</b> of {inr(P)} pool → match <b>{inr(match)}</b>{rawMatch > cap ? ` (max ${inr(cap)})` : ''}</p>
        <p className="mt-1 font-bold">
          project gets {inr(total)}
        </p>
        <p className="text-gray-500 dark:text-slate-400">= {inr(directRaised)} raised + {inr(match)} matched</p>
      </div>
      <p className="text-gray-400 dark:text-slate-500">
        Simplified standard QF (50 projects, equal gifts/field). The round sets the final split.
      </p>
    </div>
  );
};

// Donation detail — rendered in the Topic view UNDER the slid-up Donate card.
// Per program: image, goal, donation method, a live QF calculator, and two rails
// (UPI ₹ deep link / USDT) that both feed the anonymous ₹ counter.
const Donate = () => {
  const { db }            = useDataContext();
  const { setIx }         = useNavContext();
  const qc                = useQueryClient();
  const { data: programs = [], isLoading } = useDonationPrograms(db?.union);
  const { sendTokens }    = useSendTokens();

  const [selected, setSelected] = useState(null); // { id, rail: 'upi' | 'usdt' }
  const [amount, setAmount]     = useState('');
  const [rate, setRate]         = useState(0);     // ₹ per USD (Chainlink)
  const [exampleId, setExampleId] = useState(null); // program whose QF example is open
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => { getUsdInr().then(setRate).catch(() => {}); }, []);

  const enableNotifications = async () => {
    if (!('Notification' in window)) { alert('No Notifications API'); return; }
    if (Notification.permission === 'denied') {
      alert('You previously blocked notifications. Enable them in your browser or phone settings first.');
      return;
    }
    try {
      const res = await subscribeUser(db?.address);
      if (res === 0) setNotifPerm('granted');
      else alert('Unable to enable notifications. Please try again.');
    } catch {
      alert('Unable to enable notifications. Please try again.');
    }
  };

  const unionAddr = db?.union?.address;
  const refresh = () => qc.invalidateQueries({ queryKey: ['donationPrograms'] });
  const reset   = () => { setSelected(null); setAmount(''); };
  const pick    = (program, rail) => { setSelected({ id: program.id, rail }); setAmount(''); };

  const handleUpi = async (program, giftInr) => {
    if (!(giftInr > 0)) { alert('Enter a positive amount'); return; }
    if (!program?.upiVpa) { alert('This program has no UPI address'); return; }
    const link = `upi://pay?pa=${encodeURIComponent(program.upiVpa)}`
      + `&pn=${encodeURIComponent(program.upiName || program.name)}`
      + `&am=${giftInr}&cu=INR&tn=${encodeURIComponent(`Donation: ${program.name}`)}`;
    recordDonation(unionAddr, program.id, giftInr);   // optimistic — UPI app confirms separately
    reset();
    refresh();
    window.location.href = link;                      // hands off to the UPI app
  };

  const handleUsdt = async (program, giftInr) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { alert('Enter a positive amount'); return; }
    if (!program?.recipient) { alert('This program has no on-chain recipient'); return; }
    if (!confirm(`Donate ${amt} USDT to ${program.name}?`)) return;
    try {
      await sendTokens(program.recipient, amt, 'USDT');
      await recordDonation(unionAddr, program.id, giftInr); // giftInr = amt × rate
      reset();
      refresh();
      setIx(null);
    } catch (e) {
      alert(e?.message || 'Donation failed');
    }
  };

  return (
    <div className="pointer-events-auto flex flex-col w-full mb-[220px] my-6 gap-3">
      {isLoading && (
        <p className="text-sm dark:text-slate-400 px-2 py-6">Loading programs…</p>
      )}
      {!isLoading && !programs.length && (
        <p className="text-sm dark:text-slate-400 px-2 py-6">No donation programs are open right now.</p>
      )}

      {programs.map((p) => {
        const sel     = selected?.id === p.id ? selected.rail : null;
        const isQF    = p.type === 'QF';
        const amt     = Number(amount) || 0;
        const giftInr = sel === 'usdt' ? amt * rate : amt;   // ₹ value of the gift

        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="rounded-3xl bg-white dark:bg-gray-700 shadow-bottom overflow-hidden flex flex-col"
          >
            {p.image && (
              <div className="h-32 w-full bg-cover bg-center" style={{ backgroundImage: `url(${p.image})` }} />
            )}

            <div className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-bold text-lg dark:text-white">{p.name}</span>
                  {p.blurb && <span className="text-xs text-gray-500 dark:text-slate-400">{p.blurb}</span>}
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">union raised</span>
                  <span className="font-bold dark:text-white">{inr(p.unionTotalInr)}</span>
                </div>
              </div>

              {p.goal && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500">Goal</p>
                  <p className="text-xs text-gray-700 dark:text-slate-300 mb-6her">{p.goal}</p>
                </div>
              )}
              {p.donationMethod && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500">How it works</p>
                  <p className="text-xs text-gray-700 dark:text-slate-300 mb-6">{p.donationMethod}</p>
                </div>
              )}

              {/* round stats (QF only) */}
              {isQF && (
                <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-600 pt-2">
                  <span>{p.contributors} donor{p.contributors === 1 ? '' : 's'}</span>
                  <span>matched so far {inr(p.currentMatchInr)}</span>
                  {p.matchingPoolInr != null && <span>pool {inr(p.matchingPoolInr)}</span>}
                </div>
              )}

              {isQF && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setExampleId((id) => (id === p.id ? null : p.id))}
                    className="text-xs text-blue-500 dark:text-blue-400 self-start active:scale-95"
                  >
                    how matching works
                  </button>
                  {exampleId === p.id && <ExampleCalc pool={p.matchingPoolInr} rate={rate} />}
                </div>
              )}

              {sel ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row justify-center items-center gap-1">
                    <p className="flex items-center whitespace-nowrap font-bold text-2xl dark:text-white px-2">
                      {sel === 'upi' ? inr(amt) : `${amt.toLocaleString('en-US')} USDT`}
                    </p>
                    <IndividualExchangeButton
                      disabled_add={false}
                      disabled_remove={amt <= 0}
                      handleTx={(action) => {
                        const isAdd = action === 0 || action === 'add';
                        const base  = sel === 'usdt' ? 1 : 100;          // USDT steps by $1, ₹ by 100
                        const step  = (action === 'add' || action === 'remove') ? base * 10 : base;
                        setAmount((prev) => {
                          const n = Number(prev) || 0;
                          return isAdd ? n + step : Math.max(0, n - step);
                        });
                      }}
                      texts={{ plus: 'add', minus: 'remove' }}
                    />
                  </div>

                  <div className="flex gap-2 items-center">
                    <ClaimButton
                      compact
                      fullWidth
                      disabled={amt <= 0}
                      title={sel === 'upi' ? 'Pay by UPI' : 'Confirm donation'}
                      pendingTitle="Sending…"
                      handleClick={() => (sel === 'upi' ? handleUpi(p, giftInr) : handleUsdt(p, giftInr))}
                    />
                    <ClaimButton compact color="white" title="Cancel" handleClick={reset} />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {p.upiVpa && (
                    <ClaimButton compact fullWidth title="Donate by UPI" handleClick={() => pick(p, 'upi')} />
                  )}
                  {p.recipient && (
                    <ClaimButton compact fullWidth color="white" title="Donate USDT" handleClick={() => pick(p, 'usdt')} />
                  )}
                </div>
              )}

              {notifPerm !== 'granted' && (
                <div className="flex items-center justify-between gap-2 border-t border-gray-100 dark:border-slate-600 pt-2">
                  <span className="text-xs text-gray-500 dark:text-slate-400">Enable notifications to follow this project</span>
                  <ClaimButton compact title="Enable" handleClick={enableNotifications} />
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default Donate;
