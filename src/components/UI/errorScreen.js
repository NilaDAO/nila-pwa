// ErrorScreen.jsx
import React, { useEffect } from 'react';
import axios from 'axios';                    // latest axios
import { useHardReload } from '../../hooks/useHardReload';
import Spinner from './spinner';
import { ClaimButton } from './buttons';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 
const NEW_LOOK = Boolean(process.env.REACT_APP_PRIVY_APP_ID);

const ErrorScreen = ({ error, errorInfo }) => {
  const hardReload = useHardReload();

  useEffect(() => {
    const url = `${API_BASE_URL}/crash_report/`;
    // fire-and-forget; you can await if you want to show retry state
    axios.post(url, {
      url: window.location.origin,
      message: error?.toString(),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    }).catch(console.error);
  }, [error, errorInfo]);

  const reload = () => {
    // Don't return the promise to ClaimButton — an error screen must never
    // trap the user in a 'Working…' spinner. Fire the SW-aware reload and
    // guarantee a fallback hard reload if it doesn't navigate in time.
    Promise.resolve(hardReload()).catch(() => {});
    setTimeout(() => window.location.reload(), 3000);
  };

  // The new app (Privy builds): the start screens' style (S5), with the Nila logo, not the old font glyph.
  if (NEW_LOOK) {
    return (
      <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #121212 0%, #1E2738 100%)', color: '#F1F5F9',
        fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '0 24px', textAlign: 'center' }}>
        <img src={`${process.env.PUBLIC_URL || ''}/images/reg-logo.png`} alt="Nila" style={{ width: 72, height: 72 }} />
        <span role="heading" aria-level="1" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginTop: 8 }}>Something went wrong</span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: '#94A3B8' }}>We’ve sent a crash report to our backend.</span>
        <button type="button" onClick={reload} style={{ height: 44, borderRadius: 12, fontSize: 14, fontWeight: 700, border: 0, padding: '0 24px',
          color: '#121212', background: '#D4CF5A', alignSelf: 'stretch', marginTop: 20, fontFamily: 'inherit', cursor: 'pointer' }}>Reload</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 justify-center h-screen px-12">
      <Spinner size='small' />
      <h1 className="font-bold text-gray-800 dark:text-white">Something went wrong</h1>
      <p className="text-gray-800 text-xs dark:text-white">We’ve sent a crash report to our backend.</p>
      <ClaimButton
        disabled={false}
        title="Reload"
        handleClick={reload}
        className="mt-4"
      />
    </div>
  );
};

export default ErrorScreen;
