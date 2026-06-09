// ErrorScreen.jsx
import React, { useEffect } from 'react';
import axios from 'axios';                    // latest axios
import { useHardReload } from '../../hooks/useHardReload';
import Spinner from './spinner';
import { ClaimButton } from './buttons';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 

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

  return (
    <div className="flex flex-col items-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 justify-center h-screen px-12">
      <Spinner size='small' />
      <h1 className="font-bold text-gray-800 dark:text-white">Something went wrong</h1>
      <p className="text-gray-800 text-xs dark:text-white">We’ve sent a crash report to our backend.</p>
      <ClaimButton
        disabled={false}
        title="Reload"
        handleClick={() => {
          // Don't return the promise to ClaimButton — an error screen must never
          // trap the user in a 'Working…' spinner. Fire the SW-aware reload and
          // guarantee a fallback hard reload if it doesn't navigate in time.
          Promise.resolve(hardReload()).catch(() => {});
          setTimeout(() => window.location.reload(), 3000);
        }}
        className="mt-4"
      />
    </div>
  );
};

export default ErrorScreen;
