import type { AstroIntegration } from "astro";

export default function createIntegration(): AstroIntegration {
  return {
    name: "astro-suspense",
    hooks: {
      "astro:config:setup"({ addMiddleware }) {
        addMiddleware({
          entrypoint: 'astro-suspense/middleware',
          order: 'post',
        })
      },
    },
  }
}
