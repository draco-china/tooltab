/** Starts a browser download; the caller retains ownership of the source URL. */
export function downloadUrl(url: string | undefined, filename: string) {
  if (!url) return;
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
  }
}
