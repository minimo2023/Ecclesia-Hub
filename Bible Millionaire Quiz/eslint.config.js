import globals from 'globals';

export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            'server/public/**',
            'src/recovered-production/**',
            'mobile-app/src/recovered-production/**'
        ]
    },
    {
        files: [
            'src/**/*.{js,jsx}',
            'mobile-app/src/**/*.{js,jsx}',
            'scripture-tools-app/**/*.{js,jsx}'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2024,
                ...globals.node
            },
            parserOptions: {
                ecmaFeatures: { jsx: true }
            }
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'warn'
        },
        rules: {
            'no-duplicate-case': 'error',
            'no-dupe-keys': 'error',
            'no-func-assign': 'error',
            'no-import-assign': 'error',
            'no-obj-calls': 'error',
            'no-unreachable': 'error',
            'no-unreachable-loop': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'no-with': 'error',
            'valid-typeof': 'error'
        }
    }
];
