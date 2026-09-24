import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  // The auth API is called on this origin and forwarded, in development
  // exactly as Vercel's rewrite forwards it in production (Frontend/vercel.json),
  // so the refresh cookie is first-party in both (AUTH_DECISIONS.md E-15).
  // The Origin header passes through untouched for the server's CSRF check.
  const authProxy = {
    "/api/auth": {
      target: env.VITE_API_URL || "http://localhost:3001",
      changeOrigin: true,
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy: authProxy },
    preview: { proxy: authProxy },
  };
});
