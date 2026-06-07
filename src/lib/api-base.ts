// basePath ('/seo') is auto-applied by next/link, the App Router (redirect/router),
// and next/image — but NOT to raw browser fetch(). Internal API calls from client
// components must prefix it manually. Keep this in sync with `basePath` in next.config.ts.
export const apiUrl = (path: string): string => `/seo${path}`;
