export function exportFilename(requestId: string, ext: "xlsx" | "pdf", at = new Date()): string {
  const iso = at.toISOString();
  const day = iso.slice(0, 10);
  const hours = iso.slice(11, 13);
  const minutes = iso.slice(14, 16);
  const shortId = requestId.replaceAll("-", "").slice(0, 8);
  return `cs-registry_${day}_${hours}${minutes}_${shortId}.${ext}`;
}
