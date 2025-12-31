/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for serverless environments (Vercel)
  output: 'standalone',
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

