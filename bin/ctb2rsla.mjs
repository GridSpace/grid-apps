#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { CTB } from '../src/kiri/mode/sla/work/x_ctb.js';

let [,, input, output] = process.argv;

if (!input) {
    console.error("usage: node bin/ctb2rsla.mjs input.ctb [output.rsla]");
    process.exit(1);
}

output = output || input.replace(/\.ctb$/i, "") + ".rsla";

let data = await fs.readFile(input);
let ctb = CTB.read(data);
let { header, machine } = ctb;
let lastPercent = -1;

console.log([
    "ctb",
    machine || "unknown-machine",
    `${header.resolutionX}x${header.resolutionY}`,
    `${header.layerCount} layers`,
    `${path.basename(output)}`
].join(" "));

let file = await CTB.toRSLA(data, (progress, message) => {
    let percent = Math.floor(progress * 100);
    if (percent !== lastPercent) {
        lastPercent = percent;
        process.stderr.write(`\r${message} ${percent}%`);
    }
});

if (lastPercent >= 0) process.stderr.write("\n");
await fs.writeFile(output, Buffer.from(file));
console.log(`wrote ${output}`);
