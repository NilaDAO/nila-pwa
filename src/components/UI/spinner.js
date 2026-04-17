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

  // Compact inline variant — sized to fit inside a typical task card slot.
  // Used everywhere `size='small'` is passed; if no `stages` is provided the
  // message line is omitted so the spinner stays as small as possible.
  if (size === 'small') {
    return (
      <div className='flex flex-col items-center justify-center my-6'>
        <motion.div className='animate-bounce dark:text-white'>
          <p className='font-Chains text-[2.5rem] leading-none text-center'>a</p>
        </motion.div>
        {message && (
          <p className='text-center text-xs dark:text-slate-400 mt-2'>{message}</p>
        )}
      </div>
    );
  }

  // Full-screen / boot variant — unchanged.
  return (
    <div className='flex flex-col justify-center w-screen bg-gradient-to-b dark:from-darkgrey dark:to-slate-800 from-white to-slate-100 items-center'>
      <motion.div className='animate-bounce z-10 p-12 dark:text-white inset-0'>
          { hasBackground ? <div className='absolute w-32 h-32 bg-black/10 rounded-full backdrop-blur-sm'></div> : <></> }
          <h1 className='text-center text-spinner-large m-3 z-10 mb-9 font-Chains'>a</h1>
      </motion.div>
      <p className='text-center dark:text-slate-400 mx-12' >{message}</p>
    </div>
  );
};

export default Spinner;