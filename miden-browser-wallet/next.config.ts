import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  // Transpile the local package
  transpilePackages: ['@miden/zcash-integration'],
  // Suppress hydration warnings for portal elements
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Skip static generation for pages with Miden SDK (causes pre-render issues)
  experimental: {
    isrMemoryCacheSize: 0,
  },
  webpack: (config, { isServer }) => {
    // Ensure proper resolution of local packages
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
      
      // Handle WASM files
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
      
      // Configure module resolution for ES modules from transpiled packages
      // Disable fullySpecified to allow webpack to resolve imports with/without extensions
      config.resolve.fullySpecified = false;
      
      // Add extension resolution for .js files
      config.resolve.extensions = [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        ...(config.resolve.extensions || []),
      ];
      
      // Configure module rules for the transpiled package
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      
      // Add rule to handle ES modules in the transpiled package (handles both direct and pnpm symlinks)
      config.module.rules.push({
        test: /(@miden\/zcash-integration|\.pnpm\/@miden\+zcash-integration).*\/dist\/.*\.js$/,
        resolve: {
          fullySpecified: false,
        },
      });
      
      // Ignore optional modules that may not exist at build time
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }
    
    // Ignore rust-wasm require in browser builds (only used in Node.js)
    if (!isServer) {
      const webpack = require('webpack');
      config.plugins = config.plugins || [];
      // Replace the rust-wasm require with an empty module for browser builds
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /rust-wasm\/pkg\/zcash_prover_wasm\.js$/,
          require.resolve('./webpack-empty-module.js')
        )
      );
    }
    
    return config;
  },
  async redirects() {
    return [
      {
        source: "/wallet",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
