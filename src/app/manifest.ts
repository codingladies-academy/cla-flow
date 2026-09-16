import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CLA Flow — Task & Project Board",
    short_name: "CLA Flow",
    description: "Manage staff, volunteer tasks, and projects for Coding Ladies Academy.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f1218",
    theme_color: "#00BFB3",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
