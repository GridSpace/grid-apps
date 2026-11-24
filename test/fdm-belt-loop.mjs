// Run with: node --experimental-vm-modules test/fdm-belt-loop.mjs
// Exercise the exporter with synthetic slice output and small dependency stubs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import '../src/add/array.js';

globalThis.self = {};
const source = await readFile(new URL('../src/kiri/mode/fdm/work/export.js', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(source);
const mocks = {
    '../../../../geo/base.js': {
        base: { config: {} },
        util: { round: (n, digits) => Number(n.toFixed(digits)) },
    },
    '../core/params.js': { getRangeParameters: (process) => process },
    './init-work.js': { FDM: { extrudeMM: (distance, perMM, factor) => distance * perMM * factor, extrudePerMM: () => 0.1 } },
    '../../../../moto/license.js': { version: 'test' },
};
await module.link(specifier => {
    const values = mocks[specifier];
    assert.ok(values, `unexpected import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    });
});
await module.evaluate();
const { fdm_export } = module.namespace;

function point(x, y, z) {
    return { x, y, z, distTo2D(other) { return Math.hypot(this.x - other.x, this.y - other.y); } };
}
function exportGcode({ count = 0, rangeCount = 0, belt = true } = {}) {
    const layers = [0, 1, 2].map(index => {
        const layer = [
            { point: point(0, index, 0.2 * (index + 1)), emit: 0, speed: 10 },
            { point: point(5, index, 0.2 * (index + 1)), emit: 1, speed: 10 },
        ];
        layer.slice = { index };
        layer.layer = index;
        layer.height = 0.2;
        layer.z = 0.2 * (index + 1);
        layer.print_time = 1;
        return layer;
    });
    const process = {
        outputLoops: count,
        ranges: rangeCount ? [{ lo: 1, hi: 2, fields: { outputLoops: rangeCount } }] : [],
        outputSeekrate: 50, outputFeedrate: 20, sliceHeight: 0.2,
        outputRetractDist: 0, outputRetractSpeed: 1,
    };
    const device = {
        bedBelt: belt, bedWidth: 200, bedDepth: 200, maxHeight: 200,
        extruders: [{ extOffsetX: 0, extOffsetY: 0, extNozzle: 0.4, extFilament: 1.75 }],
        gcodePre: [], gcodePost: [],
    };
    const print = {
        widgets: [], output: layers, tools: { 0: true }, total_time: 3,
        constReplace: line => line,
        settings: { bounds: { min: { x: 0, y: 0 }, max: { x: 5, y: 2 } }, controller: {}, device, process, filter: { FDM: 'test' }, mode: 'FDM' },
    };
    const chunks = [];
    fdm_export(print, chunk => chunks.push(chunk), () => {});
    return chunks.join('\n');
}

let failures = 0;
for (const kind of ['part', 'range']) {
    for (const count of [1, 2, 5, -1]) {
        const options = kind === 'part' ? { count } : { rangeCount: count };
        const gcode = exportGcode(options);
        const actual = gcode.match(/^M808 L-?\d+$/gm)?.[0];
        const expected = `M808 L${count < 0 ? 0 : count}`;
        console.log(`${kind} ${count}: ${actual}; expected ${expected}`);
        if (actual !== expected) failures++;
        assert.equal((gcode.match(/^M808$/gm) || []).length, 1, `${kind} loop closes once`);
        const loopStart = gcode.indexOf(actual);
        const firstLayer = gcode.indexOf(kind === 'part' ? ';; --- layer 0' : ';; --- layer 1');
        const lastLayer = gcode.indexOf(';; --- layer 2');
        assert.ok(loopStart < firstLayer && gcode.lastIndexOf('M808') > lastLayer, `${kind} markers enclose the intended layers`);
    }
}
assert.equal((exportGcode().match(/^M808/gm) || []).length, 0);
assert.equal((exportGcode({ count: 2, belt: false }).match(/^M808/gm) || []).length, 0);
assert.equal(failures, 0, `${failures} incorrect loop commands`);
