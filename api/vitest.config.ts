import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" -> "./src/*" alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // F-2: TOP-LEVEL, not inside test. Without the automatic JSX transform a .tsx suite
  // fails with "React is not defined" (the classic transform looks for a global React
  // that Next never needs), and before the include pattern was widened the rendering
  // suite did not run AT ALL - so the "status is conveyed as text" non-negotiable had
  // zero active coverage while the suite count looked right.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
