import { useEffect, useState } from 'react';

/** Object-URL fuer eine Datei, die beim Verlassen zuverlaessig freigegeben wird. */
export function useObjectUrl(source: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(source);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);

  return url;
}
