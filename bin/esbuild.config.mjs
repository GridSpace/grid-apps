import { build, transform } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import glob from 'fast-glob';

// Get build mode from command line argument
const mode = process.argv[2] || 'dev';
const isProd = mode === 'prod';

console.log(`Building in ${mode} mode...`);

const MESH_OUTFILE = 'src/pack/mesh-main.js';
const MESH_EXTRAS = [ ];

const KIRI_OUTFILE = 'src/pack/kiri-main.js';
const KIRI_EXTRAS = [
    'src/ext/base64.js'
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

async function generateDevices(dir = '') {
    let root = path.join(dir, "src", "kiri", "dev");
    let devs = {};
    let files = await fs.readdir(root);
    for (let type of files) {
        let map = devs[type] = devs[type] || {};
        let devices = await fs.readdir(path.join(root, type));
        for (let device of devices) {
            let deviceName = device.endsWith('.json')
                ? device.substring(0, device.length - 5)
                : device;
            map[deviceName] = JSON.parse(await fs.readFile(path.join(root, type, device)));
        }
    }
    let dstr = JSON.stringify(devs);
    fs.mkdir(path.join(dir, "src", "pack"), { recursive: true });
    await fs.writeFile(path.join(dir, "src", "pack", "kiri-devs.js"), `export const devices = ${dstr};`);
    if (true) {
        // create alt artifacts
        await fs.mkdir('alt/pack', { recursive: true });
        await fs.writeFile(path.join(dir, "alt", "pack", "kiri-devs.js"), `export const devices = ${dstr};`);
    }
}

const logOverride = {
    'duplicate-class-member': 'silent',
    'duplicate-object-key': 'silent',
    'direct-eval': 'silent'
};

const rec = {
    bundle: true,
    define: { 'process.env.NODE_ENV': `"${mode}"` },
    external: [
        'module',
        './constants',
        './voronoi_structures',
        './voronoi_ctypes',
        '../thirdparty/jsbn',
        './collections',
        './voronoi_predicates',
        './voronoi_builder',
        './point_data',
        './segment_data',
        './cppgen',
        './voronoi_diagram',
        './voronoi'
    ],
    format: 'esm',
    logOverride,
    minify: isProd,      // false for dev, true for prod
    platform: 'browser',
    sourcemap: false,
    target: 'es2020',
};

async function buildApp() {
    try {
        // Concatenate kiri devices
        generateDevices();

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
