/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { util } from '../../../../geo/base.js';
import { slicer } from '../../../../geo/slicer.js';
import { newPoint } from '../../../../geo/point.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { polygons as POLY } from '../../../../geo/polygons.js';
import { newSlice, newTop } from '../../../core/slice.js';
import { layerProcessTops, layerDiff, projectFlats, projectBridges } from '../../fdm/work/slice.js';
import { PNG } from '../../../../ext/pngjs.esm.js';
import { SLA } from './init-work.js';

const tracker = util.pwait;

let fill_cache;

/**
 * DRIVER CONTRACT - runs in worker
 * @param {Object} settings
 * @param {Widget} Widget
 * @param {Function} onupdate (called with % complete and optional message)
 * @param {Function} ondone (called when complete with an array of Slice objects)
 */
export function sla_slice(settings, widget, onupdate, ondone) {
    let { minions } = self.kiri_worker,
        { process, device, controller } = settings,
        isConcurrent = controller.threaded && minions.concurrent,
        work_total,
        work_remain;

    if (SLA.legacy && !self.OffscreenCanvas) {
        return ondone("browser lacks support for OffscreenCanvas",true);
    }

    // calculate % complete and call onupdate()
    function doupdate(work, msg) {
        onupdate(0.25 + ((work_total - work_remain) / work_total) * 0.75, msg);
        work_remain -= work;
    }

    // for each slice, perform a function and call doupdate()
    function forSlices(slices, work, fn, msg) {
        slices.forEach(function(slice,index) {
            fn(slice,index);
            doupdate(work / slices.length, msg)
        });
    }

    let smallDims = { x: 200, y: 125 };
    let largeDims = { x: 400, y: 300 };

    switch (device.deviceName) {
        case 'Anycubic.Photon':
        case 'Anycubic.Photon.S':
            // defaults above
            break;
        case 'Creality.Halot.One':
        case 'Creality.Halot.Max':
        case 'Creality.Halot.Sky':
            smallDims = { x: 116, y: 116 };
            largeDims = { x: 290, y: 290 };
            break;
    }

    let sws = self.kiri_worker.current.snap.url;
    let b64 = atob(sws.substring(sws.indexOf(',') + 1));
    let bin = Uint8Array.from(b64, c => c.charCodeAt(0));
    let img = new PNG();
    img.parse(bin, (err, data) => {
        SLA.preview = img;
        SLA.previewSmall = samplePNG(img, smallDims.x, smallDims.y);
        SLA.previewLarge = samplePNG(img, largeDims.x, largeDims.y);
    });
    let height = process.slaSlice || 0.05;

    async function onSliceDone(slices) {
        // remove empty slices
        slices = widget.slices = slices.filter(slice => slice.tops.length);
        if (!process.slaOpenTop && !process.xray) {
            // re-add last empty slice for closed top
            let cap = newSlice(bounds.max.z + height);
            cap.index = slices.last().index + 1;
            slices.push(cap);
        }
        // prepend raft layers to slices array
        if (process.slaSupportEnable && process.slaSupportLayers > 0) {
            let layers = process.slaSupportLayers,
                zoff = height / 2,
                snew = [],
                polys = [],
                gap = process.slaSupportGap, // gap layers above raft
                grow = height, // union per layer expand
                off = 1 - (layers * grow); // starting union offset from part
            let outer = slices.forEach(slice => {
                // poly.clone prevents inner voids from forming
                polys.appendAll(slice.tops.map(t => t.poly.clone()));
            });
            // p.clone prevents inner voids from forming
            let union = POLY.union(polys, undefined, true).map(p => p.clone());
            let expand = POLY.expand(union, off, zoff, [], 1);
            let lastraft;
            for (let s=0; s<layers + gap; s++) {
                let slice = newSlice(zoff);
                slice.height = height;
                slice.index = snew.length;
                if (s < layers) {
                    slice.synth = true;
                    expand.forEach(u => {
                        slice.tops.push(newTop(u.clone(true).setZ(zoff)));
                    });
                    expand = POLY.expand(expand, grow, zoff, [], 1);
                    lastraft = slice;
                }
                snew.push(slice);
                zoff += height;
            }
            // compensate for midline start
            zoff -= height / 2;
            // replace slices with new appended array
            slices = widget.slices = snew.concat(slices.map(s => {
                s.tops.forEach(t => t.poly.setZ(s.z + zoff));
                s.index += snew.length;
                s.z += zoff;
                return s;
            }));
            // annotate widget for support generation
            widget.union = union;
            widget.lastraft = lastraft;
        }
        // keep logical slice indices aligned with array positions. newSlice()
        // defaults index to 0, and support routing addresses widget.slices[index].
        slices.forEach((slice, index) => {
            slice.index = index;
        });
        // re-connect slices into linked list for island/bridge projections
        for (let i=1; i<slices.length; i++) {
            slices[i-1].up = slices[i];
            slices[i].down = slices[i-1];
        }
        let solidLayers = Math.round(process.slaShell / process.slaSlice);
        // setup solid fill
        slices.forEach(function(slice) {
            slice.solids = [];
        });
        // compute total work for progress bar
        work_total = [
            5,  // shell
            10, // diff
            solidLayers ? 10 : 0, // shell project
            solidLayers ? 10 : 0, // shell fill
            !solidLayers ? 10 : 0, // solid
            process.slaFillDensity && process.slaShell ? 60 : 0, // infill
            process.slaSupportEnable && process.slaSupportDensity ? 100 : 0
        ].reduce((t,v) => { return t+v });
        work_remain = work_total;
        forSlices(slices, 5, (slice,index) => {
            if (process.slaShell) {
                layerProcessTops(slice, 2, 0, process.slaShell);
            } else {
                layerProcessTops(slice, 1, 0);
            }
        }, "shells");
        forSlices(slices, 10, (slice) => {
            if (slice.synth) return;
            layerDiff(slice, {
                sla: true,
                area: 0.000001,
                thick: 0,
                fakedown: !process.slaOpenBase
            });
        }, "delta");
        if (solidLayers) {
            forSlices(slices, 10, (slice) => {
                if (slice.synth) return;
                projectFlats(slice, solidLayers);
                projectBridges(slice, solidLayers);
            }, "project");
            async function doUnionSolid(slice) {
                if (slice.synth) return;
                let traces = POLY.nest(POLY.flatten(slice.topShells()));
                if (slice.solids) {
                    let trims = slice.solids || [];
                    traces.appendAll(trims);
                    // slice.unioned = POLY.setZ(POLY.union(traces, undefined, true), slice.z);
                    slice.unioned = POLY.setZ(await minions.union(traces), slice.z);
                } else {
                    slice.unioned = traces;
                }
            }
            let promises = slices.map(slice => doUnionSolid(slice));
            await tracker(promises, (i, t) => {
                doupdate(10 / promises.length, "solid");
            });
        } else {
            forSlices(slices, 10, (slice) => {
                if (slice.synth) return;
                slice.unioned = slice.topPolys();
            }, "solid");
        }
        if (process.slaFillDensity && process.slaShell) {
            fill_cache = [];
            forSlices(slices, 60, (slice) => {
                if (slice.synth) return;
                fillPolys(slice, settings);
            }, "infill");
        }
        if (process.slaSupportEnable && process.slaSupportDensity) {
            computeSupports(widget, process, progress => {
                doupdate(100 * progress, "support");
            });
        }
        doRender(widget);
    }

    let bounds = widget.getBoundingBox();
    let points = widget.getPoints();

    if (isConcurrent) {
        minions.setPoints(points);
    }

    slicer.slice(points, {
        indices: process.indices || process.xray,
        union: controller.healMesh,
        debug: process.xray,
        xray: process.xray,
        zMin: bounds.min.z + height / 2,
        zMax: bounds.max.z,
        zInc: height,
        // slicer function (worker local or minion distributed)
        slicer(z, points, opts) {
            return (isConcurrent ? minions.sliceZ : slicer.sliceZ)(z, points, opts);
        },
        onupdate(v) {
            return onupdate(0.0 + v * 0.25);
        }
    }).then(output => {
        let slices = widget.slices = output.slices.map(data => {
            let { z, lines, groups } = data;
            let tops = POLY.nest(groups);
            return newSlice(z).addTops(tops);
        });
        onSliceDone(slices).then(ondone);
        minions.setPoints([]);
    });
};

