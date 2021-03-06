/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        CAM = KIRI.driver.CAM,
        OPS = CAM.OPS,
        PRO = CAM.process,
        POLY = BASE.polygons,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon;

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} widget
     * @param {Function} output
     */
    CAM.slice = function(settings, widget, onupdate, ondone) {
        let mesh = widget.mesh,
            proc = settings.process,
            stock = settings.stock || {},
            hasStock = stock.x && stock.y && stock.z && proc.camStockOn,
            camOps = widget.camops = [],
            sliceAll = widget.slices = [],
            bounds = widget.getBoundingBox(),
            zBottom = proc.camZBottom,
            zMin = Math.max(bounds.min.z, zBottom),
            zMax = bounds.max.z,
            zThru = zBottom === 0 ? (proc.camZThru || 0) : 0,
            wztop = widget.track.top,
            ztOff = hasStock ? stock.z - wztop : 0,
            minToolDiam = Infinity,
            maxToolDiam = -Infinity,
            thruHoles,
            tabs = settings.widget[widget.id].tab,
            unsafe = proc.camExpertFast,
            units = settings.controller.units === 'in' ? 25.4 : 1;

        if (tabs) {
            // make tab polygons
            tabs.forEach(tab => {
                let zero = newPoint(0,0,0);
                let point = newPoint(tab.pos.x, tab.pos.y, tab.pos.z);
                let poly = newPolygon().centerRectangle(zero, tab.dim.x, tab.dim.y);
                let tslice = newSlice(0);
                let m4 = new THREE.Matrix4().makeRotationFromQuaternion(
                    new THREE.Quaternion(tab.rot._x, tab.rot._y, tab.rot._z, tab.rot._w)
                );
                poly.points = poly.points
                    .map(p => new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(m4))
                    .map(v => newPoint(v.x, v.y, v.z));
                poly.move(point);
                tab.poly = poly;
                // tslice.output().setLayer("tabs", 0xff0000).addPoly(poly);
                // sliceAll.push(tslice);
            });
        }

        if (unsafe) {
            console.log("disabling overhang safeties");
        }

        if (!proc.ops || proc.ops.length === 0) {
            throw 'no processes specified';
        }

        if (stock.x && stock.y && stock.z) {
            if (stock.x + 0.00001 < bounds.max.x - bounds.min.x) {
                throw 'stock X too small for part. disable stock or use offset stock';
            }

            if (stock.y + 0.00001 < bounds.max.y - bounds.min.y) {
                throw 'stock Y too small for part. disable stock or use offset stock';
            }

            if (stock.z + 0.00001 < bounds.max.z - bounds.min.z) {
                throw 'stock Z too small for part. disable stock or use offset stock';
            }
        }

        if (zMin >= bounds.max.z) {
            throw `invalid z bottom ${(zMin/units).round(3)} >= bounds z max ${(zMax/units).round(3)}`;
        }

        let mark = Date.now();
        let slicer = new KIRI.slicer2(widget.getPoints(), {
            zlist: true,
            zline: true
        });

        function updateToolDiams(toolDiam) {
            minToolDiam = Math.min(minToolDiam, toolDiam);
            maxToolDiam = Math.max(maxToolDiam, toolDiam);
        }

        let state = {
            settings,
            widget,
            bounds,
            tabs,
            cutTabs,
            cutPolys,
            healPolys,
            slicer,
            sliceAll,
            updateToolDiams,
            zBottom,
            zThru,
            ztOff,
            zMax,
            unsafe
        };

        let opList = [
            new CAM.OPS.shadow(state, { type: "shadow" })
        ];

        if (false) {
            opList.push(new CAM.OPS.xray(state, { type: "xray" }));
        }

        let opSum = 0;
        let opTot = opList.map(op => op.weight()).reduce((a,v) => a + v);

        for (let op of proc.ops) {
            let opfn = OPS[op.type];
            if (opfn) {
                let opin = new opfn(state, op);
                opList.push(opin);
                opTot += opin.weight();
            }
        }

        // give ops access to entire sequence
        state.ops = opList;

        for (let op of opList) {
            let weight = op.weight();
            op.slice((progress, message) => {
                onupdate((opSum + (progress * weight)) / opTot, message || op.type());
            });
            camOps.push(op);
            opSum += weight;
        }

        // reindex
        sliceAll.forEach((slice, index) => slice.index = index);

        // used in printSetup()
        // used in CAM.prepare.getZClearPath()
        // add tabs to terrain tops so moves avoid them
        if (tabs) {
            state.terrain.forEach(slab => {
                tabs.forEach(tab => {
                    if (tab.pos.z + tab.dim.z/2 >= slab.z) {
                        let all = [...slab.tops, tab.poly];
                        slab.tops = POLY.union(all, 0, true);
                        // slab.slice.output()
                        //     .setLayer("debug-tabs", {line: 0x880088, thin: true })
                        //     .addPolys(POLY.setZ(slab.tops.clone(true), slab.z), { thin: true });
                    }
                });
            });
        }

        // add shadow perimeter to terrain to catch outside moves off part
        let tabpoly = tabs ? tabs.map(tab => tab.poly) : [];
        let allpoly = POLY.union([...state.shadowTop.tops, ...tabpoly], 0, true);
        let shadowOff = maxToolDiam < 0 ? allpoly :
            POLY.offset(allpoly, [minToolDiam/2,maxToolDiam/2], { count: 2, flat: true });
        state.terrain.forEach(level => level.tops.appendAll(shadowOff));

        widget.terrain = state.skipTerrain ? null : state.terrain;
        widget.minToolDiam = minToolDiam;
        widget.maxToolDiam = maxToolDiam;

        ondone();
    };

    CAM.addDogbones = function(poly, dist, reverse) {
        if (Array.isArray(poly)) {
            return poly.forEach(p => CAM.addDogbones(p, dist));
        }
        let isCW = poly.isClockwise();
        if (reverse || poly.parent) isCW = !isCW;
        let oldpts = poly.points.slice();
        let lastpt = oldpts[oldpts.length - 1];
        let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
        let newpts = [ ];
        for (let i=0; i<oldpts.length + 1; i++) {
            let nextpt = oldpts[i % oldpts.length];
            let nextsl = lastpt.slopeTo(nextpt).toUnit();
            let adiff = lastsl.angleDiff(nextsl, true);
            let bdiff = ((adiff < 0 ? (180 - adiff) : (180 + adiff)) / 2) + 180;
            if (isCW && adiff > 45) {
                let newa = BASE.newSlopeFromAngle(lastsl.angle + bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            } else if (!isCW && adiff < -45) {
                let newa = BASE.newSlopeFromAngle(lastsl.angle - bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            }
            lastsl = nextsl;
            lastpt = nextpt;
            if (i < oldpts.length) {
                newpts.push(nextpt);
            }
        }
        poly.points = newpts;
        poly.length = newpts.length;
        if (poly.inner) {
            CAM.addDogbones(poly.inner, dist, true);
        }
    };

    CAM.traces = function(settings, widget, single) {
        if (widget.traces && widget.trace_single === single) {
            // do no work if cached
            return false;
        }
        let slicer = new KIRI.slicer2(widget.getPoints(), {
            zlist: true,
            zline: true
        });
        let indices = [...new Set(Object.keys(slicer.zFlat)
            .map(kv => parseFloat(kv).round(5))
            .appendAll(Object.entries(slicer.zLine).map(ze => {
                let [ zk, zv ] = ze;
                return zv > 1 ? parseFloat(zk).round(5) : null;
            })
            .filter(v => v !== null)))]
            .sort((a,b) => b - a);

        let traces = [];
        // find and trim polys (including open) to shadow
        let oneach = (data, index, total) => {
            if (single) {
                for (let line of data.lines) {
                    if (line.p1.distTo2D(line.p2) > 1) {
                        traces.push(newPolygon().append(line.p1).append(line.p2).setOpen());
                    }
                }
            } else
            BASE.polygons.flatten(data.tops,null,true).forEach(poly => {
                poly.inner = null;
                poly.parent = null;
                let z = poly.getZ();
                for (let i=0, il=traces.length; i<il; i++) {
                    let trace = traces[i];
                    // only compare polys farther apart in Z
                    if (Math.abs(z - trace.getZ()) > 0.01) {
                        continue;
                    }
                    // do not add duplicates
                    if (traces[i].isEquivalent(poly)) {
                        return;
                    }
                }
                traces.push(poly);
            });
        };
        let opts = { each: oneach, over: false, flatoff: 0, edges: true, openok: true };
        slicer.slice(indices, opts);
        opts.over = true;
        slicer.slice(indices, opts);
        widget.traces = traces;
        widget.trace_single = single;
        return true;
    };

    function cutTabs(tabs, offset, z, inter) {
        tabs = tabs.filter(tab => z < tab.pos.z + tab.dim.z/2).map(tab => tab.off).flat();
        return cutPolys(tabs, offset, z, false);
    }

    function cutPolys(polys, offset, z, inter) {
        let noff = [];
        offset.forEach(op => noff.appendAll( op.cut(POLY.union(polys, 0, true), inter) ));
        return healPolys(noff);
    }

    function healPolys(noff) {
        if (noff.length > 1) {
            let heal = 0;
            // heal/rejoin open segments that share endpoints
            outer: for(;; heal++) {
                let ntmp = noff, tlen = ntmp.length;
                for (let i=0; i<tlen; i++) {
                    let s1 = ntmp[i];
                    if (!s1) continue;
                    for (let j=i+1; j<tlen; j++) {
                        let s2 = ntmp[j];
                        if (!s2) continue;
                        if (!(s1.open && s2.open)) continue;
                        if (s1.last().isMergable2D(s2.first())) {
                            s1.addPoints(s2.points.slice(1));
                            ntmp[j] = null;
                            continue outer;
                        }
                        if (s2.last().isMergable2D(s1.first())) {
                            s2.addPoints(s1.points.slice(1));
                            ntmp[i] = null;
                            continue outer;
                        }
                        if (s1.first().isMergable2D(s2.first())) {
                            s1.reverse();
                            s1.addPoints(s2.points.slice(1));
                            ntmp[j] = null;
                            continue outer;
                        }
                        if (s1.last().isMergable2D(s2.last())) {
                            s2.reverse();
                            s1.addPoints(s2.points.slice(1));
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
            // close poly if head meets tail
            for (let poly of noff) {
                if (poly.open && poly.first().isMergable2D(poly.last())) {
                    poly.points.pop();
                    poly.length--;
                    poly.open = false;
                }
            }
        }
        return noff;
    }

})();
