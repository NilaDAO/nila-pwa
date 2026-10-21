// Icons copied from the boards (Lucide-style, 24 grid, stroke 2, round). No icon dependency.
const line = (children, { size = 20, color = 'currentColor', width = 2 } = {}) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const CropPlanIcon = (p) => line(<>
  <path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" />
  <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
  <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
</>, p);
export const ScanIcon = (p) => line(<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />, p);
export const AssetsIcon = (p) => line(<>
  <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
  <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
</>, p);
export const MembersIcon = (p) => line(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, p);
export const CashIcon = (p) => line(<>
  <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01" /><path d="M18 12h.01" />
</>, p);
export const HarvestsIcon = (p) => line(<>
  <path d="M2 22 16 8" />
  <path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
  <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
  <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
  <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" />
  <path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
  <path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
  <path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
</>, p);
export const HistoryIcon = (p) => line(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5h4" /></>, { size: 24, ...p });
export const RefreshIcon = (p) => line(<>
  <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
  <path d="M21 3v5h-5" /><path d="M3 21v-5h5" />
</>, { size: 16, ...p });
export const QrIcon = (p) => line(<>
  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
  <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
</>, { size: 18, ...p });
export const ChevronIcon = (p) => line(<path d="m9 18 6-6-6-6" />, p);
export const SettingsIcon = ({ size = 24, color = '#F1F5F9' }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54A.48.48 0 0 0 13.92 2h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7 7 0 0 0-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.71 8.47a.48.48 0 0 0 .12.61l2.03 1.58a7.4 7.4 0 0 0 0 1.88l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
  </svg>
);
export const LandIcon = () => (
  <svg aria-hidden="true" width="32" height="32" viewBox="0 0 45 45" style={{ flexShrink: 0 }}>
    <circle cx="22.5" cy="22.5" r="22.5" fill="#D4CF5A" /><circle cx="27" cy="15" r="5" fill="#121212" />
    <path d="M8 26c8-5 20-6 30-3" stroke="#121212" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M9 31c8-4 18-5 27-2" stroke="#121212" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M13 36c6-3 14-4 20-2" stroke="#121212" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

// Task row icons (boards Tasks, LeaderBorders): 18 px in the row's round tile.
const task = (children) => (p) => line(children, { size: 18, ...p });
export const WarnIcon = task(<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);
export const RepayIcon = task(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>);
export const CalendarIcon = task(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const PinIcon = task(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>);
export const RupeeIcon = task(<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" />);
export const TractorIcon = task(<path d="M4 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 17h6M4 14V7h7l2 5h6v4M8 7V4" />);
export const MoneyIcon = task(<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />);
export const InvestIcon = task(<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>);
export const WithdrawIcon = task(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>);
export const PayOutIcon = task(<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />);
export const CropIcon = task(<>
  <path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" />
  <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
  <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
</>);
export const BanknoteIcon = task(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01" /><path d="M18 12h.01" /></>);
