import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", ".turbo", "dist"],
    reporters: ["verbose"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: path.resolve(__dirname, "./apps/web/src/$1"),
      },
      {
        find: "@digimine/utils",
        replacement: path.resolve(__dirname, "./packages/utils/src/index.ts"),
      },
      {
        find: "@digimine/config",
        replacement: path.resolve(__dirname, "./packages/config/src/index.ts"),
      },
      {
        find: "@digimine/types",
        replacement: path.resolve(__dirname, "./packages/types/src/index.ts"),
      },
    ],
  },
});