const SLA_RENDER_THICK = true;

function doRender(widget) {
    widget.slices.forEach(slice => {
        const render = slice.output(),
            height = slice.height || 0.05,
            lopacity = SLA_RENDER_THICK ? 1 : 0.6,
            line = 0x010101;

        if (slice.unioned) {
            slice.unioned.forEach(poly => {
                poly = poly.clone(true);//.move(widget.track.pos);
                renderSlicePoly(render, "layers", poly, {
                    line,
                    face: 0x0099cc,
                    lopacity,
                    height
                });
            });
        } else if (slice.tops) {
            slice.tops.forEach(top => {
                let poly = top.poly;//.clone(true).move(widget.track.pos);
                renderSlicePoly(render, "layers", poly, {
                    line,
                    face: 0xfcba03,
                    lopacity,
                    height
                });
            });
        }

        if (slice.supports) {
            slice.supports.forEach(poly => {
                renderSlicePoly(render, "support", poly, {
                    line,
                    face: 0xfcba03,
                    lopacity,
                    height
                });
            });
        }
    });
}

function renderSlicePoly(render, layer, poly, options) {
    let { line, face, lopacity, height } = options;

    render.setLayer(layer, {
        line,
        face,
        lopacity,
        opacity: SLA_RENDER_THICK ? 1 : undefined
    });

    if (SLA_RENDER_THICK) {
        render.addZVolume([poly], { height, outline: false });
    } else {
        render.addAreas([poly], { outline: true });
    }
}

