import type { NextConfig } from 'next';

// cacheComponents and partialPrefetching stay off: every page shows live per-request data.
const config: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex' },
      ],
    }];
  },
};

export default config;
