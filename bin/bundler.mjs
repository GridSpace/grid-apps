import fs from 'fs';
import path from 'path';
import uglify from 'uglify-js';
import { Buffer } from 'buffer';

const cfg = JSON.parse(fs.readFileSync(process.argv[2] || './bin/bundle.config.json', 'utf8'));
const { inputs, outputs, excludes, compress } = cfg;
const envcomp = process.env.COMPRESS ? JSON.parse(process.env.COMPRESS) : undefined;
const debug = process.env.DEBUG;

// --- recursive directory walker (follows symlinks safely) ---
function* walk(dir, seen = new Set()) {
    dir = path.normalize(dir);
    if (excludes.indexOf(dir) >= 0) {
        return;
    }

    const real = fs.realpathSync(dir);
    if (seen.has(real)) {
        return;
    }
    seen.add(real);

    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) yield* walk(p, seen);
        else yield p;
    }
}

// --- collect all files according to config ---
let entries = [];
let virtMap = new Set();
for (const input of inputs) {
    const root = input.root;
    const prefix = input.prefix || '';
    for (const file of walk(root)) {
        const rel = path.relative(root, file).replace(/\\/g, '/');
        const virt = prefix ? `${prefix}/${rel}` : rel;
        if (virtMap.has(virt)) {
            console.log('pre-existing', virt, rel, root);
        } else {
            entries.push({ file, virt });
            virtMap.add(virt);
        }
    }
}

// --- build header and data ---
const dataParts = [];
const entryMeta = [];
let offset = 0;
let cache = new Map();

for (const { file, virt } of entries) {
    if (excludes.indexOf(file) >= 0) {
        continue;
    }
    let record = cache.get(file);
    if (record) {
        if (debug) console.log({ alias: virt, from: file });
        entryMeta.push({ ...record, virt });
    } else {
        if (debug) console.log({ write: virt, from: file });
        let data = fs.readFileSync(file);
        if ((envcomp ?? compress) && file.endsWith("js")) {
            console.log('compress', file);
            data = uglify.minify(data.toString(), {
                compress: {
                    merge_vars: false,
                    unused: false
                }
            });
            // console.log({ to: typeof(data), data });
            if (!data.code) {
                if (debug) console.log({ skip: file });
                continue;
            }
            data = Buffer.from(data.code);
        }
        record = { virt, offset, length: data.length };
        cache.set(file, record);
        entryMeta.push(record);
        dataParts.push(data);
        offset += data.length;
    }
}

// temporary header without offsets to measure total size
let tempHeaderParts = [];
for (const { virt, offset, length } of entryMeta) {
    const name = Buffer.from(virt, 'utf8');
    const nlen = Buffer.alloc(2); nlen.writeUInt16LE(name.length);
    const offb = Buffer.alloc(4); offb.writeUInt32LE(0); // placeholder
    const lenb = Buffer.alloc(4); lenb.writeUInt32LE(length);
    tempHeaderParts.push(nlen, name, offb, lenb);
}
const count = Buffer.alloc(4); count.writeUInt32LE(entries.length);
const tempHeader = Buffer.concat([count, ...tempHeaderParts]);
const headerSize = tempHeader.length; // true data offset base

// now rebuild header with correct absolute offsets
let headerParts = [];
for (const { virt, offset, length } of entryMeta) {
    const name = Buffer.from(virt, 'utf8');
    const nlen = Buffer.alloc(2); nlen.writeUInt16LE(name.length);
    const offb = Buffer.alloc(4); offb.writeUInt32LE(headerSize + offset);
    const lenb = Buffer.alloc(4); lenb.writeUInt32LE(length);
    headerParts.push(nlen, name, offb, lenb);
    // console.log(virt);
}

const header = Buffer.concat([count, ...headerParts]);
const full = Buffer.concat([header, ...dataParts]);

// --- write final bundle ---
const outPath = outputs.bundle || './bundle.bin';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, full); // ⚡ write raw binary

console.log(`✅ Bundled ${entries.length} files → ${outPath} (${full.length} bytes)`);
