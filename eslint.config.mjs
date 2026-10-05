import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  // The rules below were turned off wholesale by the scaffold this project
  // started from. The ones that only ever complain about style stay off; the
  // ones that catch real defects — unreachable code, a switch case falling
  // through, a redeclared binding, a dependency array that lies — are back on,
  // and the codebase passes them with nothing suppressed.
  rules: {
    // TypeScript rules. `any` and non-null assertions are judgement calls that
    // this codebase makes deliberately and comments where it does.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    // An unused import is either a leftover or a mistake, and it is shipped
    // either way. `_` prefix opts a binding out, for the deliberate cases.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
    ],

    // React rules
    // A warning, not an error: the few places that lie about their dependencies
    // do it on purpose and say so, but a NEW one should be visible.
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules. Tenant-pasted image URLs render as plain <img> on purpose:
    // next/image would make this an open image proxy for arbitrary hosts.
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-useless-escape": "off",
    // Handled by @typescript-eslint's version, which understands types.
    "no-unused-vars": "off",
    // TypeScript already rejects an undefined name, and the base rule does not
    // know about TS globals.
    "no-undef": "off",
    "prefer-const": "error",
    "no-irregular-whitespace": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-redeclare": "error",
    "no-unreachable": "error",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
