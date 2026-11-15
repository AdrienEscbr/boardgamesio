import { useEffect, useState } from 'react';
import { serverNow } from '@bgio/ui/lib/store.js';

/** Milliseconds left until `endsAt` (server clock), refreshed 4 times a second; null without a deadline. */
export function useRemainingMs(endsAt) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!endsAt) { setLeft(null); return undefined; }
    const tick = () => setLeft(Math.max(0, endsAt - serverNow()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}
