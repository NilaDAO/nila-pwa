import React, { useState} from "react";
import Spinner from "../../components/UI/spinner";
import { motion } from 'framer-motion';

const Loading = ({spinner, page}) => {
    const [ completed, setCompleted ] = useState(false)

    const variants = {
        initial: () => ({
            scale: 1,
            opacity: 1,
            transition: {
                duration: 0, // Set to 0 to prevent any initial transition
            },
        }),
        loaded: () => ({
            scale: 1,
            opacity: 0,
            transition: {
                duration: 1
            }
        })
    }

    return (
        <div className="z-0 fixed inset-0 overflow-hidden overscroll-none touch-none">           
        { spinner && <Spinner hasBackground={true} /> } 
        { !completed ? 
            <motion.img
            className="h-[100vh] w-[100vh]"
            src="/images/img_100_3.webp"
            alt="Loader farmfields 100"
            animate={{ scale: 5 }} // Example animation to scale the image
            transition={{ duration: 1.5, stiffness: 300, damping: 30 }}
            onAnimationComplete={() => setCompleted(true)}
            />
            :
            <motion.img
                className="h-[100vh] w-[100vh]"
                src="/images/img_500_3.webp"
                alt="Loader farmfields 500"
                variants={variants}
                animate={ page < 7 ? "initial" : 'loaded' } 
            />
        }
        </div>
    )
}

export default Loading
