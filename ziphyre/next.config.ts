import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (via pdf-parse) loads its worker script from a path
  // relative to its own file on disk. Bundling it moves that path and
  // the worker can't be found ("Setting up fake worker failed").
  // Native `require` from node_modules keeps the worker alongside it.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // ...but keeping the worker beside its parent only helps if the worker
  // is actually deployed. pdfjs loads it with a runtime `import()` built
  // from a path string, which static tracing cannot see, so Vercel's
  // bundle omitted it and every PDF failed in production with
  //   Setting up fake worker failed: Cannot find module
  //   '/var/task/.../pdfjs-dist/legacy/build/pdf.worker.mjs'
  // while working locally, where the whole of node_modules is on disk.
  //
  // Both entry points need it: screening runs from a Server Action on
  // the opening page and from the cron job runner.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/build/pdf.worker.mjs",
    ],
  },
  logging: {
    // Server Function calls are logged with their ARGUMENTS in dev.
    // Saving a provider key passes that key as an argument, so the
    // customer's plaintext API key ends up in the terminal and in any
    // captured dev log. Off — the argument values are never worth that.
    serverFunctions: false,
  },
  experimental: {
    serverActions: {
      // Default is 1MB, which a single CV can exceed on its own and a
      // bulk upload (FR-32) exceeds easily. Real CVs run a few hundred
      // KB to low single-digit MB.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
