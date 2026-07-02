import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local dev serves at "/", so http://localhost:5173/ just works.
// Production build uses "/roadmeter/" to match the GitHub Pages project URL
// (https://<user>.github.io/roadmeter/).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/roadmeter/" : "/",
  plugins: [react()],
}));
