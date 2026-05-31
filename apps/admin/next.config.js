/** @type {import('next').NextConfig} */
const path = require('path');

const WEB_API_URL =
    process.env.WEB_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

const nextConfig = {
    reactStrictMode: true,
    // outputFileTracing must be ON so Vercel includes next/dist/... runtime
    // files in the lambda bundle. The build script uses node --stack-size=65536
    // to prevent the micromatch stack-overflow caused by onnxruntime-node's
    // 405 MB of deeply-nested native files in the monorepo node_modules.
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
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false, net: false, tls: false, dns: false, child_process: false,
            };
        }
        // Alias undici to a no-op stub on BOTH client and server.
        // Client: avoids pulling in Node.js-only internals into the browser bundle.
        // Server: with outputFileTracing:false the real undici file is not copied into
        // the Vercel function bundle, so externalising it caused "Cannot find module
        // 'undici'" at runtime on every SSR'd dynamic route. Stubbing it out means
        // webpack bundles the stub (empty object) instead, which is fine because the
        // admin app never calls undici APIs directly.
        config.resolve.alias['undici'] = path.join(__dirname, 'src/mocks/undici.js');

        return config;
    },
};

module.exports = nextConfig;
