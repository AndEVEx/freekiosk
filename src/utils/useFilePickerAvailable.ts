import { useEffect, useState } from 'react';
import FilePickerModule from './FilePickerModule';

/**
 * Whether the device has a file picker: null while the check runs, then true or false.
 * An Android TV usually has none, so settings that need one say so instead of failing
 * when pressed. Anything that goes wrong counts as available, so a tablet is never
 * blocked by a failed check.
 */
export function useFilePickerAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = FilePickerModule?.isAvailable?.() ?? Promise.resolve(true);
    check
      .then(value => { if (!cancelled) setAvailable(value); })
      .catch(() => { if (!cancelled) setAvailable(true); });
    return () => { cancelled = true; };
  }, []);
  return available;
}
