import { useEffect, useState } from "react";

/** Owns only the URL created for this blob; releases it on replacement or unmount. */
export function useObjectUrl(blob: Blob | null) {
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!blob) {
      setResource(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setResource({ blob, url: next });
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  // Do not expose the previous blob while its replacement effect is pending.
  return resource?.blob === blob ? resource.url : "";
}
