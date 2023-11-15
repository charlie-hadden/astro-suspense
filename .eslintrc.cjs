module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
  },
  env: {
    es6: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:tailwindcss/recommended",
    "plugin:astro/recommended",
    "plugin:astro/jsx-a11y-recommended",
    "prettier",
  ],
  overrides: [
    {
      files: ["*.astro"],
      parser: "astro-eslint-parser",
      parserOptions: {
        parser: "@typescript-eslint/parser",
        extraFileExtensions: [".astro"],
      },
    },
  ],
  plugins: ["@typescript-eslint"],
  settings: {
    tailwindcss: {
      config: "./example/tailwind.config.mjs",
    },
  },
  rules: {
    "no-undef": "off",
    "tailwindcss/no-custom-classname": "off",
    "tailwindcss/classnames-order": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
}
