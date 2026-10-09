import type { MetadataRoute } from "next";

// Lets phones install Gainzville to the home screen and open it full screen, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gainzville",
    short_name: "Gainzville",
    description: "Smart protein on a student budget. Scan a meal, see the protein and what it cost you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#120e1f",
    theme_color: "#120e1f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
