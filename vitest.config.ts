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
    alias: {
      "@/": path.resolve(__dirname, "./apps/web/src/"),
      "@digimine/utils": path.resolve(__dirname, "./packages/utils/src/index.ts"),
      "@digimine/config": path.resolve(__dirname, "./packages/config/src/index.ts"),
      "@digimine/types": path.resolve(__dirname, "./packages/types/src/index.ts"),
    },
  },
});
