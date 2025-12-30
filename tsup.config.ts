import { defineConfig } from 'tsup';
import { version } from './package.json';

export default defineConfig([
    // Main builds (CJS + ESM)
    {
        entry: {
            index: 'src/index.ts',
            stream: 'src/stream.ts',
            cli: 'src/cli.ts',
        },
        format: ['cjs', 'esm'],
        dts: true,
        clean: true,
        sourcemap: true,
        minify: true,
        target: 'es2020',
        outDir: 'dist',
        splitting: false,
        treeshake: true,
        shims: true,
        define: {
            'process.env.npm_package_version': JSON.stringify(version),
        },
        banner: {
            js: '// repair-json-stream - High-performance JSON repair',
        },
    },
    // Browser build (IIFE/UMD-like)
    {
        entry: { 'repair-json-stream.browser': 'src/repair-json.ts' },
        format: ['iife'],
        globalName: 'RepairJsonStream',
        minify: true,
        target: 'es2020',
        outDir: 'dist',
        platform: 'browser',
        banner: {
            js: '// repair-json-stream - Browser build',
        },
    },
]);
