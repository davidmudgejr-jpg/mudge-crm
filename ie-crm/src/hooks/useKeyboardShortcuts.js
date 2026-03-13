import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ROUTES = [
  '/properties', '/contacts', '/companies', '/deals',
  '/interactions', '/campaigns', '/action-items', '/comps',
];

export default function useKeyboardShortcuts({
  onNewRecord,
  onFocusSearch,
  onOpenCommandPalette,
  onDeleteSelected,
}) {
  const navigate = useNavigate();

  const handler = useCallback((e) => {
    const tag = document.activeElement?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Always allow Escape and Cmd+K even in inputs
    if (isInput && e.key !== 'Escape' && !(e.metaKey && e.key === 'k')) return;

    // Cmd+N → New record
    if (e.metaKey && e.key === 'n') {
      e.preventDefault();
      onNewRecord?.();
      return;
    }

    // Cmd+F → Focus search
    if (e.metaKey && e.key === 'f') {
      e.preventDefault();
      onFocusSearch?.();
      return;
    }

    // Cmd+K → Command palette
    if (e.metaKey && e.key === 'k') {
      e.preventDefault();
      onOpenCommandPalette?.();
      return;
    }

    // Cmd+, → Settings
    if (e.metaKey && e.key === ',') {
      e.preventDefault();
      navigate('/settings');
      return;
    }

    // Cmd+Backspace → Delete selected
    if (e.metaKey && e.key === 'Backspace') {
      e.preventDefault();
      onDeleteSelected?.();
      return;
    }

    // Cmd+1 through Cmd+8 → Navigate
    if (e.metaKey && e.key >= '1' && e.key <= '8') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (NAV_ROUTES[idx]) navigate(NAV_ROUTES[idx]);
      return;
    }
  }, [navigate, onNewRecord, onFocusSearch, onOpenCommandPalette, onDeleteSelected]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}
