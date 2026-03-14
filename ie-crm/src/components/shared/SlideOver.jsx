import React, { useEffect, useRef } from 'react';
import { useSlideOver } from './SlideOverContext';

const Z_LEVELS = ['z-40', 'z-50'];

export default function SlideOver({ children, onClose, level = 0, width = 'w-[520px]' }) {
  const panelRef = useRef(null);
  const z = Z_LEVELS[Math.min(level, Z_LEVELS.length - 1)];

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${z} flex justify-end`} onClick={onClose}>
      {/* Overlay — only level 0 gets the full dim */}
      <div className={`absolute inset-0 ${level === 0 ? 'bg-black/50' : 'bg-black/25'} animate-fade-in`} />
      <div
        ref={panelRef}
        className={`relative ${width} bg-crm-panel glass-liquid border-l border-crm-border/50 h-full overflow-y-auto animate-slide-in-right rounded-tl-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function SlideOverHeader({ title, subtitle, onClose, children }) {
  const slideOver = useSlideOver();
  const isNested = slideOver?.stack?.length > 1;

  return (
    <div className="sticky top-0 bg-crm-panel glass-liquid border-b border-crm-border/50 px-5 py-4 z-10">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isNested && (
            <button onClick={slideOver.close} className="text-crm-muted hover:text-crm-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-crm-hover transition-colors flex-shrink-0" title="Back">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h2 className="text-base font-semibold truncate flex-1 mr-3">{title}</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}
          <button onClick={isNested ? slideOver.closeAll : onClose} className="text-crm-muted hover:text-crm-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-crm-hover transition-colors" title="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {subtitle && <div className="text-xs text-crm-muted">{subtitle}</div>}
    </div>
  );
}
