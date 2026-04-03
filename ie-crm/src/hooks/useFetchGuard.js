// Prevents race conditions when switching views/filters rapidly.
// Each call to guard() increments a counter. If a newer guard() was called
// before the async work finishes, isStale() returns true → discard the result.

import { useRef, useCallback } from 'react';

export default function useFetchGuard() {
  const idRef = useRef(0);

  const guard = useCallback(() => {
    const thisId = ++idRef.current;
    return { isStale: () => thisId !== idRef.current };
  }, []);

  return guard;
}
