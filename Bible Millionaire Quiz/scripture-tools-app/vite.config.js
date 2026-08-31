import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const page = name => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig(({ mode }) => {
    const envDir = fileURLToPath(new URL('../../', import.meta.url));
    const env = loadEnv(mode, envDir, '');
    const apiTarget = `http://127.0.0.1:${env.PORT || '3005'}`;

    return {
    envDir,
    base: '/scripture-tools/',
    plugins: [react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: page('index'),
                explore: page('explore'),
                read: page('read'),
                order: page('order'),
                record: page('record'),
                search: page('search'),
                records: page('records'),
                share: page('share'),
                groups: page('groups'),
                churches: page('churches')
            }
        }
    },
    server: {
        port: 5186,
        proxy: {
            '/api': apiTarget
        }
    }
    };
});
