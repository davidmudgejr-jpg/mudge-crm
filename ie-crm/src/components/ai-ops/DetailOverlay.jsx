import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// DetailOverlay — HTML overlay for detail views, renders ON TOP of the 3D canvas.
// Fades in after the GSAP camera animation completes (~0.8s delay).
// Replaces the old ZoomTransition's detail panel logic.
// ---------------------------------------------------------------------------

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function DetailOverlay({ activeView, detailContent, onBack }) {
  const isActive = activeView !== null && detailContent !== null;
  const panelDelay = reducedMotion ? 0 : 0.85;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key={activeView}
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            transition: reducedMotion
              ? { duration: 0 }
              : {
                  type: 'spring',
                  damping: 28,
                  stiffness: 200,
                  delay: panelDelay,
                },
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 16,
            transition: { duration: 0.2 },
          }}
          className="absolute inset-0 z-30 flex items-center justify-center p-8"
        >
          {/* Dark scrim — click to close */}
          <div
            className="absolute inset-0 bg-[#04040a]/60 backdrop-blur-sm"
            onClick={onBack}
          />

          {/* Screen-style panel */}
          <div className="relative z-10 w-[78vw] max-w-5xl h-[72vh] max-h-[720px] flex flex-col rounded-lg overflow-hidden border border-[#3b82f6]/30 shadow-[0_0_80px_rgba(59,130,246,0.12),0_0_2px_rgba(59,130,246,0.3)]">
            {/* Screen bezel top */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#0a0a1a] border-b border-[#3b82f6]/20">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[#93c5fd] text-xs font-mono uppercase tracking-wider">
                  {activeView?.replace(/-/g, ' ') || 'View'}
                </span>
              </div>
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/90 text-xs font-mono transition-all border border-white/5 hover:border-white/10"
              >
                <span>{'<-'}</span> Back to Room
                <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/5 text-white/30 text-[10px]">Esc</kbd>
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 bg-[#080814]/95 overflow-auto p-6">
              {detailContent}
            </div>

            {/* Screen bezel bottom */}
            <div className="h-2 bg-[#0a0a1a] border-t border-[#3b82f6]/10" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