function computeSupports(widget, process, progress) {
    let slices = widget.slices,
        baseIndex = widget.lastraft ? widget.lastraft.index : 0,
        spacing = supportSpacing(process),
        points = Math.bound(process.slaSupportPoints || 8, 5, 16),
        tipRadius = Math.bound(process.slaSupportSize * 0.08, 0.025, 0.08),
        branchRadius = Math.bound(process.slaSupportSize * 0.24, tipRadius, 0.32),
        trunkRadius = Math.bound(process.slaSupportSize * 0.55, branchRadius, 1.20),
        segmentLayers = Math.max(6, Math.round(4 / process.slaSlice)),
        contacts = collectSupportContacts(slices, process, spacing, tipRadius),
        levels = new Map(),
        segments = [];

    slices.forEach(slice => {
        delete slice.supports;
        delete slice.pillars;
    });

    contacts.sort((a, b) => {
        if (b.slice.index !== a.slice.index) return b.slice.index - a.slice.index;
        return b.area - a.area;
    });

    if (contacts.length === 0) {
        progress(1);
        return;
    }

    clusterSupportContacts(contacts, spacing);

    contacts.forEach(contact => {
        routeSupportTree({
            slices,
            baseIndex,
            levels,
            contact,
            process,
            points,
            tipRadius,
            branchRadius,
            trunkRadius,
            segmentLayers,
            spacing,
            segments
        });
        progress(0.65 / contacts.length);
    });

    emitSupportSegments({
        slices,
        baseIndex,
        points,
        segments,
        tipRadius,
        branchRadius,
        trunkRadius,
        progress
    });

    unionSupportLayers(slices, progress);
}

function clusterSupportContacts(contacts, spacing) {
    let clusters = [],
        radius = supportClusterRadius(spacing),
        radius2 = radius * radius;

    contacts.slice().sort((a, b) => b.area - a.area).forEach(contact => {
        let best, bestDist = Infinity;

        for (let cluster of clusters) {
            let dx = contact.point.x - cluster.point.x,
                dy = contact.point.y - cluster.point.y,
                dist2 = dx * dx + dy * dy;
            if (dist2 <= radius2 && dist2 < bestDist) {
                best = cluster;
                bestDist = dist2;
            }
        }

        if (!best) {
            best = {
                point: newPoint(contact.point.x, contact.point.y, contact.point.z),
                contacts: [],
                weight: 0
            };
            clusters.push(best);
        }

        best.contacts.push(contact);
        best.weight += Math.max(contact.area, 1);
        best.point.x = lerp(best.point.x, contact.point.x, Math.max(contact.area, 1) / best.weight);
        best.point.y = lerp(best.point.y, contact.point.y, Math.max(contact.area, 1) / best.weight);
    });

    clusters.forEach(cluster => {
        splitClusterRoots(cluster, spacing);
        cluster.contacts.forEach(contact => {
            contact.cluster = cluster;
        });
    });
}

function splitClusterRoots(cluster, spacing) {
    let contacts = cluster.contacts,
        maxLoad = maxTrunkLoad(spacing),
        count = Math.min(8, Math.ceil(contacts.length / maxLoad));

    if (count <= 1) {
        let root = {
            point: newPoint(cluster.point.x, cluster.point.y, cluster.point.z),
            center: cluster.point,
            contacts,
            nodes: new Map()
        };
        cluster.roots = [ root ];
        contacts.forEach(contact => {
            contact.root = root;
            contact.trunk = root.point;
        });
        return;
    }

    let seeds = [ contacts[0] ];
    while (seeds.length < count) {
        let best, bestDist = -1;
        contacts.forEach(contact => {
            let dist = Math.min(...seeds.map(seed => contact.point.distTo2D(seed.point)));
            if (dist > bestDist) {
                best = contact;
                bestDist = dist;
            }
        });
        seeds.push(best);
    }

    cluster.roots = seeds.map(seed => ({
        point: newPoint(seed.point.x, seed.point.y, seed.point.z),
        center: newPoint(seed.point.x, seed.point.y, seed.point.z),
        contacts: [],
        nodes: new Map(),
        weight: 0
    }));

    contacts.forEach(contact => {
        let root = nearestRoot(cluster.roots, contact.point),
            weight = Math.max(contact.area, 1);
        root.contacts.push(contact);
        root.weight += weight;
        root.center.x = lerp(root.center.x, contact.point.x, weight / root.weight);
        root.center.y = lerp(root.center.y, contact.point.y, weight / root.weight);
        contact.root = root;
    });

    cluster.roots.forEach(root => {
        root.point = newPoint(root.center.x, root.center.y, root.center.z);
        root.contacts.forEach(contact => {
            contact.trunk = root.point;
        });
    });
}

