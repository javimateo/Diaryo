import { useEffect, useState } from 'react';

/** The time, again at the start of every minute (what is late or over changes with it). */
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(
        () => {
          setNow(Date.now());
          next();
        },
        60_000 - (Date.now() % 60_000) + 50,
      );
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}
