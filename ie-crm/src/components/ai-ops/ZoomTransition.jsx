import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const roomVariants = {
  visible: { opacity: 1, scale: 1 },
  zoomOut: (origin) => ({
    opacity: 0,
    scale: 1.8,
    transition: reducedMotion
      ? { duration: 0 }
      : { type: 'spring', damping: 20, stiffness: 150, duration: 0.6 }
  }),
  enter: { opacity: 0, scale: 1 },
};

const detailVariants = {
  enter: { opacity: 0, scale: 0.85, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: reducedMotion
      ? { duration: 0 }
      : { type: 'spring', damping: 25, stiffness: 200, delay: 0.1 }
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    y: 20,
    transition: reducedMotion ? { duration: 0 } : { duration: 0.3 }
  },
};

export default function ZoomTransition({ activeView, zoomOrigin, roomContent, detailContent }) {
  return (
    <AnimatePresence mode="wait">
      {activeView === null ? (
        <motion.div
          key="room"
          variants={roomVariants}
          initial="enter"
          animate="visible"
          exit="zoomOut"
          custom={zoomOrigin}
          className="w-full h-full"
          style={{ transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
        >
          {roomContent}
        </motion.div>
      ) : (
        <motion.div
          key={activeView}
          variants={detailVariants}
          initial="enter"
          animate="visible"
          exit="exit"
          className="w-full h-full overflow-auto"
        >
          {/* Vignette overlay */}
          <div className="fixed inset-0 pointer-events-none z-10"
            style={{
              boxShadow: 'inset 0 0 120px 40px rgba(4,4,10,0.8)',
            }}
          />
          <div className="relative z-20 p-8">
            {detailContent}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