function nearestRoot(roots, point) {
    let best = roots[0],
        bestDist = Infinity;

    roots.forEach(root => {
        let dist = point.distTo2D(root.point);
        if (dist < bestDist) {
            best = root;
            bestDist = dist;
        }
    });

    return best;
}

function collectSupportContacts(slices, process, spacing, tipRadius) {
    let contacts = [],
        minArea = Math.max(0.01, tipRadius * tipRadius),
        minDist = Math.max(tipRadius * 2.25, spacing * 0.35);

    slices.forEach(slice => {
        if (slice.synth || !slice.bridges?.length) return;

        let points = [],
            bridges = unsupportedBridgePolys(slice, process, minArea);

        bridges.forEach(poly => {
            if (poly.areaDeep() < minArea) return;
            sampleBridgePolygon(poly, slice.z, spacing, points);
        });

        points = dedupePoints(points, minDist);
        points.forEach(point => {
            contacts.push({
                slice,
                point,
                area: point.supportArea || 0
            });
        });
    });

    return contacts;
}

function unsupportedBridgePolys(slice, process, minArea) {
    if (!slice.down?.tops?.length) return slice.bridges;

    let selfSupport = supportSelfDistance(process),
        lower = POLY.expand(slice.down.topPolys().clone(true), selfSupport, slice.z, [], 1, undefined, undefined, minArea);

    if (!lower.length) return slice.bridges;

    let unsupported = [];
    POLY.subtract(slice.bridges, lower, unsupported, null, slice.z, minArea, { wasm: true });
    return unsupported;
}

function supportSelfDistance(process) {
    return Math.max(
        process.slaSlice * 1.25,
        process.slaSupportSize * 0.08
    );
}

function sampleBridgePolygon(poly, z, spacing, points) {
    let flats = poly.clone(true).flattenTo([]),
        emitted = 0;

    flats.forEach(flat => {
        let area = flat.areaDeep(),
            center = flat.center();

        if (center && center.isInPolygon(flat)) {
            center.z = z;
            center.supportArea = area;
            points.push(center);
            emitted++;
        }

        flat.forEachSegment((p1, p2) => {
            let dist = p1.distTo2D(p2);
            if (dist <= 0) return;

            let count = Math.max(1, Math.ceil(dist / spacing));
            for (let i=0; i<count; i++) {
                let point = p1.offsetPointTo(p2, (dist * (i + 0.5)) / count);
                point.z = z;
                point.supportArea = area;
                points.push(point);
                emitted++;
            }
        });
    });

    if (!emitted && poly.length) {
        let center = poly.center();
        center.z = z;
        center.supportArea = poly.areaDeep();
        points.push(center);
    }
}

function routeSupportTree(args) {
    let {
        slices, baseIndex, levels, contact, process,
        tipRadius, branchRadius, trunkRadius, segmentLayers, spacing, segments
    } = args;
    let route = planSupportRoute({
        slices,
        baseIndex,
        contact,
        process,
        tipRadius,
        branchRadius,
        trunkRadius,
        segmentLayers,
        spacing
    });

    if (route.length < 2) return;

    let current = route[0],
        routeNodes = [ current ];

    for (let index=1; index<route.length; index++) {
        let planned = route[index],
            depth = (contact.slice.index - planned.sliceIndex) / Math.max(contact.slice.index - baseIndex, 1),
            vertical = (current.sliceIndex - planned.sliceIndex) * process.slaSlice,
            maxMove = maxTreeMove(vertical, process),
            mergeSearch = mergeSearchRadius(spacing, planned.radius, depth, maxMove),
            merge = findMergeNode(levels, planned.sliceIndex, planned.point, mergeSearch),
            target = planned;

        if (merge && current.point.distTo2D(merge.point) <= maxMove * 1.75 &&
            !segmentCollides(slices, current, merge, routeSegmentRadius(current, merge,
                tipRadius, branchRadius, trunkRadius), contact.slice.index)) {
            target = merge;
            target.merged = true;
            target.radius = Math.max(target.radius, planned.radius);
        } else {
            addLevelNode(levels, target);
        }

        let hit = firstSegmentCollision(slices, current, target,
            routeSegmentRadius(current, target, tipRadius, branchRadius, trunkRadius), contact.slice.index);
        if (hit) {
            let terminator = contactTerminator(slices, current, target, hit, tipRadius);
            if (terminator) {
                segments.push({
                    from: current,
                    to: terminator
                });
            }
            break;
        }

        current.down = target;
        addNodeLoad(target, current.load);
        segments.push({ from: current, to: target });
        routeNodes.push(target);

        if (target.sliceIndex === baseIndex || target.grounded) {
            routeNodes.forEach(node => {
                node.grounded = true;
            });
        }

        if (target.merged) break;

        current = target;
    }
}

