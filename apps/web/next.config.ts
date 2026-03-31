import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prof/contracts"],
  async rewrites() {
    return [
      {
        source: "/@:username/:courseSlug/:version/quiz/:quizIndex",
        destination: "/course/:username/:courseSlug/:version/quiz/:quizIndex",
      },
      {
        source: "/@:username/:courseSlug/:version",
        destination: "/course/:username/:courseSlug/:version",
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
