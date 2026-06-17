/**
 * Vite Configuration
 *
 * Configures the Vite build tool with:
 * - React plugin for JSX support and fast refresh
 * - Tailwind CSS plugin for utility-first CSS framework
 *
 * Vite provides fast development server and optimized production builds
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), // Enable React JSX and Fast Refresh in development
    tailwindcss(), // Enable Tailwind CSS utility classes
  ],
});
