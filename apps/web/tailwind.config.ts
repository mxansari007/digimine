import type { Config } from "tailwindcss";
import sharedConfig from "@digimine/ui/tailwind.config";

const config: Config = {
    presets: [sharedConfig as Config],
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["var(--font-inter)", "sans-serif"],
                display: ["var(--font-jakarta)", "sans-serif"],
            },
            keyframes: {
                shimmer: {
                    "0%": { transform: "translateX(-100%)" },
                    "100%": { transform: "translateX(100%)" },
                },
            },
            animation: {
                shimmer: "shimmer 2.5s infinite linear",
            },
        },
    },
    plugins: [],
};

export default config;
