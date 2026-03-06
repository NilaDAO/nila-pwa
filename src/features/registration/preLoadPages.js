import React, { useState, useEffect } from "react";
import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { ClipboardIcon } from '@heroicons/react/20/solid'
import { motion } from 'framer-motion'
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { ClaimButton } from "../../components/UI/buttons";
import { handleInstall } from "../../installPrompt";
import { useHardReload } from '../../hooks/useHardReload';
import { deleteAllItems } from '../../utils/db'

export const InstallApp = ({ installAvailable }) => {
  const inStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;

  const canInstall = installAvailable || !!window.__nilaInstall?.evt;
  const h = window.innerHeight

  return (
    <div className="flex flex-col min-h-dvh bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100">
      {/* <PwaDiag /> */}
      <div className="flex flex-col items-center justify-between flex-grow">
        <motion.div
          className="motion-div flex flex-col z-0 w-[96%] rounded-3xl overflow-hidden bg-white dark:bg-gray-700 shadow-bottom justify-between"
          initial={{ y: -300 }}
          animate={{ y: h - 700 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="flex flex-col z-0 justify-center items-center my-24">
            <h1 className="z-0 font-Chains dark:text-white text-9xl m-9">a</h1>
            <p className="text-sm dark:text-white font-bold">Welcome. Let us invest in you.</p>
          </div>

          {/* --- CTA area: now sticky within the card, same visual --- */}
          <div className="sticky bottom-0 bg-white/95 dark:bg-gray-700 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            {/* show the button WHEN available and not already standalone */}
            <div className="flex flex-col justify-center mt-4 mb-2 px-4">
              {canInstall && !inStandalone ? (
                <ClaimButton handleClick={handleInstall} title="Install the Nila App" />
              ) : (<>
                <ClaimButton color="white" handleClick={() => { localStorage.setItem('allowWeb','1'); window.location.reload(); }} title="Continue on web" />
                </>
              )}
            </div>
          </div>
          {/* --- end sticky area --- */}
        </motion.div>

        {/* keep your info bar exactly as is */}
        <motion.div
          className="flex flex-row w-[96%] sticky rounded-t-3xl bg-white dark:bg-darkgrey shadow-top"
          initial={{ y: -300 }}
          animate={{ y: 0 }}
        >
          <InformationCircleIcon className='text-gray-300 dark:text-slate-500 w-1/6 m-6'  />
          <div className="h-full w-3/4 my-6 mx-6 text-xs dark:text-slate-400 leading-normal">
            Get ready to access new capital? Install Nila to claim your unique land title!
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export const NotMobile = () => {
    return (
        <div className='flex justify-center items-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 h-screen'>
            <div className='flex flex-col items-center'>
              <h1 className='font-Chains dark:text-white text-9xl m-3'>a</h1>
              <h3 className='font-bold dark:text-white m-3'>Hey there! Nila works best on mobile. Please switch to your phone or tablet.</h3>
              <button className='flex flex-col items-center m-3 hover:text-grey/25'>
                <ClipboardIcon onClick={() => navigator.clipboard.writeText(window.location.href)} className='h-9 w-9 dark:text-white'/>
                <p className='text-sm text-grey dark:text-slate-400'>copy url</p>
              </button>
            </div>
          </div> 
    )
}

export const MoveToStandalone = ({installPrompt,setInstallPromptEvent}) => { 
    const [intent, setIntent] = useState(null);
    const [_apps, setApps] = useState(null);
    const [_apk, setApk] = useState(null);
    const uad = navigator.userAgentData;
    const isMobile = !!uad && uad.platform === 'Android' && Array.isArray(uad.brands) && uad.brands.some(b => b.brand === 'Google Chrome');

    useEffect(() => {
      navigator.getInstalledRelatedApps().then(apps => {
      setApps(apps);
      const webapk = apps.find(a => a.platform === 'webapp');
        setApk(webapk);
        if (webapk) {
          setIntent(
            `intent://${location.host}/#Intent;scheme=https;` +
            `package=${webapk.id};action=android.intent.action.VIEW;` +
            `category=android.intent.category.BROWSABLE;end`
          );
        }
      });
    }, []);

    const handleSwitchApp = () => {
        window.location.href = 'web+NilaApp://';
    }

    

    const handleAppInstall = () => {
        if (!installPrompt) return;
      
        installPrompt.prompt();
        installPrompt.userChoice.then(({ outcome }) => {
          console.log(outcome==='accepted' ? 'installed 👍' : 'dismissed 💔');
          // nuke the old prompt and reload into standalone
          setInstallPromptEvent(null);
          window.location.reload();
        });
      };


    return (
        <div className='flex justify-center items-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 h-screen'>
            <div className='flex flex-col items-center'>
              <h1 className='font-Chains dark:text-white text-9xl m-3'>a</h1>
              <h3 className='font-bold text-center m-3 dark:text-white'>Almost there, use the app you installed!</h3>
              { isMobile ? 
                  <>
                  <p className='text-center m-3 dark:text-slate-400'>Android does not support intents on pwa. Please go to ⋮ (menu) and click <b>Open Nila</b></p>
                  </>
              : 
              <ClaimButton handleClick={handleSwitchApp} title={'Switch to my App'} />
              }
              <p className="text-xs my-3">or</p>
              <button className="text-xs dark:text-white font-bold" onClick={handleAppInstall} >Install App</button>
              <p className="text-xs text-gray-400 dark:text-slate-400">in case you accidentally removed it.</p>
            </div>
          </div> 
    )
}

export const MismatchDevice = () => {
    const hardReload = useHardReload();

    const handleLogout = () => {
        // remove all storages, incl SW Cache, reload app
        document.cookie = "offsite=; Max-Age=0; path=/;";
        deleteAllItems()
        hardReload()
    }

    return (
        <div className='flex justify-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 items-center h-screen'>
            <div className='flex flex-col items-center'>
              <h1 className='font-Chains dark:text-white text-7xl mb-12'>a</h1>
              <h3 className='font-bold mx-8 dark:text-white'>Ay, it looks like you are using this account on another device. Sign-in to shift back to this device."</h3>
              <ClaimButton handleClick={handleLogout} title="Sign-in" />
            </div>
          </div> 
    )
}
export const NotFoundPage = () => {
    return (
        <div className='flex justify-center bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 items-center h-screen'>
            <div className='flex flex-col items-center'>
              <h1 className='font-Chains dark:text-white text-9xl m-3'>a</h1>
              <h3 className='font-bold m-3 dark:text-white'>Well, butter my biscuits! This page seems to have wandered off the farm."</h3>
              <button className='flex flex-col items-center m-3 hover:text-grey/25'>
                <ArrowPathIcon onClick={() => window.location.reload()} className='h-9 w-9'/>
                <p className='text-sm text-grey dark:text-white'>Please reload. If this message still persists. Close the app and try again.</p>
              </button>
            </div>
          </div> 
    )
}
