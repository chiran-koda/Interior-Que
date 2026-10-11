import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/firestore.rules.test.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
    server: {
      deps: {
        inline: [
          "@firebase/rules-unit-testing",
          "firebase",
          "@firebase/app-compat",
          "@firebase/firestore-compat",
        ],
      },
    },
  },
});
