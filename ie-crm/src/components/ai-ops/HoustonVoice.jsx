// HoustonVoice — Holographic transcript overlay for Houston ConvAI voice mode
// Floats above the 3D canvas as an HTML overlay when Houston is active

import React, { useEffect, useRef } from 'react';
import useHoustonVoice from '../../hooks/useHoustonVoice';

const STATE_LABELS = {
  idle: '',
  connecting: 'CONNECTING...',
  listening: 'LISTENING...',
  processing: 'THINKING...',
  speaking: 'HOUSTON',
};

const STATE_COLORS = {
  idle: 'text-white/30',
  connecting: 'text-amber-400',
  listening: 'text-green-400',
  processing: 'text-amber-400',
  speaking: 'text-cyan-400',
};

export default function HoustonVoice({ active, onAnalyserReady }) {
  const {
    state,
    houstonText,
    userText,
    error,
    activate,
    deactivate,
    interrupt,
    getAnalyser,
  } = useHoustonVoice();

  const scrollRef = useRef(null);

  // Activate when Houston mode turns on
  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => activate(), 800);
      return () => clearTimeout(timer);
    } else {
      deactivate();
    }
  }, [active]);

  // Pass analyser to parent for orb sync
  useEffect(() => {
    if (active && state === 'speaking') {
      const analyser = getAnalyser();
      if (analyser && onAnalyserReady) onAnalyserReady(analyser);
    }
  }, [active, state, getAnalyser, onAnalyserReady]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [houstonText, userText]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex flex-col items-center justify-end pb-32">
      {/* Status indicator */}
      <div className="mb-4 flex items-center gap-2">
        {(state === 'listening' || state === 'processing' || state === 'speaking' || state === 'connecting') && (
          <span className={`w-2 h-2 rounded-full animate-pulse ${
            state === 'listening' ? 'bg-green-400' :
            state === 'speaking' ? 'bg-cyan-400' :
            'bg-amber-400'
          }`} />
        )}
        <span className={`text-xs font-mono tracking-widest ${STATE_COLORS[state]}`}>
          {STATE_LABELS[state]}
        </span>
      </div>

      {/* Holographic transcript panel */}
      <div
        className="pointer-events-auto max-w-lg w-full mx-4 rounded-xl backdrop-blur-md border overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(10,20,40,0.85) 0%, rgba(5,10,25,0.9) 100%)',
          borderColor: 'rgba(68, 136, 255, 0.2)',
          boxShadow: '0 0 30px rgba(68, 136, 255, 0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
        onClick={state === 'speaking' ? interrupt : undefined}
      >
        <div ref={scrollRef} className="max-h-48 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {/* User's speech */}
          {userText && (
            <div className="text-right">
              <span className="text-xs font-mono mb-1 block text-green-400/60">YOU</span>
              <p className="text-sm text-white/70 italic">{userText}</p>
            </div>
          )}

          {/* Houston's response */}
          {houstonText && (
            <div>
              <span className="text-xs font-mono mb-1 block text-cyan-400/60">HOUSTON</span>
              <p className="text-sm text-white/90 leading-relaxed">{houstonText}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-center">
              <p className="text-xs text-red-400/80">{error}</p>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        {state === 'speaking' && (
          <div className="px-4 py-2 border-t border-white/5 text-center">
            <span className="text-[10px] font-mono text-white/25 tracking-wider">TAP TO INTERRUPT</span>
          </div>
        )}
        {state === 'listening' && (
          <div className="px-4 py-2 border-t border-white/5 text-center">
            <span className="text-[10px] font-mono text-green-400/40 tracking-wider">● MICROPHONE ACTIVE</span>
          </div>
        )}
        {state === 'connecting' && (
          <div className="px-4 py-2 border-t border-white/5 text-center">
            <span className="text-[10px] font-mono text-amber-400/40 tracking-wider">ESTABLISHING CONNECTION...</span>
          </div>
        )}
      </div>

      {/* ESC hint */}
      <div className="mt-3">
        <span className="text-[10px] font-mono text-white/20 tracking-wider">ESC TO EXIT</span>
      </div>
    </div>
  );
}
