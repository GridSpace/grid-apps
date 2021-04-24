/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.fill) return;

    const KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        ROUND = UTIL.round,
        DEG2RAD = Math.PI / 180,
        FILL = self.kiri.fill = {
            hex: fillHexFull,
            grid: fillGrid,
            gyroid: fillGyroid,
            triangle: fillTriangle,
            linear: fillLinear,
            bubbles: fillBubbles
        },
        CACHE = self.kiri.fill_fixed = {
            hex: fillHexFull,
            grid: fillGrid,
            triangle: fillTriangle
        };

    function fillHexFull(target) {
        fillHex(target, true);
    }

    /**
     * emitter creates a hex infill pattern and sends to target
     *
     * @param {Object} target
     * @param {boolean} full continuous walls
     */
    function fillHex(target, full) {
        // compute segment lengths (vert/horiz and 45)
        let spacing = target.offset();
        let vhlen = (1 / target.density()) * (target.lineWidth() + spacing);
        let anxlen = ROUND(Math.cos(30 * DEG2RAD) * vhlen, 7);
        let anylen = ROUND(Math.sin(30 * DEG2RAD) * vhlen, 7);
        let bounds = target.bounds();
        let even = true;
        let evenZ = target.zIndex() % 2 === 0;
        let maxy = bounds.max.y + (vhlen + anylen * 2);
        let x, y;

        if (full || evenZ) {
            x = bounds.min.x;
            for (;;) {
                if (even && x > bounds.max.x) break;
                if (!even && x > bounds.max.x + anxlen + spacing) break;
                y = bounds.min.y;
                target.newline();
                while (y <= maxy) {
                    target.emit(x,y);
                    y += vhlen;
                    target.emit(x,y);
                    if (even) x += anxlen; else x -= anxlen;
                    y += anylen;
                    target.emit(x,y);
                    y += vhlen;
                    target.emit(x,y);
                    if (even) x -= anxlen; else x += anxlen;
                    y += anylen;
                }
                x += spacing;
                if (even) x += (anxlen * 2);
                even = !even;
                target.newline();
            }
        } else {
            y = bounds.min.y + vhlen;
            for (;;) {
                if (even && y > bounds.max.y) break;
                if (!even && y > bounds.max.y + anylen) break;
                x = bounds.min.x;
                target.newline();
                while (x < bounds.max.x) {
                    target.emit(x,y);
                    if (even) y += anylen; else y -= anylen;
                    x += anxlen;
                    target.emit(x,y);
                    x += spacing;
                    target.emit(x,y);
                    if (even) y -= anylen; else y += anylen;
                    x += anxlen;
                    target.emit(x,y);
                    x += spacing;
                }
                y += vhlen;
                if (even) y += (anylen * 2);
                even = !even;
                target.newline();
            }
        }
    }

    function fillGyroid(target) {
        let bounds = target.bounds();
        let height = target.zHeight();
        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let density = target.density();
        let tile = 1 + (1 - density) * 15;
        let tile_x = span_x / tile;
        let tile_y = span_y / tile;
        let tile_z = 1 / tile;
        let gyroid = BASE.gyroid.slice(target.zValue() * tile_z, (1 - density) * 500);

        gyroid.polys.forEach(poly => {
            for (let tx=0; tx<=tile_x; tx++) {
                for (let ty=0; ty<=tile_y; ty++) {
                    target.newline();
                    let bx = tx * tile + bounds.min.x;
                    let by = ty * tile + bounds.min.y;
                    poly.forEach(point => {
                        target.emit(bx + point.x * tile, by + point.y * tile);
                    });
                }
            }
        });
    }

    function fillGrid(target) {
        let bounds = target.bounds();
        let height = target.zHeight();
        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let density = target.density();
        let offset = target.offset() / 2;
        let tile = 1 + (1 - density) * 3;
        let tile_x = tile + offset;
        let tile_xc = span_x / tile_x;
        let tile_yc = span_y / tile;

        for (let tx=0; tx<=tile_xc; tx++) {
            target.newline();
            for (let ty=0; ty<=tile_yc; ty++) {
                let bx = tx * tile_x + bounds.min.x;
                let by = ty * tile + bounds.min.y;
                if ((tx + ty) % 2) {
                    target.emit(bx, by);
                    target.emit(bx + tile_x - offset, by + tile);
                } else {
                    target.emit(bx + tile_x - offset, by);
                    target.emit(bx, by + tile);
                }
            }
        }
    }

    function fillLinear(target) {
        let bounds = target.bounds();
        let height = target.zHeight();

        let density = target.density();
        let line = target.lineWidth();

        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let steps_x = (span_x / line) * density;
        let steps_y = (span_y / line) * density;
        let step_x = span_x / steps_x;
        let step_y = span_x / steps_x;

        if (target.zIndex() % 2 === 1) {
            for (let tx=bounds.min.x; tx<=bounds.max.x; tx += step_x) {
                target.newline();
                target.emit(tx, bounds.min.y);
                target.emit(tx, bounds.max.y);
            }
        } else {
            for (let ty=bounds.min.y; ty<=bounds.max.y; ty += step_y) {
                target.newline();
                target.emit(bounds.min.x, ty);
                target.emit(bounds.max.x, ty);
            }
        }
    }

    function fillTriangle(target) {
        let bounds = target.bounds();
        let height = target.zHeight();
        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let density = target.density();
        let offset = target.offset();
        let line_w = target.lineWidth() / 2;
        let tile = 1 + (1 - density) * 5;
        let tile_x = tile + offset*2 + line_w;
        let tile_xc = span_x / tile_x;
        let tile_yc = span_y / tile;

        for (let tx=0; tx<=tile_xc; tx++) {
            target.newline();
            for (let ty=0; ty<=tile_yc; ty++) {
                let bx = tx * tile_x + bounds.min.x;
                let by = ty * tile + bounds.min.y;
                if ((tx + ty) % 2) {
                    target.emit(bx, by);
                    target.emit(bx + tile_x - offset - line_w, by + tile);
                } else {
                    target.emit(bx + tile_x - offset - line_w, by);
                    target.emit(bx, by + tile);
                }
            }
        }

        for (let tx=0; tx<=tile_xc; tx++) {
            let bx = tx * tile_x + bounds.min.x;
            let xp = bx + tile_x - line_w/2 - offset/2;
            target.newline();
            target.emit(xp, bounds.min.y);
            target.emit(xp, bounds.max.y);
        }
    }

    function fillBubbles(api) {
        let {min, max} = api.bounds();
        let slice = api.slice(); // slice object (for adding solids)
        let height = api.zHeight(); // layer height
        let offset = api.lineWidth() / 2; // offset size by nozzle width
        let size = 3 / api.density(); // circle diameter from density
        let rad = size / 2 - offset; // max circle radius
        let minr = offset + (2 - api.density() * 2) * offset;
        let zrep = size / height; // # layers to repeat pattern
        let zpad = zrep * 0.3; // # pad layers between pattern
        let bind = api.zIndex() % (zrep + zpad); // index into pattern
        let brad = bind < zrep ? Math.max(minr,(rad * Math.sin(((bind + 1) / zrep) * Math.PI))) : minr;
        let sind = (api.zIndex() + (zrep + zpad)/2) % (zrep + zpad); // index into pattern
        let srad = sind < zrep ? Math.max(minr,(rad * Math.sin(((sind + 1) / (zrep + 0)) * Math.PI))) : minr;
        for (let x=min.x-size; x<max.x+size; x += size) {
            let eoy = 0;
            for (let y=min.y-size; y<max.y+size; y += size) {
                let xo = (eoy++ % 2 === 0) ? (size / 2) : 0;
                // primary pattern
                self.base
                    .newPolygon()
                    .centerCircle({x:x+xo, y:y*0.85}, brad, 20, true)
                    .forEachPoint(p => {
                        api.emit(p.x, p.y);
                    }, true);
                api.newline();
                // alternate pattern
                self.base
                    .newPolygon()
                    .centerCircle({x:x+xo, y:y*0.85+(size/1.75)}, srad, 20, true)
                    .forEachPoint(p => {
                        api.emit(p.x, p.y);
                    }, true);
                api.newline();
            }
        }
    };

})();
