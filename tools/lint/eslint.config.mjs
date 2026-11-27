import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/migrations/**", "**/*.cjs", "infra/load-tests/**", "apps/web/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // security-relevant bans (spec section 7)
      "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error",
      "no-restricted-syntax": ["error", { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "dangerouslySetInnerHTML is banned; React escaping is the XSS defence." }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { files: ["**/*.test.ts", "**/harness.ts"], rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-non-null-assertion": "off" } },
);
