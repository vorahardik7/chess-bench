import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Avoid picking a parent lockfile (e.g. ~/package-lock.json) as the workspace root. */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
