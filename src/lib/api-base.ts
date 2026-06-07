// basePath ('/seo') is auto-applied by next/link, the App Router (redirect/router),
// and next/image — but NOT to raw browser fetch(). Internal API calls from client
// components must prefix it manually. Keep this in sync with `basePath` in next.config.ts.
export const apiUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/seo${normalized}`;
};

// Prefix a public asset path with the basePath. Raw <img src> is NOT
// basePath-prefixed by Next (only next/link, router, next/image are).
export const assetUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/seo${normalized}`;
};
