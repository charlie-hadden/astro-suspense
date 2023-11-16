import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import suspense from "astro-suspense";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel/serverless";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [tailwind(), suspense(), react()]
});
