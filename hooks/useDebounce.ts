import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * without further changes. Used to throttle search inputs so we don't hit
 * the DB on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
