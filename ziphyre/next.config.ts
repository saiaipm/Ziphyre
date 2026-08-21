import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Server Function calls are logged with their ARGUMENTS in dev.
    // Saving a provider key passes that key as an argument, so the
    // customer's plaintext API key ends up in the terminal and in any
    // captured dev log. Off — the argument values are never worth that.
    serverFunctions: false,
  },
};

export default nextConfig;
