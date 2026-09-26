import { useEffect, useState } from 'react';
import { startOfDay } from 'date-fns';

/**
 * A ticking "today".
 *
 * Credit status is a function of the calendar, so a tablet left open on the
 * counter overnight must not keep showing yesterday's ageing. This re-renders
 * consumers when the calendar day rolls over (checked every minute, which is
 * far cheaper than it sounds — the state only changes once a day).
 */
export function useToday() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setToday((prev) => {
        const now = new Date();
        return startOfDay(now).getTime() === startOfDay(prev).getTime() ? prev : now;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return today;
}
