import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("@react-three/fiber")
          ) {
            return "r3f-vendor";
          }

          if (
            id.includes("@react-three/drei") ||
            id.includes("three-stdlib") ||
            id.includes("camera-controls") ||
            id.includes("meshline") ||
            id.includes("troika")
          ) {
            return "drei-vendor";
          }

          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules\\three")
          ) {
            return "three-core";
          }

          if (id.includes("@tiptap")) {
            return "tiptap-vendor";
          }

          if (id.includes("react")) {
            return "react-vendor";
          }
        },
      },
    },
  },
  clearScreen: false,
});
