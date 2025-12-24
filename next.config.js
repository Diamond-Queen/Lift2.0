/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  // Support older browsers
  swcMinify: true,
  // Environment variables
  env: {
    // Browser compatibility level
    BROWSER_TARGETS: 'defaults, not dead',
  },
  // Webpack config for better compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side polyfills
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  // Headers for cross-browser support
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-UA-Compatible',
          value: 'IE=edge',
        },
      ],
    },
  ],
};

module.exports = nextConfig;