function planSupportRoute(args) {
    let {
        slices, baseIndex, contact, process,
        tipRadius, branchRadius, trunkRadius, segmentLayers, spacing
    } = args;

    let start = {
        sliceIndex: contact.slice.index,
        point: contact.point,
        radius: tipRadius,
        load: 1,
        tip: true,
        cost: 0
    }, currentIndex = start.sliceIndex, candidates = [ start ];

    while (currentIndex > baseIndex && candidates.length) {
        let nextIndex = nextSupportLevel(currentIndex, baseIndex, segmentLayers),
            depth = (contact.slice.index - nextIndex) / Math.max(contact.slice.index - baseIndex, 1),
            radius = lerp(branchRadius, trunkRadius, depth),
            next = new Map();

        candidates.forEach(candidate => {
            let vertical = (candidate.sliceIndex - nextIndex) * process.slaSlice,
                maxMove = maxTreeMove(vertical, process),
                root = clusterNodeForContact(contact, slices, nextIndex, depth),
                desired = root ? root.point :
                    treeTargetPoint(candidate.point, contact.trunk, depth, spacing, maxMove);

            routeCandidatePoints(candidate.point, desired, maxMove).forEach(point => {
                point.z = slices[nextIndex].z;

                let node = {
                        sliceIndex: nextIndex,
                        point,
                        radius: root ? Math.max(root.radius, radius) : radius,
                        load: 0,
                        root: root?.root,
                        prev: candidate
                    },
                    checkRadius = Math.max(radius, candidate.radius),
                    collision = firstSegmentCollision(slices, candidate, node, checkRadius, contact.slice.index),
                    supportHit = supportCollides(slices[nextIndex], point, checkRadius),
                    miss = collision ? collision.count : 0,
                    score = candidate.cost +
                        miss * 100000 +
                        (supportHit ? 50000 : 0) +
                        point.distTo2D(desired) * 8 +
                        candidate.point.distTo2D(point);

                node.cost = score;
                keepBestRouteCandidate(next, node, spacing);
            });
        });

        candidates = Array.from(next.values())
            .sort((a, b) => a.cost - b.cost)
            .slice(0, 12);
        currentIndex = nextIndex;
    }

    let end = candidates.sort((a, b) => a.cost - b.cost)[0];
    if (!end) return [ start ];

    let route = [];
    while (end) {
        route.unshift(end);
        end = end.prev;
    }
    route[0] = start;
    return route;
}

function emitSupportSegments(args) {
    let { slices, baseIndex, points, segments, tipRadius, branchRadius, trunkRadius, progress } = args,
        total = Math.max(segments.length, 1);

    if (segments.length === 0) {
        progress(0.25);
        return;
    }

    segments.forEach(segment => {
        emitSupportSegment({
            slices,
            points,
            from: segment.from,
            to: segment.to,
            baseIndex,
            tipRadius,
            branchRadius,
            trunkRadius
        });
        progress(0.25 / total);
    });
}

function emitSupportSegment(args) {
    let { slices, points, from, to, baseIndex, tipRadius, branchRadius, trunkRadius } = args;

    if (!to.terminator && to.sliceIndex === baseIndex) {
        return emitBaseFlareSegment({
            slices,
            points,
            from,
            to,
            tipRadius,
            branchRadius,
            trunkRadius
        });
    }

    emitLinearSupportSegment({
        slices,
        points,
        from,
        to,
        tipRadius,
        branchRadius,
        trunkRadius
    });
}

function emitLinearSupportSegment(args) {
    let { slices, points, from, to, tipRadius, branchRadius, trunkRadius } = args,
        span = Math.max(1, from.sliceIndex - to.sliceIndex),
        fromRadius = supportNodeRadius(from, tipRadius, branchRadius, trunkRadius),
        toRadius = to.terminator ? tipRadius : supportNodeRadius(to, tipRadius, branchRadius, trunkRadius);

    for (let index=from.sliceIndex; index>=to.sliceIndex; index--) {
        if (from.tip && index === from.sliceIndex) continue;

        let t = (from.sliceIndex - index) / span,
            slice = slices[index],
            radius = lerp(fromRadius, toRadius, t),
            point = interpolatePoint(from.point, to.point, t, slice.z);

        addSupportCircle(slice, point, radius, points);
    }
}

