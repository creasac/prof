import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prof/contracts"],
  async rewrites() {
    return [
      {
        source: "/@:username/:courseSlug/quiz/:quizIndex",
        destination: "/course/:username/:courseSlug/quiz/:quizIndex",
      },
      {
        source: "/@:username/:courseSlug",
        destination: "/course/:username/:courseSlug",
      },
      {
        source: "/@:username",
        destination: "/profile/:username",
      },
    ];
  },
};

export default nextConfig;
