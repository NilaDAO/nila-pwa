// src/Layout.js
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { useState, useEffect, useRef } from "react";
import ErrorBoundary from './utils/ErrorBoundary';
import ErrorScreen from './components/UI/errorScreen';
import { DataProvider, NavigationProvider, TxProvider, ViewModeProvider } from './utils/NavigationContext';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initInstallCapture, onInstallAvailable } from "./installPrompt";
import PWA_diagnosis from "./features/registration/pwa_diagnosis.jsx";

// small util to mirror meta theme-color to CSS var (import path adjust if needed)
import { setMetaThemeColor } from './utils/metaTheme.js';

function Layout() {
  // ensure QueryClient is created once
  const queryClientRef = useRef(new QueryClient());
  const [installAvailable, setInstallAvailable] = useState(false);

  // set app-height reliably and update on resize/orientation change
  useEffect(() => {
    const setHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
    };
  }, []); // run once

  // set a sensible default for meta theme color (mirror to CSS var too)
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    console.log('isDark, theme: ', isDark)
    setMetaThemeColor(isDark ? '#121212' : '#ffffff'); //0A0A0A
  }, []);

  // listen to the install event bus (defensive: only run when bus exists)
  useEffect(() => {
    const bus = window.__nilaInstall;
    if (!bus || !bus.listeners) return;
    const cb = (v) => setInstallAvailable(!!v);
    bus.listeners.add(cb);
    // sync once in case event fired early
    cb(!!bus.evt);
    return () => bus.listeners.delete(cb);
  }, []);

  // fallback install prompt init (kept as you had)
  useEffect(() => {
    initInstallCapture();
    const off = onInstallAvailable(setInstallAvailable);
    return () => off();
  }, []);

  // invalidate tasks when app is re-opened via a push notification
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = ({ data }) => {
      if (data?.type === 'NILA_FROM_NOTIFICATION') {
        queryClientRef.current.invalidateQueries({ queryKey: ['tasks'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <Router>
        <DataProvider>
          <TxProvider>
            <NavigationProvider>
              <ViewModeProvider>
                <ErrorBoundary fallback={<ErrorScreen />}>
                  <Routes>
                    <Route path="/diag" element={<PWA_diagnosis />} />
                    <Route path="/*" element={<App installAvailable={installAvailable} />} />
                  </Routes>
                </ErrorBoundary>
              </ViewModeProvider>
            </NavigationProvider>
          </TxProvider>
        </DataProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default Layout;