function emitBaseFlareSegment(args) {
    let { slices, points, from, to, tipRadius, branchRadius, trunkRadius } = args,
        span = from.sliceIndex - to.sliceIndex,
        layerHeight = supportLayerHeight(slices, to.sliceIndex),
        flareLayers = Math.min(span - 1, Math.max(4, Math.round(3 / layerHeight)));

    if (span <= 5 || flareLayers < 3) {
        return emitLinearSupportSegment(args);
    }

    let hubIndex = to.sliceIndex + flareLayers,
        hubT = (from.sliceIndex - hubIndex) / span,
        hub = {
            sliceIndex: hubIndex,
            point: interpolatePoint(from.point, to.point, hubT, slices[hubIndex].z),
            radius: supportNodeRadius(to, tipRadius, branchRadius, trunkRadius),
            load: to.load || 1
        },
        height = Math.max((slices[hubIndex].z - slices[to.sliceIndex].z), layerHeight),
        toRadius = supportNodeRadius(to, tipRadius, branchRadius, trunkRadius),
        feet = baseFlareFeet(to, height, toRadius, slices[to.sliceIndex].z);

    emitLinearSupportSegment({
        slices,
        points,
        from,
        to: hub,
        tipRadius,
        branchRadius,
        trunkRadius
    });

    feet.forEach(foot => {
        emitLinearSupportSegment({
            slices,
            points,
            from: hub,
            to: foot,
            tipRadius,
            branchRadius,
            trunkRadius
        });
        addSupportCircle(slices[foot.sliceIndex], foot.point, foot.padRadius, points);
    });
}

function baseFlareFeet(node, height, radius, z) {
    let load = Math.max(node.load || 1, 1),
        count = load > 16 ? 4 : 3,
        maxSpread = height * Math.tan(32 * Math.PI / 180),
        spread = Math.min(maxSpread, Math.max(radius * 4, 1.2 + Math.sqrt(load) * 0.25)),
        seed = Math.abs(Math.sin(node.point.x * 12.9898 + node.point.y * 78.233)) * Math.PI * 2,
        feet = [];

    for (let i=0; i<count; i++) {
        let angle = seed + (Math.PI * 2 * i / count),
            point = newPoint(
                node.point.x + Math.cos(angle) * spread,
                node.point.y + Math.sin(angle) * spread,
                z
            ),
            footRadius = Math.max(radius * 0.85, radius - 0.05);

        feet.push({
            sliceIndex: node.sliceIndex,
            point,
            radius: footRadius,
            load: 1,
            padRadius: Math.max(radius * 1.35, footRadius + 0.35)
        });
    }

    return feet;
}

function supportLayerHeight(slices, index) {
    let slice = slices[index],
        next = slices[Math.min(index + 1, slices.length - 1)];
    return Math.max(0.01, Math.abs((next?.z || slice.z) - slice.z) || 0.05);
}

function supportNodeRadius(node, tipRadius, branchRadius, trunkRadius) {
    if (node.tip) return tipRadius;

    let load = Math.max(node.load || 1, 1),
        areaRadius = branchRadius * Math.sqrt(load),
        maxRadius = maxTrunkRadius(trunkRadius),
        target = Math.min(maxRadius, Math.max(branchRadius, areaRadius));

    return Math.max(node.radius || branchRadius, target);
}

function routeSegmentRadius(from, to, tipRadius, branchRadius, trunkRadius) {
    let toLoad = (to.load || 0) + (from.load || 1),
        toCheck = Object.assign({}, to, { load: toLoad });
    return Math.max(
        supportNodeRadius(from, tipRadius, branchRadius, trunkRadius),
        to.terminator ? tipRadius : supportNodeRadius(toCheck, tipRadius, branchRadius, trunkRadius)
    );
}

function addNodeLoad(node, load) {
    while (node) {
        node.load = (node.load || 0) + load;
        node = node.down;
    }
}

function addSupportCircle(slice, point, radius, points) {
    let support = newPolygon()
        .centerCircle(point, radius, points, true)
        .setZ(slice.z);
    if (!slice.supports) slice.supports = [];
    slice.supports.push(support);
}

function findMergeNode(levels, sliceIndex, point, radius) {
    let nodes = levels.get(sliceIndex);
    if (!nodes) return;

    let best, bestDist = Infinity;
    for (let node of nodes) {
        if (!node.grounded) continue;
        let dist = point.distTo2D(node.point);
        if (dist < bestDist && dist <= radius) {
            best = node;
            bestDist = dist;
        }
    }
    return best;
}

function addLevelNode(levels, node) {
    let nodes = levels.get(node.sliceIndex);
    if (!nodes) levels.set(node.sliceIndex, nodes = []);
    nodes.push(node);
}

