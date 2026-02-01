/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for serverless environments (Vercel)
  // Avoid `standalone` output on Windows due to invalid filename issues when
  // Next copies traced node_modules files (colons and other chars).
  // Use standalone output on non-Windows platforms only.
  ...(process.platform === 'win32' ? {} : { output: 'standalone' }),
  // Turbopack configuration
  turbopack: {
    root: __dirname,
  },
  // Webpack config for better compatibility (will be used when webpack is explicitly selected)
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
};

module.exports = nextConfig;

