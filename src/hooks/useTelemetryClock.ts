import { useEffect, useState } from 'react';

// Advance freshness even while a request is slow or polling is paused.
export function useTelemetryClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
