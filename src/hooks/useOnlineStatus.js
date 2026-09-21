import { useEffect, useState } from 'react';

/**
 * `navigator.onLine` only reports link state, so it is paired with Firestore's
 * own `fromCache` signal in useCreditData: a device can be on a café wifi that
 * answers DHCP but not the internet, and only Firestore knows the difference.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
