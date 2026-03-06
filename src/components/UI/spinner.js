import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Spinner = ({ hasBackground, stages, size }) => {
  const [message, setMessage] = useState(stages);
  const switchAfter = 15000

  useEffect(() => {
    setMessage(stages);
  }, [stages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (stages === 'loading data'){
      setMessage('Sorry loading is slow, please wait one second.');
      }
    }, switchAfter);

    return () => clearTimeout(timer);
  }, [switchAfter]);

  return (
    <div className={`flex flex-col justify-center ${size !== 'small' && 'w-screen bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 items-center' }`}>
      <motion.div className='animate-bounce z-10 p-12 dark:text-white inset-0'>
          { hasBackground ? <div className='absolute w-32 h-32 bg-black/10 rounded-full backdrop-blur-sm'></div> : <></> }
          { size === 'small' ?
                  <p className='text-center text-spinner-small m-3 z-10 mb-9 font-Chains'>a</p>
                  :        
                  <h1 className='text-center text-spinner-large m-3 z-10 mb-9 font-Chains'>a</h1>
          }
      </motion.div>   
      <p className='text-center dark:text-slate-400 mx-12' >{message}</p>
    </div>
  );
};

export default Spinner;