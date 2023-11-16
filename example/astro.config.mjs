import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import suspense from "astro-suspense";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [tailwind(), suspense(), react()],
});
