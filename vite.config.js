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
                name: "UMUCURUZI POS",
                short_name: "UMUCURUZI",
                description: "Smart Point of Sale system for businesses in Rwanda. Manage sales, inventory, purchases, VAT reports and more.",
                theme_color: "#2563eb",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/",
                lang: "en",
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
