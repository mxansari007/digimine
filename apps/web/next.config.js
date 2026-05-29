/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["@digimine/ui", "@digimine/shared", "@digimine/config", "@digimine/utils"],
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'firebasestorage.googleapis.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'randomuser.me',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
                port: '',
                pathname: '/**',
            },
        ],
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

            // Keep the Node-only ONNX backend + sharp out of the CLIENT bundle.
            // Kokoro TTS now runs SERVER-side (see /api/ai-interview/tts), so the
            // browser never needs these — alias them to false for the client only.
            config.resolve.alias = {
                ...(config.resolve.alias || {}),
                sharp$: false,
                "onnxruntime-node$": false,
            };

            // Alias undici to a mock file to prevent parsing errors
            config.resolve.alias['undici'] = path.join(__dirname, 'src/mocks/undici.js');

            // Force usage of browser-compatible builds for Firebase to avoid pulling in Node deps
            try {
                const authPkg = require.resolve('@firebase/auth/package.json');
                const authDir = path.dirname(authPkg);
                config.resolve.alias['@firebase/auth'] = path.join(authDir, 'dist/esm2017/index.js');
            } catch (e) {
                console.warn('Could not resolve @firebase/auth browser path, fallback to default resolution');
            }

        } else {
            // SERVER-SIDE CONFIGURATION

            // Mark undici as external so Webpack doesn't try to parse it (and fail on private class fields)
            // It will be required at runtime by Node.js, which handles it fine.
            config.externals = [...(config.externals || []), 'undici'];
        }

        return config;
    },
    experimental: {
        // Server-side Kokoro TTS: keep these as runtime requires (real native
        // onnxruntime-node, transformers.js, kokoro-js) instead of bundling.
        serverComponentsExternalPackages: [
            "undici",
            "sharp",
            "onnxruntime-node",
            "@huggingface/transformers",
            "kokoro-js",
        ],
    },
};

module.exports = nextConfig;