function clusterNodeForContact(contact, slices, sliceIndex, depth) {
    let root = contact.root;
    if (!root || depth < 0.4) return;

    let node = root.nodes.get(sliceIndex);
    if (!node) {
        node = {
            sliceIndex,
            point: newPoint(root.point.x, root.point.y, slices[sliceIndex].z),
            radius: 0,
            load: 0,
            root
        };
        root.nodes.set(sliceIndex, node);
    }
    return node;
}

function nextSupportLevel(currentIndex, baseIndex, segmentLayers) {
    let aboveBase = currentIndex - baseIndex;
    if (aboveBase <= segmentLayers) return baseIndex;
    return baseIndex + Math.floor((aboveBase - 1) / segmentLayers) * segmentLayers;
}

function supportCollides(slice, point, radius) {
    if (slice.synth || !slice.tops?.length) return false;
    let radius2 = radius * radius;
    return slice.tops.some(top => {
        let poly = top.poly;
        return point.isInPolygon(poly) || point.nearPolygon(poly, radius2, true);
    });
}

function routeCandidatePoints(from, point, maxMove) {
    let out = [],
        dirs = [
            [1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707],
            [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]
        ],
        push = point => {
            let limited = limitTreeMove(from, point, maxMove);
            if (!out.some(existing => existing.distTo2D(limited) < 0.01)) {
                out.push(limited);
            }
        };

    push(point);
    push(newPoint(from.x, from.y, point.z));

    for (let scale of [0.4, 0.7, 1]) {
        let dist = maxMove * scale;
        for (let dir of dirs) {
            push(newPoint(
                from.x + dir[0] * dist,
                from.y + dir[1] * dist,
                point.z
            ));
            push(newPoint(
                point.x + dir[0] * dist,
                point.y + dir[1] * dist,
                point.z
            ));
        }
    }

    return out;
}

function keepBestRouteCandidate(map, node, spacing) {
    let bucket = Math.max(0.5, spacing * 0.35),
        current;
    let key = [
            node.sliceIndex,
            Math.round(node.point.x / bucket),
            Math.round(node.point.y / bucket)
        ].join(':');

    current = map.get(key);

    if (!current || node.cost < current.cost) {
        map.set(key, node);
    }
}

function mergeSearchRadius(spacing, radius, depth, maxMove) {
    return Math.max(
        radius * 3,
        Math.min(spacing * (0.65 + depth), maxMove + radius * 2)
    );
}

function supportClusterRadius(spacing) {
    return Math.max(5, spacing * 1.75);
}

function maxTrunkLoad(spacing) {
    return Math.max(6, Math.round(spacing * 1.25));
}

function maxTrunkRadius(trunkRadius) {
    return Math.max(trunkRadius, Math.min(3, trunkRadius * 5));
}

function unionSupportLayers(slices, progress) {
    let supportSlices = slices.filter(slice => slice.supports?.length > 1),
        total = Math.max(supportSlices.length, 1);

    if (supportSlices.length === 0) {
        progress(0.10);
        return;
    }

    supportSlices.forEach(slice => {
        slice.supports = POLY.union(slice.supports, 0, true);
        progress(0.10 / total);
    });
}

function segmentCollides(slices, from, to, radius, contactIndex) {
    return !!firstSegmentCollision(slices, from, to, radius, contactIndex);
}

function firstSegmentCollision(slices, from, to, radius, contactIndex) {
    let span = Math.max(1, from.sliceIndex - to.sliceIndex),
        first,
        clean,
        collisions = 0;

    for (let index=from.sliceIndex; index>=to.sliceIndex; index--) {
        if (index >= contactIndex - 2) continue;
        let slice = slices[index],
            t = (from.sliceIndex - index) / span,
            point = interpolatePoint(from.point, to.point, t, slice.z);
        if (supportCollides(slice, point, radius)) {
            if (!first) first = { index, t, point, clean };
            collisions++;
        } else if (!first) {
            clean = { index, t, point };
        }
    }

    if (first) first.count = collisions;
    return first;
}

function contactTerminator(slices, from, to, hit, tipRadius) {
    if (!hit.point) return;

    return {
        sliceIndex: hit.index,
        point: hit.point,
        radius: tipRadius,
        load: 1,
        terminator: true
    };
}

function supportSpacing(process) {
    return Math.max(
        process.slaSupportSize * 2.5,
        2 + (1 - process.slaSupportDensity) * 8
    );
}

function maxTreeMove(vertical, process) {
    let angle = Math.bound(process.slaSupportAngle || 18, 5, 45),
        radians = angle * Math.PI / 180;
    return Math.max(0.05, vertical * Math.tan(radians));
}

function dedupePoints(points, minDist) {
    let out = [];
    points.sort((a, b) => (b.supportArea || 0) - (a.supportArea || 0));
    points.forEach(point => {
        if (!out.some(existing => existing.distTo2D(point) < minDist)) {
            out.push(point);
        }
    });
    return out;
}

