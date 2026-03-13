import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ContextMenu({ x, y, items, onClose }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x });

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const newPos = { top: y, left: x };
    if (rect.right > window.innerWidth) {
      newPos.left = window.innerWidth - rect.width - 8;
    }
    if (rect.bottom > window.innerHeight) {
      newPos.top = window.innerHeight - rect.height - 8;
    }
    setPosition(newPos);
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => {
          let next = prev + 1;
          while (next < items.length && items[next].separator) next++;
          return next >= items.length ? prev : next;
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => {
          let next = prev - 1;
          while (next >= 0 && items[next].separator) next--;
          return next < 0 ? prev : next;
        });
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex] && !items[activeIndex].separator) {
        e.preventDefault();
        items[activeIndex].onClick?.();
        return;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [items, activeIndex, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] py-1 bg-crm-card/95 glass-modal border border-crm-border/50 rounded-lg shadow-2xl animate-fade-in"
      style={{ top: position.top, left: position.left }}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={idx} className="my-1 border-t border-crm-border/30" />;
        }
        const isActive = idx === activeIndex;
        return (
          <button
            key={idx}
            onClick={item.onClick}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2 transition-colors rounded-md mx-1 ${
              isActive ? 'bg-crm-accent text-white' : ''
            } ${item.danger && !isActive ? 'text-red-400' : !isActive ? 'text-crm-text' : ''}`}
            style={{ width: 'calc(100% - 8px)' }}
          >
            {item.icon && <span className="w-4 text-center">{item.icon}</span>}
            {item.label}
            {item.shortcut && (
              <span className={`ml-auto text-[11px] ${isActive ? 'text-white/70' : 'text-crm-muted'}`}>
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
