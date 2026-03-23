import { useEffect } from 'react';
import { useSlideOver } from '../components/shared/SlideOverContext';

/**
 * Hook that registers/unregisters a page-level detail panel with SlideOverContext.
 * Call it with the detailId state — when truthy, it signals a panel is open.
 * This lets other UI (like ClaudePanel) know a detail panel is visible.
 */
export default function useDetailPanel(detailId) {
  const { registerDetail, unregisterDetail } = useSlideOver();

  useEffect(() => {
    if (detailId) {
      registerDetail();
      return () => unregisterDetail();
    }
  }, [!!detailId, registerDetail, unregisterDetail]);
}
