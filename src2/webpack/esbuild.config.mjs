import { build, transform } from 'esbuild';
import fs from 'fs/promises';
import glob from 'fast-glob';

// Get build mode from command line argument
const mode = process.argv[2] || 'dev';
const isProd = mode === 'prod';

console.log(`Building in ${mode} mode...`);

const MESH_OUTFILE = 'src2/pack/mesh-main.js';
const MESH_EXTRAS = [
    // 'mod/*/electron.js',
    // 'mod/*/tra0m.js',
    // 'mod/*/src/space.js'
];

const KIRI_OUTFILE = 'src2/pack/kiri-main.js';
const KIRI_EXTRAS = [
    // 'mod/*/electron.js',
    // 'mod/*/sync.js',
    // 'mod/*/don8.js',
    // 'mod/*/onshape.js',
    // 'mod/*/tra0.js',
    // 'mod/*/src/space.js'
];

async function appendExtraModules(extras, outfile, minify = false) {
    const files = await glob(extras);
    if (files.length === 0) return;

    const transformed = await Promise.all(
        files.map(async (file) => {
            const code = await fs.readFile(file, 'utf8');
            if (!minify) return code;

            const result = await transform(code, {
                minify: true,
                loader: 'js',
                target: 'es2020',
            });
            return result.code;
        })
    );

    await fs.appendFile(outfile, transformed.join(''));
    console.log(`Appended ${files.length} module(s) to ${outfile}`);
}

async function buildApp() {
    try {
        // Bundle mesh main app
        await build({
            entryPoints: [ 'src2/main/mesh.js' ],
            bundle: true,
            outfile: MESH_OUTFILE,
            format: 'esm',
            external: ['module'],
            sourcemap: !isProd,  // true for dev, false for prod
            minify: isProd,      // false for dev, true for prod
            target: 'es2020',
            platform: 'browser',
            define: {
                'process.env.NODE_ENV': `"${mode}"`
            }
        });

        appendExtraModules(MESH_EXTRAS, MESH_OUTFILE, isProd);

        // Bundle mesh worker
        await build({
            entryPoints: [ 'src2/mesh/work.js' ],
            bundle: true,
            outfile: 'src2/pack/mesh-work.js',
            format: 'esm',
            external: ['module'],
            sourcemap: !isProd,  // true for dev, false for prod
            minify: isProd,      // false for dev, true for prod
            target: 'es2020',
            platform: 'browser',
            define: {
                'process.env.NODE_ENV': `"${mode}"`
            }
        });

        // Bundle kiri main app
        await build({
            entryPoints: [ 'src2/main/kiri.js' ],
            bundle: true,
            outfile: KIRI_OUTFILE,
            format: 'esm',
            external: ['module'],
            sourcemap: !isProd,  // true for dev, false for prod
            minify: isProd,      // false for dev, true for prod
            target: 'es2020',
            platform: 'browser',
            define: {
                'process.env.NODE_ENV': `"${mode}"`
            }
        });

        appendExtraModules(KIRI_EXTRAS, KIRI_OUTFILE, isProd);

        // Bundle kiri worker
        await build({
            entryPoints: [ 'src2/kiri-run/worker.js' ],
            bundle: true,
            outfile: 'src2/pack/kiri-work.js',
            format: 'esm',
            external: ['module'],
            sourcemap: !isProd,  // true for dev, false for prod
            minify: isProd,      // false for dev, true for prod
            target: 'es2020',
            platform: 'browser',
            define: {
                'process.env.NODE_ENV': `"${mode}"`
            }
        });

        // Bundle kiri minion
        await build({
            entryPoints: [ 'src2/kiri-run/minion.js' ],
            bundle: true,
            outfile: 'src2/pack/kiri-pool.js',
            format: 'esm',
            external: ['module'],
            sourcemap: !isProd,  // true for dev, false for prod
            minify: isProd,      // false for dev, true for prod
            target: 'es2020',
            platform: 'browser',
            define: {
                'process.env.NODE_ENV': `"${mode}"`
            }
        });

        console.log(`Build completed successfully in ${mode} mode!`);
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

buildApp();