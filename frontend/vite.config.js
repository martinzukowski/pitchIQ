import { defineConfig } from "vite";
import fable from "vite-plugin-fable";

export default defineConfig({
  plugins: [fable({ fsproj: "./SportsProj.fsproj" })],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
