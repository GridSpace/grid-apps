/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const BASE = self.base;
    const CONF = BASE.config;

    BASE.verticesToPoints = verticesToPoints;
    BASE.pointsToVertices = pointsToVertices;

    /**
     * converts a geometry point array into a kiri point array
     * with auto-decimation
     *
     * @param {Float32Array} array
     * @returns {Array}
     */
    function verticesToPoints(array, options) {
        let parr = new Array(array.length / 3),
            i = 0,
            j = 0,
            t = Date.now(),
            hash = {},
            unique = 0,
            passes = 0,
            points,
            oldpoints = parr.length,
            newpoints;

        // replace point objects with their equivalents
        while (i < array.length) {
            let p = BASE.newPoint(array[i++], array[i++], array[i++]),
                k = p.key,
                m = hash[k];
            if (!m) {
                m = p;
                hash[k] = p;
                unique++;
            }
            parr[j++] = m;
        }

        let {threshold, precision, maxpass} = options || {};
        // threshold = point count for triggering decimation
        // precision = under which points are merged
        // maxpass = max number of decimations
        threshold = threshold > 0 ? threshold : CONF.decimate_threshold;
        precision = precision >= 0 ? precision : CONF.precision_decimate;
        maxpass = maxpass >= 0 ? maxpass : 10;

        // decimate until all point spacing > precision
        if (maxpass && precision > 0.0)
        while (parr.length > threshold) {
            let lines = [], line, dec = 0;
            for (i=0; i<oldpoints; ) {
                let p1 = parr[i++],
                    p2 = parr[i++],
                    p3 = parr[i++];
                lines.push( {p1:p1, p2:p2, d:Math.sqrt(p1.distToSq3D(p2))} );
                lines.push( {p1:p1, p2:p3, d:Math.sqrt(p1.distToSq3D(p3))} );
                lines.push( {p1:p2, p2:p3, d:Math.sqrt(p2.distToSq3D(p3))} );
            }
            // sort by ascending line length
            lines.sort(function(a,b) {
                return a.d - b.d
            });
            // create offset mid-points
            for (i=0; i<lines.length; i++) {
                line = lines[i];
                // skip lines longer than precision threshold
                if (line.d >= precision) break;
                // skip lines where one of the points is already offset
                if (line.p1.op || line.p2.op) continue;
                // todo skip dropping lines where either point is a "sharp" on 3 vectors
                // todo skip dropping lines where either point connects to a "long" line
                line.p1.op = line.p2.op = line.p1.midPointTo3D(line.p2);
                dec++;
            }
            // exit if nothing to decimate
            if (dec === 0) break;
            passes++;
            // create new facets
            points = new Array(oldpoints);
            newpoints = 0;
            for (i=0; i<oldpoints; ) {
                let p1 = parr[i++],
                    p2 = parr[i++],
                    p3 = parr[i++];
                // drop facets with two offset points
                if (p1.op && p1.op === p2.op) continue;
                if (p1.op && p1.op === p3.op) continue;
                if (p2.op && p2.op === p3.op) continue;
                // otherwise emit altered facet
                points[newpoints++] = p1.op || p1;
                points[newpoints++] = p2.op || p2;
                points[newpoints++] = p3.op || p3;
            }
            parr = points.slice(0,newpoints);
            oldpoints = newpoints;
            if (passes >= maxpass) {
                break;
            }
        }

        // if (passes) console.trace({passes, threshold, precision, maxpass});

        if (passes) console.log({
            before: array.length / 3,
            after: parr.length,
            unique: unique,
            decimations: passes,
            time: (Date.now() - t)
        });

        return parr;
    }

    function pointsToVertices(points) {
        let vertices = new Float32Array(points.length * 3),
            i = 0, vi = 0;
        while (i < points.length) {
            vertices[vi++] = points[i].x;
            vertices[vi++] = points[i].y;
            vertices[vi++] = points[i++].z;
        }
        return vertices;
    }

})();
