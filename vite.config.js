import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/401k-planner/",
  plugins: [react()],
});
