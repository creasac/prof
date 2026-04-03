import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "prof",
    short_name: "prof",
    description: "prof helps you learn anything.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f5ef",
    theme_color: "#f8f5ef",
    icons: [
      {
        src: "/icon.png",
        sizes: "800x560",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
