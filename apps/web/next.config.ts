import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prof/contracts"],
  async rewrites() {
    return [
      {
        source: "/@:username",
        destination: "/profile/:username",
      },
    ];
  },
};

export default nextConfig;
