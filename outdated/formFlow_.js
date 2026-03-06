import React from "react";
import Header from "./header";
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { motion } from 'framer-motion';

const Flow = (props) => {
    return (
        <div className='flex flex-col h-screen bg-gradient-to-b from-white to-slate-100'>
            <Header version='1' /> 
            <motion.div
                className={`flex flex-grow flex-col justify-center bg-white rounded-br-3xl rounded-bl-3xl shadow-bottom w-[98%] `}
                animate={{y: 0 }}>
                <div className='z-1 flex flex-col flex-grow overflow-auto justify-center items-center'>
                    {props.action}                
                    <div className='z-1 flex justify-center text-sm font-bold'>{props.title}</div>
                </div>
                {props.button}
            </motion.div>
           <div className='flex flex-2 flex-shrink-0 z-0 sticky bottom-0 w-full bg-slate-100 h-[12%] mt-6'>
                <div className='my-9 mx-6 text-sm'>{props.info}</div>
                {props.info ? <InformationCircleIcon className='text-black/15 h-14 my-9 mx-3' /> : <></>}
           </div>
         </div>
    )
}

export default Flow