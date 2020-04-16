/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_fill = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.fill) return;

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        ROUND = UTIL.round,
        DEG2RAD = Math.PI / 180,
        FILL = self.kiri.fill = {
            hex: fillHexFull,
            grid: fillGrid,
            gyroid: fillGyroid,
            triangle: fillTriangle,
            linear: fillLinear
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
        let vhlen = (1 - target.density()) * 4 + spacing;
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
        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let density = target.density();
        let offset = target.offset() / 2;
        let tile = 1 + (1 - density);
        let tile_xc = span_x / tile;
        let tile_yc = span_y / tile;

        if (target.zIndex() % 2 === 1) {
            for (let tx=0; tx<=tile_xc; tx++) {
                target.newline();
                target.emit(bounds.min.y, tx * tile + bounds.min.x);
                target.emit(bounds.max.y, tx * tile + bounds.min.x);
            }
        } else {
            for (let ty=0; ty<=tile_yc; ty++) {
                target.newline();
                target.emit(ty * tile + bounds.min.y, bounds.min.x);
                target.emit(ty * tile + bounds.min.y, bounds.max.x);
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


})();
