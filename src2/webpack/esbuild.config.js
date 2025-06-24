// esbuild.config.js
import { build } from 'esbuild';

// Get build mode from command line argument
const mode = process.argv[2] || 'dev';
const isProd = mode === 'prod';

console.log(`Building in ${mode} mode...`);

// Dummy document shim for worker context
// const dummyDocument = `
// // Inject dummy document for worker context
// if (typeof document === 'undefined') {
//   var document = {
//     createElement: () => ({}),
//     getElementById: () => null,
//     querySelector: () => null,
//     addEventListener: () => {},
//     removeEventListener: () => {}
//   };
// }
// if (typeof window === 'undefined') {
//   var window = { };
// }
// `;

async function buildApp() {
  try {
    // Bundle main app
    await build({
      entryPoints: ['src2/main/mesh.js'],
      bundle: true,
      outfile: 'src2/pack/mesh.js',
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

    // Bundle worker
    await build({
      entryPoints: ['src2/mesh/work.js'],
      bundle: true,
      outfile: 'src2/pack/work.js',
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

// You can add more build steps or static asset copying as needed. 