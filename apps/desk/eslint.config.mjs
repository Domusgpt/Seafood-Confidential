import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // SQL must stay parameterized: tagged templates only, never raw strings (ADR-003).
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='unsafe']",
          message: 'Raw SQL (sql.unsafe) is not allowed in the desk; use tagged templates.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/supabase-js'],
              importNames: ['createClient'],
              message: 'The desk uses @supabase/ssr for auth only; data goes through src/lib/db.ts.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    // Generated public-site assets and local publishing output (scripts/build-site-assets.mjs).
    'site-static/**',
    '.site-output/**',
  ]),
]);

export default eslintConfig;
