import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, "src/renderer"),
  plugins: [react()],
  base: "./",
  build: {
    outDir: path.resolve(rootDir, "src/renderer-dist"),
    emptyOutDir: true,
  },
});