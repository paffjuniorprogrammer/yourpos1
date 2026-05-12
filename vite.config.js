import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["pos-logo.jpg"],
            manifest: {
                name: "Antigravity POS",
                short_name: "AG POS",
                description: "Modern Multi-Tenant Point of Sale System",
                theme_color: "#2563eb",
                icons: [
                    {
                        src: "/pos-logo.jpg",
                        sizes: "1024x1024",
                        type: "image/jpeg",
                        purpose: "any maskable",
                    },
                ],
            },
        }),
    ],
});
