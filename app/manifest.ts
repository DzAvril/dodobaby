import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "小芽日记",
    short_name: "小芽日记",
    description: "分别记录宝宝的辅食、生长和日常照护。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fbf7ef",
    theme_color: "#fbf7ef",
    lang: "zh-CN",
    categories: ["parenting", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
