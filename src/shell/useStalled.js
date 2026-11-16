// A screen that waits on a read (16 Nov): after `ms` still waiting, stalled is true and the console names the read, so
// the screen shows "did not load" with Try again instead of an endless loader. retry() starts the clock again.
import { useCallback, useEffect, useState } from 'react';

export function useStalled(what, ms = 30000) {
  const [stalled, setStalled] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    setStalled(false);
    if (!what) return undefined;
    const t = setTimeout(() => {
      console.warn(`[load] still waiting after ${Math.round(ms / 1000)} s on ${what}`);
      setStalled(true);
    }, ms);
    return () => clearTimeout(t);
  }, [what, ms, round]);
  const retry = useCallback(() => setRound((n) => n + 1), []);
  return [stalled && !!what, retry];
}
