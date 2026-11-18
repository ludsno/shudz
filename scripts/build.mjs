import { context, build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const publicDir = resolve(rootDir, "public");
const distDir = resolve(rootDir, "dist");
const isWatch = process.argv.includes("--watch");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(publicDir, distDir, { recursive: true });

const buildOptions = {
  entryPoints: {
    "content/content": resolve(rootDir, "src/content/content.ts"),
    "popup/popup": resolve(rootDir, "src/popup/popup.ts"),
    "library/library": resolve(rootDir, "src/library/library.ts"),
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome114"],
  outdir: distDir,
  logLevel: "info",
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("Watching src/ for changes...");
} else {
  await build(buildOptions);
}
