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
            cubic: fillCubic
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

        // gyroid.polys.forEach(poly => {
        //     for (let tx=0; tx<=tile_x; tx++) {
        //         for (let ty=0; ty<=tile_y; ty++) {
        //             target.newline();
        //             let bx = tx * tile + bounds.min.x;
        //             let by = ty * tile + bounds.min.y;
        //             poly.forEach(point => {
        //                 target.emit(bx + point.x * tile, by + point.y * tile);
        //             });
        //         }
        //     }
        // });

        let polys = [];
        for (let tx=0; tx<=tile_x; tx++) {
            for (let ty=0; ty<=tile_y; ty++) {
                for (let poly of gyroid.polys) {
                    target.newline();
                    let points = poly.map(el => {
                        return {
                            x: el.x * tile + tx * tile + bounds.min.x,
                            y: el.y * tile + ty * tile + bounds.min.y,
                            z: 0
                        }
                    });
                    polys.push(BASE.newPolygon().setOpen(true).addObj(points));
                }
            }
        }
        polys = connectOpenPolys(polys);
        for (let poly of polys.filter(p => p.perimeter() > 2)) {
            target.newline();
            for (let point of poly.points) {
                target.emit(point.x, point.y);
            }
        }
    }

    function connectOpenPolys(noff, dist = 0.1) {
        if (noff.length <= 1) {
            return noff;
        }
        let heal = 0;
        // heal/rejoin open segments that have close endpoints
        outer: for(;; heal++) {
            let ntmp = noff, tlen = ntmp.length;
            for (let i=0; i<tlen; i++) {
                let s1 = ntmp[i];
                if (!s1 || !s1.open) continue;
                for (let j=i+1; j<tlen; j++) {
                    let s2 = ntmp[j];
                    if (!s2 || !s2.open) continue;
                    if (s1.last().distTo2D(s2.first()) <= dist) {
                        s1.addPoints(s2.points);
                        ntmp[j] = null;
                        continue outer;
                    }
                    if (s1.first().distTo2D(s2.last()) <= dist) {
                        s2.addPoints(s1.points);
                        ntmp[i] = null;
                        continue outer;
                    }
                    if (s1.first().distTo2D(s2.first()) <= dist) {
                        s1.reverse();
                        s1.addPoints(s2.points);
                        ntmp[j] = null;
                        continue outer;
                    }
                    if (s1.last().distTo2D(s2.last()) <= dist) {
                        s1.addPoints(s2.points.reverse());
                        ntmp[j] = null;
                        continue outer;
                    }
                }
            }
            break;
        }
        if (heal > 0) {
            // cull nulls
            noff = noff.filter(o => o);
        }
        return noff;
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

    function fillCubic(target) {
        let bounds = target.bounds();
        let span = Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y
        );
        let steps = Math.floor((span / target.lineWidth()) * target.density());
        let step = span / steps;
        let ztype = Math.floor(target.zIndex() / target.repeat()) % 3;
        if (ztype === 1) {
            for (let tx=bounds.min.x; tx<=bounds.max.x; tx += step) {
                target.newline();
                target.emit(tx, bounds.min.y);
                target.emit(tx, bounds.max.y);
            }
        } else if (ztype === 0) {
            for (let ty=bounds.min.y; ty<=bounds.max.y; ty += step) {
                target.newline();
                target.emit(bounds.min.x, ty);
                target.emit(bounds.max.x, ty);
            }
        } else {
            step *- Math.sqrt(2);
            for (let tx=bounds.min.x; tx<=bounds.max.x; tx += step) {
                target.newline();
                target.emit(tx, bounds.min.y);
                target.emit(tx + 1000, bounds.max.y + 1000);
            }
            for (let ty=bounds.min.y; ty<=bounds.max.y; ty += step) {
                target.newline();
                target.emit(bounds.min.x, ty);
                target.emit(bounds.min.x + 1000, ty + 1000);
            }
        }
    }

    function fillLinear(target) {
        let bounds = target.bounds();
        let span = Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y
        );
        let steps = Math.floor((span / target.lineWidth()) * target.density());
        let step = span / steps;
        let ztype = Math.floor(target.zIndex() / target.repeat()) % 2;
        if (ztype === 1) {
            for (let tx=bounds.min.x; tx<=bounds.max.x; tx += step) {
                target.newline();
                target.emit(tx, bounds.min.y);
                target.emit(tx, bounds.max.y);
            }
        } else if (ztype === 0) {
            for (let ty=bounds.min.y; ty<=bounds.max.y; ty += step) {
                target.newline();
                target.emit(bounds.min.x, ty);
                target.emit(bounds.max.x, ty);
            }
        }
    }

    function fillTriangle(target) {
        let bounds = target.bounds();
        let span_x = bounds.max.x - bounds.min.x;
        let span_y = bounds.max.y - bounds.min.y;
        let offset = target.offset();
        let line_w = target.lineWidth() / 2;
        let tile = 1 + (1 - target.density()) * 5;
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
