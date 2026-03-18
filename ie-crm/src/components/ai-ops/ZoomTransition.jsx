import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Zoom targets — transformOrigin percentages pin the camera landing point.
// scale zooms in, rotateY/rotateX add the cinematic wall-facing turn.
//
// ox/oy = where in the room SVG the camera lands (% of viewBox 900x640)
// Calculated from the user's red-box reference screenshot:
//   Pipeline screen center: SVG ~(290, 160) → 32%, 25%
//   Cost screen center:     SVG ~(150, 240) → 17%, 37%
//   Agent Status center:    SVG ~(700, 160) → 78%, 25%  (mirror of pipeline)
//   Alerts center:          SVG ~(750, 240) → 83%, 37%  (mirror of costs)
// ---------------------------------------------------------------------------
const ZOOM_TARGETS = {
  // Left wall — zoom pins on left wall center, scale fills frame with wall
  pipeline:         { ox: 28, oy: 25, scale: 3.5, rotateY: 12, rotateX: -6 },
  costs:            { ox: 20, oy: 38, scale: 4.0, rotateY: 12, rotateX: -4 },

  // Right wall — mirror
  'agent-overview': { ox: 72, oy: 25, scale: 3.5, rotateY: -12, rotateX: -6 },
  'approval-queue': { ox: 80, oy: 38, scale: 4.0, rotateY: -12, rotateX: -4 },

  // Center elements
  territory:        { ox: 50, oy: 45, scale: 4.5, rotateY: 0, rotateX: -4 },
  health:           { ox: 50, oy: 62, scale: 4.5, rotateY: 0, rotateX: 2 },
  logs:             { ox: 50, oy: 50, scale: 3.5, rotateY: 0, rotateX: 0 },
};

function getZoomTarget(viewKey) {
  if (ZOOM_TARGETS[viewKey]) return ZOOM_TARGETS[viewKey];
  if (viewKey?.startsWith('agent-')) return { ox: 50, oy: 50, scale: 3.0, rotateY: 0, rotateX: 0 };
  return { ox: 50, oy: 50, scale: 3.0, rotateY: 0, rotateX: 0 };
}

const swoopTransition = reducedMotion
  ? { duration: 0 }
  : { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }; // smooth ease-out tween

// ---------------------------------------------------------------------------
// ZoomTransition
// Uses transformOrigin to pin the clicked screen's position, then scales up
// so the screen area fills the viewport. Subtle rotateY/X add the cinematic
// "agent turning to face the wall" feel. Room stays visible behind.
// ---------------------------------------------------------------------------
export default function ZoomTransition({
  activeView,
  roomContent,
  detailContent,
  onBack,
}) {
  const isZoomed = activeView !== null;
  const target = isZoomed ? getZoomTarget(activeView) : null;

  const panelDelay = reducedMotion ? 0 : 0.6;

  return (
    <div
      className="relative w-full h-full overflow-hidden"
    >
      {/* === ROOM — always visible, CSS transition zoom === */}
      <div
        className="w-full h-full"
        style={{
          transform: isZoomed ? `scale(${target.scale})` : 'scale(1)',
          transformOrigin: target
            ? `${target.ox}% ${target.oy}%`
            : '50% 50%',
          transition: reducedMotion ? 'none' : 'transform 0.9s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.5s ease',
          opacity: isZoomed ? 1 : 1, // DEBUG: fully visible to tune framing
        }}
      >
        {roomContent}
      </div>

      {/* === DETAIL OVERLAY — fades in after the swoop === */}
      <AnimatePresence>
        {isZoomed && (
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
            {/* Dark scrim */}
            <div
              className="absolute inset-0 bg-[#04040a]/70 backdrop-blur-sm"
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
                  <span>←</span> Back to Room
                  <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/5 text-white/30 text-[10px]">Esc</kbd>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 bg-[#080814]/95 overflow-auto p-6">
                {detailContent}
              </div>

              {/* Screen bezel bottom */}
              <div className="h-2 bg-[#0a0a1a] border-t border-[#3b82f6]/10" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
