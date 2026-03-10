import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@walkflow/core", "@walkflow/db"],
  experimental: {
    outputFileTracingRoot: path.join(process.cwd(), "../..")
  }
};

export default nextConfig;
