/** @type {import('next').NextConfig} */
const path = require('path');

const WEB_API_URL =
    process.env.WEB_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

const nextConfig = {
    reactStrictMode: true,
    // Next's "Collecting build traces" step runs the shared monorepo
    // node_modules (which contains onnxruntime-node — 405 MB of native files,
    // a web-app dependency) through micromatch, which recurses until the call
    // stack overflows ("RangeError: Maximum call stack size exceeded") and
    // fails the build. The admin app ships NO serverless functions that need
    // tracing — every page is a client component prerendered to static HTML,
    // and its only `/api/*` paths are rewritten to the web app — so disabling
    // the trace step is safe and sidesteps the crash entirely.
    outputFileTracing: false,
    transpilePackages: ["@digimine/ui", "@digimine/shared", "@digimine/config", "@digimine/utils"],
    images: {
        domains: ["firebasestorage.googleapis.com"],
    },
    async rewrites() {
        // Admin app has no API routes of its own; proxy server-side calls
        // to the @digimine/web app which owns all server logic + Admin SDK.
        return [
            {
                source: "/api/admin/:path*",
                destination: `${WEB_API_URL}/api/admin/:path*`,
            },
            {
                source: "/api/teacher/:path*",
                destination: `${WEB_API_URL}/api/teacher/:path*`,
            },
        ];
    },
    webpack: (config, { isServer }) => {
        // Fix for Firebase/undici compatibility with Next.js 14
        if (!isServer) {
            // CLIENT-SIDE CONFIGURATION

            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                dns: false,
                child_process: false,
                undici: false,
            };

            // Alias undici to a mock file to prevent parsing errors
            config.resolve.alias['undici'] = path.join(__dirname, 'src/mocks/undici.js');

            // Force usage of browser-compatible builds for Firebase to avoid pulling in Node deps
            // Force usage of browser-compatible builds for Firebase to avoid pulling in Node deps
            // try {
            //     const authPkg = require.resolve('@firebase/auth/package.json');
            //     const authDir = path.dirname(authPkg);
            //     config.resolve.alias['@firebase/auth'] = path.join(authDir, 'dist/esm2017/index.js');
            // } catch (e) {
            //     console.warn('Could not resolve @firebase/auth browser path, fallback to default resolution');
            // }
        } else {
            // SERVER-SIDE CONFIGURATION

            // Mark undici as external so Webpack doesn't try to parse it (and fail on private class fields)
            // It will be required at runtime by Node.js, which handles it fine.
            config.externals = [...(config.externals || []), 'undici'];
        }

        return config;
    },
    experimental: {
        serverComponentsExternalPackages: ["undici"],
    },
};

module.exports = nextConfig;
