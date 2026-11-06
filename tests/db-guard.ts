// Neon endpoint id: first host label without "-pooler" (pooled and direct hosts share it).
const endpoint = (url?: string) => {
  if (!url) return null;
  try { return new URL(url).hostname.split('.')[0].replace(/-pooler$/, ''); } catch { return null; }
};

export const sameDatabase = (a?: string, b?: string) => {
  const ea = endpoint(a);
  return ea !== null && ea === endpoint(b);
};
