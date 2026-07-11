import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "小芽日记",
    short_name: "小芽日记",
    description: "分别记录宝宝的辅食、喂养、睡眠、尿布、生长与疫苗事实。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fbf7ef",
    theme_color: "#fbf7ef",
    lang: "zh-CN",
    categories: ["parenting", "lifestyle"],
    shortcuts: [
      { name: "记录喂养", short_name: "喂养", url: "/feeding" },
      { name: "记录睡眠", short_name: "睡眠", url: "/sleep" },
      { name: "记录尿布", short_name: "尿布", url: "/diapers" },
    ],
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