function treeTargetPoint(point, origin, depth, spacing, maxMove) {
    let grid = spacing * (2 + depth * 3),
        target = origin || {
            x: Math.round(point.x / grid) * grid,
            y: Math.round(point.y / grid) * grid
        },
        blend = origin ? Math.min(0.85, 0.35 + depth * 0.45) : Math.min(0.5, 0.12 + depth * 0.35);

    return limitTreeMove(point, newPoint(
        lerp(point.x, target.x, blend),
        lerp(point.y, target.y, blend),
        point.z
    ), maxMove);
}

function limitTreeMove(from, to, maxMove) {
    let dist = from.distTo2D(to);
    if (dist <= maxMove) return to;
    return from.offsetPointTo(to, maxMove);
}

function interpolatePoint(from, to, t, z) {
    return newPoint(
        lerp(from.x, to.x, t),
        lerp(from.y, to.y, t),
        z
    );
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function fillPolys(slice, settings) {
    let process = settings.process,
        device = settings.device,
        polys = slice.unioned,
        bounds = settings.bounds,
        width = bounds.max.x - bounds.min.x,
        depth = bounds.max.y - bounds.min.y,
        max = Math.max(width,depth),
        seq = Math.round(process.slaFillLine / process.slaSlice),
        linew = process.slaFillLine,
        units_w = (width / linew) * process.slaFillDensity,
        units_d = (depth / linew) * process.slaFillDensity,
        step_x = width / units_w,
        step_y = depth / units_d,
        start_x = -(width / 2),
        start_y = -(depth / 2),
        end_x = width / 2,
        end_y = depth / 2,
        fill = [];

    let seq_i = Math.floor(slice.index / seq),
        seq_c = seq_i % 4,
        cached = fill_cache[seq_c];

    if (!cached && seq_c !== 1)
    for (let x=start_x; x<end_x; x += step_x) {
        fill.push(
            newPolygon().centerRectangle({
                x: x + step_x/2,
                y: 0,
                z: slice.z
            }, linew, depth)
        );
    }

    if (!cached && seq_c !== 3)
    for (let y=start_y; y<end_y; y += step_y) {
        fill.push(
            newPolygon().centerRectangle({
                x: 0,
                y: y + step_y/2,
                z: slice.z
            }, width, linew)
        );
    }

    if (!cached) {
        fill = POLY.union(fill, 0, true);
        fill_cache[seq_c] = fill;
    } else {
        fill = cached.slice().map(p => p.clone(true).setZ(slice.z));
    }

    fill = POLY.trimTo(fill, slice.tops.map(t => t.poly));
    fill = POLY.union(slice.unioned.appendAll(fill), 0, true);

    slice.unioned = fill;
}

function pixAt(png,x,y) {
    let idx = (x + png.width * y) * 4;
    let dat = png.data;
    return [
        dat[idx++],
        dat[idx++],
        dat[idx++],
        dat[idx++]
    ];
}

function averageBlock(png,x1,y1,x2,y2) {
    let val = [0, 0, 0, 0], count = 0, x, y, z, v2;
    for (x=x1; x<x2; x++) {
        for (y=y1; y<y2; y++) {
            v2 = pixAt(png,x,y);
            for (z=0; z<4; z++) {
                val[z] += v2[z];
            }
            count++;
        }
    }
    for (z=0; z<4; z++) {
        val[z] = Math.abs(val[z] / count);
    }
    return val;
};

function samplePNG(png, width, height) {
    let th = width, tw = height,
        aspect = width / height, // was fixed at 4/3 for photon
        ratio = png.width / png.height,
        buf = new Uint8Array(th * tw * 4),
        div, xoff, yoff, dx, ex, dy, ey, bidx, pixval;

    if (ratio >= aspect) {
        div = png.height / tw;
        xoff = Math.round((png.width - (th * div)) / 2);
        yoff = 0;
    } else {
        div = png.width / th;
        xoff = 0;
        yoff = Math.round((png.height - (tw * div)) / 2);
    }

    for (let y=0; y<tw; y++) {
        dy = Math.round(y * div + yoff);
        if (dy < 0 || dy > png.height) continue;
        ey = Math.round((y+1) * div + yoff);
        for (let x=0; x<th; x++) {
            dx = Math.round(x * div + xoff);
            if (dx < 0 || dx > png.width) continue;
            ex = Math.round((x+1) * div + xoff);
            bidx = (y * th + x) * 4;
            pixval = averageBlock(png,dx,dy,ex,ey);
            buf[bidx+0] = pixval[0];
            buf[bidx+1] = pixval[1];
            buf[bidx+2] = pixval[2];
            buf[bidx+3] = pixval[3];
        }
    }

    return {width, height, data:buf, png};
}
