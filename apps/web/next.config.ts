import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These are workspace packages published as raw TypeScript source (see
  // IMPLEMENTATION_DECISIONS.md D-017) — Next's compiler needs to transpile
  // them itself rather than treating them as pre-built node_modules code.
  transpilePackages: ["@abytetex/types", "@abytetex/validation"],
};

export default nextConfig;
