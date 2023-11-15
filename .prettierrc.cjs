module.exports = {
  plugins: [
    require.resolve("prettier-plugin-astro"),
    require.resolve("prettier-plugin-tailwindcss"),
  ],
  tailwindConfig: "./example/tailwind.config.mjs",
  overrides: [
    {
      files: "*.astro",
      options: { parser: "astro" },
    }
  ]
}
