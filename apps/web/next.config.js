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

            // Alias undici to a no-op mock on the server too (the client already
            // does this above). undici is only pulled in transitively by
            // Firebase's Node transport and is never actually invoked during SSR
            // or route handling: Firestore Admin reads use gRPC, and app fetch()
            // uses Node's native global fetch — not the undici PACKAGE.
            //
            // Why not externalise it (the previous approach)? Externalising made
            // Next's file-tracer responsible for copying undici into every
            // serverless function, and it inconsistently omitted it from the
            // course/article page-route lambdas — which then crashed at load with
            // "Cannot find module 'undici'" (a 500 on every direct load / SSR).
            // Webpack also can't bundle the real undici (private-field parse
            // error). The mock is trivial, always bundled, and never missing.
            config.resolve.alias = {
                ...(config.resolve.alias || {}),
                undici: path.join(__dirname, 'src/mocks/undici.js'),
            };
        }

        return config;
    },
    experimental: {
        // Server-side Kokoro TTS: keep these as runtime requires (real native
        // onnxruntime-node, transformers.js, kokoro-js) instead of bundling.
        serverComponentsExternalPackages: [
            "sharp",
            "onnxruntime-node",
            "@huggingface/transformers",
            "kokoro-js",
            // Resume Maker: puppeteer-core renders the PDF via headless Chromium;
            // unpdf/mammoth parse uploaded resumes. All are Node libs that must
            // be required at runtime from node_modules, not webpack-bundled.
            "puppeteer-core",
            // Serverless Chromium binary for the resume PDF route on Vercel
            // (puppeteer-core ships no browser; locally we use the user's Chrome).
            "@sparticuz/chromium",
            "unpdf",
            "mammoth",
        ],
        // The /api/ai-interview/tts route imports kokoroTts (in-process Kokoro)
        // as a LOCAL-DEV fallback. Next's file-tracing follows the dynamic
        // `import("kokoro-js")` and drags in onnxruntime-node — 405 MB of
        // GPU/CUDA/TensorRT .so files — which blows past Vercel's 250 MB
        // serverless-function limit and fails the deploy. In production this
        // path is never used (Azure AI Speech is primary, the Azure VM Kokoro
        // is the next fallback), so exclude those native packages from the
        // function bundle. If the in-process path were ever reached, the
        // dynamic import simply throws and the route's try/catch handles it.
        outputFileTracingExcludes: {
            "/api/ai-interview/tts": [
                "**/onnxruntime-node/**",
                "**/@huggingface/transformers/**",
                "**/kokoro-js/**",
                "**/phonemizer/**",
            ],
            "/api/ai-interview/stt": [
                "**/onnxruntime-node/**",
                "**/@huggingface/transformers/**",
                "**/kokoro-js/**",
                "**/phonemizer/**",
            ],
        },
        // Make sure the serverless Chromium binary (a Brotli pack decompressed
        // to /tmp at runtime) is bundled into the resume PDF function — Next's
        // file tracing won't otherwise follow @sparticuz/chromium's bin assets.
        // NOTE: point at pnpm's REAL `.pnpm` dir, not the symlinked
        // `node_modules/@sparticuz/chromium` (Vercel rejects "files in
        // symlinked directories" in a serverless function package).
        outputFileTracingIncludes: {
            "/api/resume/pdf": [
                "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
            ],
        },
    },
};

module.exports = nextConfig;
