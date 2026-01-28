import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import perf from 'eslint-plugin-react-perf';
import promisePlugin from 'eslint-plugin-promise';
import arrayFunc from 'eslint-plugin-array-func';
import testingLibrary from 'eslint-plugin-testing-library';
import jestDom from 'eslint-plugin-jest-dom';
import noLoops from 'eslint-plugin-no-loops';
import noSecrets from 'eslint-plugin-no-secrets';
import compat from 'eslint-plugin-compat';
import jsdoc from 'eslint-plugin-jsdoc';
import boundaries from 'eslint-plugin-boundaries';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import customRules from './eslint-custom-rules/index.js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.config.{ts,js}', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        project: './tsconfig.json'
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        // DOM types
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLTableElement: 'readonly',
        SVGSVGElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        CustomEvent: 'readonly',
        EventListener: 'readonly',
        ResizeObserver: 'readonly',
        URLSearchParams: 'readonly',
        // Web APIs
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        CryptoKey: 'readonly',
        // React
        React: 'readonly',
        // TypeScript/Node types
        NodeJS: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      'import': importPlugin,
      'security': security,
      'sonarjs': sonarjs,
      'unicorn': unicorn,
      'react-perf': perf,
      'promise': promisePlugin,
      'array-func': arrayFunc,
      'testing-library': testingLibrary,
      'jest-dom': jestDom,
      'no-loops': noLoops,
      'no-secrets': noSecrets,
      'compat': compat,
      'jsdoc': jsdoc,
      'boundaries': boundaries,
      'no-unsanitized': noUnsanitized,
      'custom': customRules
    },
    rules: {
      // Core JavaScript bug prevention
      'no-undef': 'off', // Disabled: TypeScript's compiler already enforces this check and does it significantly better; causes false positives with type definitions, interfaces, enums, and generics (see typescript-eslint FAQ)
      'no-unused-vars': 'off', // Handled by TypeScript
      'no-constant-condition': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-extra-boolean-cast': 'error',
      'no-func-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-obj-calls': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-use-before-define': 'off',
      'init-declarations': 'off',
      'no-console': ['off', { allow: ['warn', 'error'] }],
      'no-implicit-globals': 'off', // TODO: check

      // TypeScript rules for runtime safety
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off', // TODO: check - too many
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off', // TODO: check - too many
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-array-delete': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-unsafe-enum-comparison': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-unary-minus': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/prefer-namespace-keyword': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/triple-slash-reference': 'error',
      '@typescript-eslint/consistent-return': 'off', // Redundant with TypeScript's noImplicitReturns (enabled via strict: true); has false positives with void/undefined returns
      '@typescript-eslint/no-confusing-void-expression': 'off', // TODO: check - too many
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/no-misused-spread': 'error',
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-unnecessary-template-expression': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off', // Stylistic rule with known false positives for type assertion helpers like getField<T>(), factory functions, and similar patterns where T is explicitly provided at call sites
      '@typescript-eslint/no-unnecessary-type-conversion': 'off', // Disabled: False positives with defensive conversions for API responses and generated clients; types may not always match runtime values
      '@typescript-eslint/non-nullable-type-assertion-style': 'off', // Stylistic rule - 'value as Type' vs 'value!' is preference; explicit assertions can be more readable
      '@typescript-eslint/prefer-destructuring': 'off', // Stylistic rule with false positives and auto-fix risks
      '@typescript-eslint/prefer-find': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'off', // Stylistic rule with false positives
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/related-getter-setter-pairs': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off', // Stylistic rule with false positives - flags non-Promise .catch() methods, breaks bound functions like .catch(console.log.bind(console)), requires boilerplate arrow wrappers
      '@typescript-eslint/no-unsafe-type-assertion': 'off', // TODO: check - too many
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off', // TODO: check - too many
      '@typescript-eslint/require-array-sort-compare': 'off',
      '@typescript-eslint/consistent-type-exports': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // React hooks rules (prevent bugs)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Promise rules (async bug prevention)
      'promise/always-return': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-nesting': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/avoid-new': 'off', // Stylistic rule - new Promise() is often required for browser APIs, timers, event emitters; util.promisify not available in browsers
      'promise/no-return-in-finally': 'error',

      // Array function rules (prevent common mistakes)
      'array-func/from-map': 'off', // Stylistic rule - Array.from(x).map(fn) vs Array.from(x, fn) is preference; both are correct
      'array-func/no-unnecessary-this-arg': 'error',
      'array-func/prefer-array-from': 'off', // Stylistic rule - [...iterable] vs Array.from() is preference
      'array-func/avoid-reverse': 'error',
      
      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript for prop validation
      'react/jsx-boolean-value': 'off',
      'react/jsx-no-useless-fragment': 'off',
      'react/no-unstable-nested-components': 'off',
      'react/no-array-index-key': 'off',
      'react/jsx-no-bind': 'off', // TODO: check
      'react/jsx-no-constructed-context-values': 'off',
      'react/no-object-type-as-default-prop': 'off',
      'react/hook-use-state': 'off',
      'react-refresh/only-export-components': 'off', // Disabled: Only affects HMR in development, not production; has false positives for legitimate patterns (constants, utilities, context exports alongside components)
      
      // Import rules
      'import/order': ['off', { // TODO: check
        'groups': [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'always',
        'alphabetize': { 'order': 'asc', 'caseInsensitive': true }
      }],
      'import/no-duplicates': 'error',
      'import/no-unused-modules': 'off', // Disabled: Can be problematic in development
      'import/no-cycle': 'off', // Disabled: Can be disruptive during refactoring
      
      // Security rules
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-fs-filename': 'off', // TODO: check
      'security/detect-possible-timing-attacks': 'off', // TODO: check
      'no-secrets/no-secrets': 'off', // TODO: check
      'no-unsanitized/method': 'off', // TODO: check
      'no-unsanitized/property': 'off', // TODO: check
      
      // SonarJS rules for code quality (enterprise patterns)
      'sonarjs/no-duplicate-string': 'off', // Disabled: Can be annoying for simple strings
      'sonarjs/cognitive-complexity': ['off', 100],
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-identical-functions': 'off', // Stylistic DRY rule - intentional duplication is often valid for semantic separation or future divergence
      'sonarjs/no-collapsible-if': 'off', // Stylistic rule - same as unicorn/no-lonely-if; nested if vs combined && is preference
      'sonarjs/prefer-immediate-return': 'off', // Disabled: Can hurt readability sometimes
      'sonarjs/no-useless-catch': 'error',
      'sonarjs/prefer-single-boolean-return': 'off', // Stylistic rule - flags if/else boolean returns suggesting direct return; has false positives with guard clauses and can reduce readability in complex conditions
      'sonarjs/no-duplicated-branches': 'off',
      'sonarjs/no-small-switch': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-empty-collection': 'error',

      // Unicorn rules (modern JavaScript patterns)
      'unicorn/better-regex': 'off',
      'unicorn/catch-error-name': 'off',
      'unicorn/explicit-length-check': 'off', // TODO: check - too many
      'unicorn/no-for-loop': 'off', // Stylistic rule - for vs for...of is preference; auto-fix has known issues
      'unicorn/prefer-includes': 'off', // Stylistic rule - .indexOf() !== -1 vs .includes() is preference; both are semantically correct
      'unicorn/prefer-number-properties': 'off', // Stylistic rule - Number.parseInt vs parseInt is preference; isNaN vs Number.isNaN has different semantics making auto-fix dangerous
      'unicorn/throw-new-error': 'error',
      'unicorn/no-lonely-if': 'off', // Stylistic rule - nested if vs combined && is preference; nesting can improve clarity
      'unicorn/prefer-modern-dom-apis': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-ternary': 'off', // Disabled: Can hurt readability, overly opinionated
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/consistent-destructuring': 'off', // Stylistic rule - enforces using destructured vars instead of obj.prop; has false positives and is tedious during refactoring
      'unicorn/require-post-message-target-origin': 'error', // False positives with Worker.postMessage, MessageChannel, etc. that don't require targetOrigin
      'unicorn/no-array-for-each': 'off', // Disabled: forEach is often more readable
      'unicorn/no-array-reduce': 'off', // Disabled: reduce is a valid functional programming pattern
      'unicorn/prefer-dom-node-text-content': 'error',
      'unicorn/prefer-dom-node-dataset': 'error',
      
      // Performance and Quality rules
      'no-loops/no-loops': 'off',
      'complexity': ['off', { max: 100 }],
      'react-perf/jsx-no-new-object-as-prop': [ // TODO: hard to fix
        'off',
        {
          // Allow inline styles for native HTML elements (common and usually acceptable)
          // nativeAllowList: ['style']
          // Alternative: Use 'all' to ignore all native elements
          nativeAllowList: 'all'
        }],
      'react-perf/jsx-no-new-array-as-prop': [
        'off',
        {
          // Optionally allow arrays for native elements
          // nativeAllowList: ['className'] // if you want to allow className={['class1', 'class2']}
        }
      ],
      'react-perf/jsx-no-new-function-as-prop': [ // TODO: hard to fix
        'off',
        {
          // Common native event handlers that are usually fine to inline
          // nativeAllowList: ['onClick', 'onChange', 'onSubmit', 'onFocus', 'onBlur']
          // Alternative: Allow all native elements
          nativeAllowList: 'all'
        }
      ],
      'react-perf/jsx-no-jsx-as-prop': [ // TODO: hard to fix
        'off',
        {
          // You might want to allow certain common props like 'icon' for UI libraries
          nativeAllowList: ['icon']
        }
      ],

      // Browser compatibility and standards
      'compat/compat': 'off',
      
      // Documentation and API design
      'jsdoc/check-alignment': 'off',
      'jsdoc/check-indentation': 'off',
      'jsdoc/require-description-complete-sentence': 'off',
      'jsdoc/require-jsdoc': ['off', {
        'require': {
          'FunctionDeclaration': false,
          'MethodDefinition': false,
          'ClassDeclaration': true,
          'ArrowFunctionExpression': false
        }
      }],
      
      // Architecture and boundaries (for large codebases)
      'boundaries/element-types': 'off', // Configure based on project structure
      'boundaries/no-cross-dependencies': 'off', // Configure based on project structure
      
      // Advanced JSX accessibility
      'jsx-a11y/anchor-is-valid': 'off',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'off',
      'jsx-a11y/aria-props': 'off',
      'jsx-a11y/aria-role': 'off',
      'jsx-a11y/aria-unsupported-elements': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/no-autofocus': 'off',
      
      // Testing rules (for test files) - disabled by default, enable in test-specific configs
      // 'testing-library/prefer-screen-queries': 'off',
      // 'jest-dom/prefer-to-have-text-content': 'off',
      
      // Custom rules
      // 'custom/no-single-use-vars': ['warn', {
      //   allowDestructuring: true,
      //   allowFunctionParams: true,
      //   ignorePattern: '^_',
      //   allowedNames: ['error', 'err', 'e', 'result', 'res', 'data', 'response', 'req', 'request', 'message', 'errorMessage', 'errorResult', 'value', 'val', 'item', 'element', 'node', 'key', 'index', 'id', 'name', 'type', 'status', 'state']
      // }],
      'custom/no-redundant-initializer': 'off',
    },
    settings: {
      react: {
        version: 'detect'
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json'
        }
      }
    }
  },
  {
    files: ['**/*.config.{ts,js}', 'vite.config.ts', 'playwright.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      // Disable strict rules for config files
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off'
    }
  },
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    }
  },
  {
    ignores: ['dist/**', 'src/services/api/**/*.ts', 'tests/**', 'eslint-custom-rules/**', 'attachments/**']
  }
];