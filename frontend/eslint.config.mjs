// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import vitest from '@vitest/eslint-plugin';
// Future cleanup: remove this wrapper once angular-eslint releases ESLint 10 support
import * as templateParserCompat from './eslint-template-parser-compat.mjs';

/**
 * Signal Forms is the only forms API this app uses. The legacy
 * template-driven (`ngModel`) and reactive (`formControl`) APIs are banned so
 * they cannot creep back in.
 *
 * These bans are not cosmetic. A `<form>` carrying `(ngSubmit)` without
 * `FormsModule` in the component's `imports` compiles clean and silently never
 * submits — Angular treats the unknown binding as a plain DOM event. That
 * exact failure shipped once already; the template rule below is the tripwire.
 *
 * Use instead:
 *   - `[formField]="form.someField"` for value binding
 *   - `<form [formRoot]="form">` + `form(model, schema, { submission: { action } })`
 *     for submission (FormRoot also restores the `novalidate` that FormsModule
 *     used to add)
 *   - plain `[value]` + `(input)` for one-way bindings that need no validation
 *
 * The allowlist below is deliberately explicit: adding a file to it should be
 * a conscious decision recorded in review, not an accident.
 */
const LEGACY_FORMS_ALLOWLIST = [
  // ngx-input-color / ngx-input-gradient are third-party custom controls that
  // bind through ngModel's ControlValueAccessor contract; `[value]`+`(input)`
  // does not work with them (NG8002).
  'src/app/components/worldbuilding/appearance-panel/color-picker/**',
  'src/app/components/worldbuilding/appearance-panel/gradient-designer/**',
];

// Ban the root module wholesale rather than naming symbols: an importNames
// allowlist silently permits everything it forgot (Validators,
// NonNullableFormBuilder, FormRecord, the ControlValueAccessor tokens, ...).
// `paths` matches the exact specifier, so '@angular/forms/signals' — where
// Signal Forms actually lives — is unaffected.
const NO_LEGACY_FORMS_IMPORTS = [
  'error',
  {
    paths: [
      {
        name: '@angular/forms',
        message:
          "This app uses Signal Forms. Import from '@angular/forms/signals' instead (form, FormField, FormRoot, required, ...). See LEGACY_FORMS_ALLOWLIST in eslint.config.mjs for the documented exceptions.",
      },
    ],
  },
];

const signalFormsMessage = (what, instead) =>
  `${what} is the legacy forms API — this app uses Signal Forms. ${instead}`;

/**
 * The template parser emits a different node type per binding syntax:
 * `foo="x"` is a TextAttribute, `[foo]="x"` a BoundAttribute and `(foo)="x"` a
 * BoundEvent. Matching only one of them leaves the other spellings legal, so
 * every banned name is matched across all three.
 */
const anyBindingOf = (...names) =>
  names
    .flatMap(name =>
      ['TextAttribute', 'BoundAttribute', 'BoundEvent'].map(
        type => `${type}[name="${name}"]`
      )
    )
    .join(', ');

const NO_LEGACY_FORMS_TEMPLATE_SYNTAX = [
  'error',
  {
    selector: anyBindingOf('ngSubmit'),
    message: signalFormsMessage(
      '(ngSubmit)',
      'Use <form [formRoot]="form"> and declare the handler via form(model, schema, { submission: { action } }). Without FormsModule imported, (ngSubmit) compiles fine and silently never fires.'
    ),
  },
  {
    selector: anyBindingOf('ngModel', 'ngModelChange', 'ngModelGroup'),
    message: signalFormsMessage(
      'ngModel',
      'Use [formField]="form.someField", or plain [value]/[checked] + an event handler for one-way bindings.'
    ),
  },
  {
    selector: anyBindingOf(
      'formControl',
      'formControlName',
      'formGroup',
      'formGroupName',
      'formArray',
      'formArrayName'
    ),
    message: signalFormsMessage(
      'ReactiveForms (formControl/formGroup)',
      'Use form() from @angular/forms/signals with [formField].'
    ),
  },
];

export default tseslint.config(
  {
    files: ['src/app/**/*.ts', 'src/themes/**/*.ts', 'e2e/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      'unused-imports': unusedImportsPlugin,
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-restricted-imports': NO_LEGACY_FORMS_IMPORTS,
      // The v22 migration pinned ChangeDetectionStrategy.Eager on all existing
      // components to keep pre-v22 behavior; migrating them to OnPush is
      // tracked as future work.
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/member-ordering': ['off'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      'unused-imports': unusedImportsPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      vitest: vitest,
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'vitest/expect-expect': 'off',
    },
  },
  {
    files: ['**/*.html'],
    ignores: ['src/index.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    // Override parser with ESLint 10 compatible wrapper
    // Future cleanup: remove once angular-eslint releases ESLint 10 support
    languageOptions: {
      parser: templateParserCompat,
    },
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      'no-restricted-syntax': NO_LEGACY_FORMS_TEMPLATE_SYNTAX,
    },
  },
  // The documented legacy-forms holdouts. Everything else is Signal Forms.
  {
    files: LEGACY_FORMS_ALLOWLIST,
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
