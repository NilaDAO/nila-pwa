import { useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { useNavContext, useViewModeContext } from '../../utils/NavigationContext';

const DragSheet = ({ children, forceWhite = false }) => {
  const controls   = useDragControls();
  const startYRef  = useRef(0);
  const { setIx, prevIx } = useNavContext();
  const { setTokenview, setCardView } = useViewModeContext();

  const close = () => {
    setIx(prevIx.current ?? null);
    setTokenview(false);
    setCardView('default');
  };

  return (
    <motion.div
      initial={{ y: -300 }}
      animate={{ y: 0 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 300 }}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.12}
      onDragEnd={(_, info) => { if (info.offset.y > 80) close(); }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, bounce: 0.5 }}
      className={`bg-white rounded-3xl w-full shadow-top mb-[220px] ${forceWhite ? '' : 'dark:bg-gray-700'}`}
    >
      {/* Drag handle:
          - onPointerDown  → starts framer-motion drag for visual feedback
          - onTouchStart/End → direct delta check, the reliable close mechanism on mobile */}
      <div
        onPointerDown={(e) => controls.start(e)}
        onTouchStart={(e) => { startYRef.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => { if (e.changedTouches[0].clientY - startYRef.current > 25) close(); }}
        className={`h-14 w-full select-none cursor-grab active:cursor-grabbing flex justify-center items-center rounded-t-3xl bg-white ${forceWhite ? '' : 'dark:bg-gray-700'}`}
      >
        <span className={`h-1 w-16 rounded-full bg-slate-300 ${forceWhite ? '' : 'dark:bg-slate-500'}`} />
      </div>
      {/* Content — stops touch bubbling so scroll doesn't fight the handle */}
      <div
        className={`overflow-y-auto touch-pan-y bg-white rounded-b-3xl ${forceWhite ? '' : 'dark:bg-gray-700'}`}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </motion.div>
  );
};

export default DragSheet;
