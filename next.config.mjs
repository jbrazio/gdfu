import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dependencies } = require("./package.json");

// CI sets RELEASE_VERSION. Local builds use the nearest build tag: 2026.11.38 on the tag,
// 2026.11.38-2-g1a2b3c4 two commits later.
const gitVersion = () => {
  try {
    return execSync("git describe --tags --match 'v[0-9]*'", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().slice(1);
  } catch {
    return "unknown"; // no git or no tags (shallow clone)
  }
};
const { packages } = require("./package-lock.json");

// Runtime dependencies with their licence, for the About dialog.
const credits = Object.keys(dependencies).map((name) => {
  const { license } = packages[`node_modules/${name}`];
  return { name, license };
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_RELEASE_VERSION: process.env.RELEASE_VERSION || gitVersion(), NEXT_PUBLIC_CREDITS: JSON.stringify(credits) },
  output: "export",
};

export default nextConfig;
