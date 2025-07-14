import { build, transform } from 'esbuild';
import fs from 'fs/promises';
import glob from 'fast-glob';

// Get build mode from command line argument
const mode = process.argv[2] || 'dev';
const isProd = mode === 'prod';

console.log(`Building in ${mode} mode...`);

const MESH_OUTFILE = 'src/pack/mesh-main.js';
const MESH_EXTRAS = [ ];

const KIRI_OUTFILE = 'src/pack/kiri-main.js';
const KIRI_EXTRAS = [ ];

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

const logOverride = {
    'duplicate-class-member': 'silent',
    'duplicate-object-key': 'silent',
    'direct-eval': 'silent'
};

const rec = {
    bundle: true,
    define: { 'process.env.NODE_ENV': `"${mode}"` },
    external: ['module'],
    format: 'esm',
    logOverride,
    minify: isProd,      // false for dev, true for prod
    platform: 'browser',
    sourcemap: !isProd,  // true for dev, false for prod
    target: 'es2020',
};

async function buildApp() {
    try {
        // Bundle mesh main app
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/main/mesh.js' ],
            outfile: MESH_OUTFILE,
        }));

        appendExtraModules(MESH_EXTRAS, MESH_OUTFILE, isProd);

        // Bundle mesh worker
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/mesh/work.js' ],
            outfile: 'src/pack/mesh-work.js',
        }));

        // Bundle kiri main app
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/main/kiri.js' ],
            outfile: KIRI_OUTFILE,
        }));

        appendExtraModules(KIRI_EXTRAS, KIRI_OUTFILE, isProd);

        // Bundle kiri worker
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/kiri/run/worker.js' ],
            outfile: 'src/pack/kiri-work.js',
        }));

        // Bundle kiri minion
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/kiri/run/minion.js' ],
            outfile: 'src/pack/kiri-pool.js',
        }));

        // Bundle kiri engine
        await build(Object.assign({}, rec, {
            entryPoints: [ 'src/kiri/run/engine.js' ],
            outfile: 'src/pack/kiri-eng.js',
        }));

        console.log(`Build completed successfully in ${mode} mode!`);
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

buildApp();
