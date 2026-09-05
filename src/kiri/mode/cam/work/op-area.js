/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// todo: surface offset pattern
// todo: trace dogbones, merge overlap

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { newSlice } from '../../../core/slice.js';
import { newPoint } from '../../../../geo/point.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { polygons as POLY } from '../../../../geo/polygons.js';
import { base, util as base_util } from "../../../../geo/base.js";
import { tip2tipJoin } from '../../../../geo/paths.js';
import { CAM } from './init-work.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const clib = self.ClipperLib;
const ctyp = clib.ClipType;
const ptyp = clib.PolyType;
const cfil = clib.PolyFillType;
const ts_eps = 0.01;
const linearClearWallGap = 0.05;
const linearClearWallGapToolFactor = 0.05;
const surfaceSlopeMerge = true;
const surfaceSlopeMergeEps = 0.01;
const surfaceSlopeMergeFlatEps = 0.05;
const surfaceSlopeMergeColinearEps = 0.01;
const surfaceSlopeMergePointEps = 0.00001;

class OpArea extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { direction, down, expand, flats, flatOff, follow } = op;
        let { mode, outline, over, rename, smooth, tool } = op;
        let { addSlices, axisIndex, color, cutTabs, settings } = state;
        let { shadowAt, setToolDiam, tabs, widget, workarea } = state;

        let areaTool = new Tool(settings, tool);
        let smoothVal = (smooth ?? 0) / 10;
        let toolDiam = areaTool.fluteDiameter();
        let toolOver = this.toolOver = areaTool.getStepSize(over);
        let zTop = workarea.top_z;
        let zBottom = workarea.bottom_z;
        let shadowBase = state.shadow.base;
        let thruHoles = state.shadow.holes;
        let roundSharps = settings.process.camRoundCorners;

        // get these once and re-use for each area
        let vertices = mode === 'surface' ?
            widget.getGeoVertices({ unroll: true, translate: true }) :
            undefined;

        // also updates tab offsets
        setToolDiam(toolDiam);

        // selected area polygons: surfaces and edges
        let { devel, edgeangle } = settings.controller;
        let polys = [];
        let stack = [];
        let surfaces = this.surfaces = [];
        let areas = this.areas = [ stack ];
        let aminz = Infinity;

        function newArea() {
            if (stack.length) {
                stack = [];
                areas.push(stack);
            }
        }

        function newLayer(z) {
            stack.push(newSlice(z));
            return stack.peek();
        }

        // gather area selections
        if (!op.shadow)
        for (let arr of (op.areas[widget.id] ?? [])) {
            let poly = newPolygon().fromArray(arr);
            aminz = Math.min(aminz, poly.minZ());
            polys.push(poly);
            // user-selected traces are not rotated
            // those based on shadow (outline, rough) are
            if (!op.rotated && axisIndex) {
                // traces come from unrotatead widget edges
                poly.applyRotations(axisIndex);
            }
        }

        // connect open poly edge segments into closed loops (when possible)
        // surface and edge selections produce open polygons by default
        polys = POLY.nest(POLY.reconnect(polys, false));

        // Align open polylines with the winding direction relative to the slice
        // shadow.  We calculate a test point slightly offset along the
        // perpendicular right-hand normal of the first non-trivial segment of the
        // polyline (or, more accurately, the projection of that segment onto the xy
        // plane).
        //
        // If this test point lies inside the slice shadow (solid body), it means
        // the right side of the path points inside, so we reverse the polyline to
        // ensure that the right side (positive offset / "outside") always points
        // outward into the air.
        //
        // There are a few corner cases (pun intended) that require this check
        // to be slightly more complex. An open polyline that separates
        // a flat face from a taller feature lies completely within the shadow
        // at its z height, and so both the left and right normals will test as
        // "inside" the part. As a simple example, consider a model of stairs. The
        // line that separates the tread on the bottom step from the riser of
        // the next step up demonstrates this issue: the shadow at that height
        // contains the face of the bottom step and the cross-section of the top
        // step. To avoid this issue, we instead test against the shadow from a
        // small epsilon (0.01) above the z height of the segment.
        //
        // However, this workaround introduces another edge case: if the
        // selected polyline is on a local top edge (in the stair example,
        // imagine any edge around the perimeter of the top step), the shadow
        // above that layer will either be empty (if this is the tallest feature
        // in the model) or locally empty but with irrelevant other
        // cross-sections from taller features. In either of these cases, both
        // points will test as "outside" the part. If this happens, we fall back
        // to the testing with the shadow at the given z height.
        //
        // This check runs once per unconnected group of merged segments in a trace.
        // It uses the cached 2D slice shadows, which fully handles sloped and
        // Z-varying curves.
        //
        // This test is only performed for open polygons, since closed shapes are
        // handled by Clipper's offset functionality which automatically fixes
        // winding order issues.
        if (shadowAt) {
          for (let poly of polys) {
            // Only open paths of length > 1 need winding orientation alignment
            if (poly.open && poly.points.length > 1) {
              let p1 = null,
                p2 = null;

              // Find the first segment with an XY projection length greater than
              // precision_merge to avoid division-by-zero or precision issues on
              // vertical/micro segments.
              for (let i = 0; i < poly.points.length - 1; i++) {
                let pt1 = poly.points[i];
                let pt2 = poly.points[i + 1];
                let dx = pt2.x - pt1.x;
                let dy = pt2.y - pt1.y;
                let distSq = dx * dx + dy * dy;
                if (distSq > base.config.precision_merge_sq) {
                  p1 = pt1;
                  p2 = pt2;
                  break;
                }
              }

              // If a valid non-vertical segment was found, perform the containment check
              if (p1 && p2) {
                let dx = p2.x - p1.x;
                let dy = p2.y - p1.y;
                let len = Math.sqrt(dx * dx + dy * dy);

                // Perpendicular right normal in the XY plane (z-component is zeroed out)
                let nx = dy / len;
                let ny = -dx / len;

                // Midpoint of the segment
                let mid = newPoint(
                  (p1.x + p2.x) / 2,
                  (p1.y + p2.y) / 2,
                  (p1.z + p2.z) / 2
                );

                // Test points offset along the right and left normal vectors using local epsilon
                let testRight = newPoint(
                  mid.x + nx * ts_eps,
                  mid.y + ny * ts_eps,
                  mid.z
                );
                let testLeft = newPoint(
                  mid.x - nx * ts_eps,
                  mid.y - ny * ts_eps,
                  mid.z
                );

                // Retrieve the cumulative slice shadow above mid.z (+0.01) to probe
                // 2D cross-sections of feature walls and pockets rising above a floor or step.
                let shadowAbove = await shadowAt(mid.z + 0.01);
                let inRight = shadowAbove ? testRight.isInPolygon(shadowAbove) : false;
                let inLeft = shadowAbove ? testLeft.isInPolygon(shadowAbove) : false;

                let shadow = null;
                // If exactly one side is inside shadowAbove, a local feature wall/step rises above mid.z.
                // If both sides are outside (e.g. local top rim, even if taller features exist elsewhere)
                // or both sides are inside (only possible if the model has
                // overhangs), fall back to shadowAt(mid.z).
                if (inRight !== inLeft) {
                  shadow = shadowAbove;
                } else {
                  shadow = await shadowAt(mid.z);
                }

                if (shadow) {
                  // If the right side points inside the part shadow (material),
                  // reverse the path so the right side points outward into the air.
                  if (testRight.isInPolygon(shadow)) {
                    poly.reverse();
                  }
                }
              }
            }
          }
        }

        // gather surface selections
        if (!op.shadow) {
            let vert = widget.getGeoVertices({ unroll: true, translate: true }).map(v => v.round(4));
            let faces = CAM.surface_find(widget, (op.surfaces[widget.id] ?? []), (follow ?? edgeangle ?? 5) * DEG2RAD);
            let fpoly = [];
            for (let face of faces) {
                let i = face * 9;
                fpoly.push(newPolygon()
                    .add(vert[i++], vert[i++], aminz = Math.min(aminz, vert[i++]))
                    .add(vert[i++], vert[i++], aminz = Math.min(aminz, vert[i++]))
                    .add(vert[i++], vert[i++], aminz = Math.min(aminz, vert[i++]))
                );
            }
            // remove invalid edges (eg. when vertical walls are the only selection)
            fpoly = fpoly.filter(p => p.area() > 0.001);

            // add in unioned surface areas
            polys.push(...POLY.setZ(POLY.union(fpoly, 0.00001, true), aminz));
        }

        // use part shadow instead of areas or surfaces
        if (op.shadow) {
            polys.push(...shadowBase.clone(true));
        }

        // smoothing for jaggies usually caused by vertical walls
        if (smoothVal) {
            polys = polys.map(poly => POLY.offset(POLY.offset([ poly ], smoothVal), -smoothVal)).flat();
            POLY.setZ(polys, aminz);
        }

        // expand selections (flattens z variable polys)
        if (Math.abs(expand) > 0) {
            let nupolys = polys.filter(p => p.open); // set aside open
            for (let p of polys.filter(p => !p.open)) {
                let expanded = POLY.expand([ p ], expand);
                if (expanded) {
                    POLY.setZ(expanded, p.minZ());
                    nupolys.push(...expanded.flat());
                }
            }
            // polys = nupolys;
            // re-merge after expansion in case it produces overlap
            polys = POLY.union(nupolys, 0.00001, true);
        }

        // filter out invalid polys
        // filter out invalid polys; open polys (traces) can have 2 points (length > 1)
        polys = polys.filter(p => p && (p.open ? p.length > 1 : p.length > 2));

        // process each area separately
        let proc = 0;
        let pinc = 1 / polys.length;
        for (let area of polys) {
            let bounds = area.getBounds3D();
            let ts_off = toolDiam / 2 + (op.leave_xy ?? 0) + ts_eps;
            let offopt = {
                arc: 250,
                join: roundSharps ? ClipperLib.JoinType.jtRound : undefined,
                clean: true,
                simple: false,
                cleanDist: 10,
                minArea: 0.01,
            };

            if (outline) {
                // remove inner voids when processing outline only
                area.inner = undefined;
            }

            newLayer().output()
                .setLayer("area", { line: 0xff8800 }, false)
                .addPolys([ area ]);

            newArea();

            if (mode === 'clear') {
                let zMov = flatOff ?? 0;
                let zs = flats ?
                    flats.filter(z => z <= zTop && z >= zBottom).map(v => v + zMov) :
                    down ? base_util.lerp(zTop, zBottom, down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                let lzo;

                if (!zs.length) break;

                outer: for (;;)
                for (let z of zs) {
                    let slice = newLayer(z);
                    let layers = slice.output();
                    let shadow = await shadowAt(z + 0.01);
                    let tool_shadow = [
                        ...POLY.offset(shadow, [  ts_off ], { count: 1, z, ...offopt }),
                        ...POLY.offset(shadow, [ -ts_off ], { count: 1, z, ...offopt }),
                    ];
                    // for roughing/outline backward compatability
                    if (op.omitthru) {
                        shadow = omitMatching(shadow, thruHoles);
                    }
                    // progressive offset of polygons inside area clipped to the shadow
                    let outs = [];
                    let clip = [];
                    let firstOff = -(toolDiam / 2 + (op.leave_xy ?? 0));
                    // remove shadow from area
                    if (op.ignore) {
                        clip = [ area ];
                    } else {
                        POLY.subtract([ area ], shadow, clip, undefined, undefined, 0);
                    }
                    if (op.clearing === 'linear') {
                        let perimeter = outs;
                        POLY.offset(clip, [ firstOff ], {
                            count: 1, outs: perimeter, flat: true, z: z - zMov, ...offopt
                        });
                        if (!op.walls && perimeter.length) {
                            let fillArea = [],
                                fillGap = Math.max(linearClearWallGap, toolDiam * linearClearWallGapToolFactor);
                            POLY.offset(perimeter, [ -fillGap ], {
                                count: 1, outs: fillArea, flat: true, z: z - zMov, ...offopt
                            });
                            let fill = linearClear(fillArea, toolOver, toolDiam);
                            alignPerimeterToFill(perimeter, fill);
                            outs.push(...fill);
                        }
                    } else {
                        //generate offsets to use
                        let offsets = [ firstOff ];
                        //if we need a finish cut, add it
                        let finish_cut = op.finish_cut ?? 0;
                        if (finish_cut != 0) { //todo: this should check for camInnerFirst and warn if it is not true
                            offsets.push(-finish_cut);
                        }
                        //everything else uses the tool stepover
                        offsets.push(-toolOver);
                        //actually offset the walls inwards
                        POLY.offset(clip, offsets, {
                            count: op.walls ? 1 : (op.steps ?? 999), outs, flat: true, z: z - zMov, ...offopt
                        });
                    }
                    // if we see no offsets, re-check the mesh bottom Z then exit
                    if (outs.length === 0) {
                        if (bounds && lzo > bounds.min.z) {
                            // try a bottom layer matching bottom of selection
                            zs = [ bounds.min.z ];
                            bounds = undefined;
                            continue outer;
                        }
                        // terminate z descent when no further output possible
                        break outer;
                    }
                    // support legacy outline features
                    if (op.omitouter) {
                        outs = omitOuter(outs);
                    } else if (op.omitinner) {
                        outs = omitInner(outs);
                    }
                    // cut tabs when present
                    if (tabs.length) outs = cutTabs(tabs, outs);
                    // for roughing backward compatability
                    if (op.leave_z) {
                        for (let out of outs)
                            for (let p of out.points)
                                p.z += op.leave_z;
                    }
                    // add tabs to travel boundaries
                    if (tabs.length) {
                        let tab_shadows = tabs.filter(t => t.top >= z).map(t => t.poly);
                        if (tab_shadows) tool_shadow.push(...tab_shadows);
                    }
                    POLY.setWinding(outs.filter(poly => !poly.isOpen()), direction === 'climb');
                    // store travel boundary that triggers up and over moves
                    slice.tool_shadow = [ area, ...shadow, ...tool_shadow ];
                    slice.camLines = outs;
                    zroc += zinc;
                    lzo = z;
                    progress(proc + (pinc * zroc), 'clear');
                    if (devel) layers
                        .setLayer("base", { line: 0xff0000 }, false)
                        .addPolys(shadowBase)
                        .setLayer("shadow", { line: 0x00ff00 }, false)
                        .addPolys(shadow)
                        .setLayer("tool shadow", { line: 0x44ff88 }, false)
                        .addPolys(tool_shadow);
                    layers
                        .setLayer(rename ?? "clear", { line: color }, false)
                        .addPolys(outs);
                    // of the last output still cuts, we need an escape
                    if (z === zs.peek()) {
                        break outer;
                    }
                }
                proc += pinc;
                progress(proc, 'clear');
            } else
            if (mode === 'trace') {
                let { tr_over, tr_offz, tr_type  } = op;
                let zs = down ? base_util.lerp(zTop, op.thru ? zBottom : Math.max(zBottom, area.minZ()), down) : [ bounds.min.z ];
                let zroc = 0;
                let zinc = 1 / zs.length;
                if (tr_offz) zs = zs.map(z => z - tr_offz);
                for (let z of zs) {
                    let slice = newLayer(z);
                    let layers = slice.output();
                    let shadow = op.base ? state.shadow.base : await shadowAt(z);
                    let outs = [];
                    if (tr_type === 'none') {
                        // todo: move this out of the zs loop and only setZ when needed
                        area = area.clone(true);
                        outs = [ zs.length > 1 || op.thru ? area.setZ(z) : clampZ(area, zTop, zBottom) ];
                    } else {
                        // drape is legacy outline
                        let offit = op.drape ? shadow : [ area ];
                        if (op.omitthru && op.drape) {
                            offit = omitMatching(offit, thruHoles);
                        }
                        // todo: move this out of the zs loop
                        let stepping = tr_type === 'inside' ?
                            ( tr_over ? -tr_over : [ -toolDiam / 2, -toolOver ] ) :
                            ( tr_over ? tr_over : [ toolDiam / 2, toolOver ] );
                        POLY.offset(offit, stepping, {
                            count: op.steps ?? 1, outs, flat: true, z, minArea: 0, open: true
                        });
                    }
                    if (outs.length === 0 && !op.drape) {
                        // terminate z descent when no further output possible
                        break;
                    }
                    // add dogbones when specified
                    if (op.dogbones) outs.forEach(out => out.addDogbones(toolDiam / 5, op.revbones));
                    // support legacy outline features
                    if (op.omitouter) {
                        outs = omitOuter(outs);
                    } else if (op.omitinner) {
                        outs = omitInner(outs);
                    }
                    // cut tabs when present
                    if (tabs.length) outs = cutTabs(tabs, outs);
                    slice.camLines = outs;
                    POLY.setWinding(outs, direction === 'climb');
                    // store travel boundary that triggers up and over moves
                    let tool_shadow = slice.tool_shadow = shadow.clone(true);
                    if (area.isOpen()) {
                        tool_shadow.push(...outs[0].clone().setZ(z).offset_open(toolDiam / 2, 'round'));
                    } else {
                        tool_shadow.push(
                            area,
                            ...POLY.offset(shadow, [  ts_off ], { count: 1, z, ...offopt }),
                            ...POLY.offset(shadow, [ -ts_off ], { count: 1, z, ...offopt }),
                        );
                    }
                    // add tabs to travel boundaries
                    if (tabs) {
                        let tab_shadows = tabs.filter(t => t.top >= z).map(t => t.poly);
                        if (tab_shadows) slice.tool_shadow.push(...tab_shadows);
                    }
                    zroc += zinc;
                    progress(proc + (pinc * zroc), 'trace');
                    if (devel) layers
                        .setLayer("base", { line: 0xff0000 }, false)
                        .addPolys(shadowBase)
                        .setLayer("shadow", { line: 0x00ff00 }, false)
                        .addPolys(shadow)
                        .setLayer("tool shadow", { line: 0x44ff88 }, false)
                        .addPolys(tool_shadow);
                    layers
                        .setLayer(rename ?? "trace", { line: color }, false)
                        .addPolys(outs);
                }
                proc += pinc;
                progress(proc, 'trace');
                // legacy outline early termination b/c use of
                // shadow will cause duplicate output with area
                if (tr_type === 'outside' && op.drape) {
                    break;
                }
            } else
            if (mode === 'surface') {
                let { sr_type, sr_angle, sr_alter, sr_slope_min, sr_slope_max, tolerance } = op;

                let resolution = tolerance || 0.05;
                let raster = await self.get_raster_gpu({ mode: "tracing", resolution });
                let surface = [];
                let paths = [];

                // prepare paths
                if (sr_type === 'linear') {
                    // scan the area bounding box with rays at defined angle
                    let scan = scanBoxAtAngle(bounds, sr_angle * DEG2RAD, toolOver);
                    let lines = scan.map(line => {
                        let { a, b } = line;
                        return [ newPoint(a.x, a.y, 0).toClipper(), newPoint(b.x, b.y, 0).toClipper() ]
                    });
                    // use clipper to clip lines to the area polygon
                    let clip = new clib.Clipper();
                    let ctre = new clib.PolyTree();
                    clip.AddPaths(lines, ptyp.ptSubject, false);
                    clip.AddPaths(POLY.toClipper([ area ]), ptyp.ptClip, true);
                    if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
                        for (let node of ctre.m_AllPolys) {
                            paths.push(POLY.fromClipperNode(node, 0));
                        }
                    }
                    // in surfacing mode, direction is simply reversal
                    if (direction === 'climb') {
                        paths.forEach(path => path.reverse());
                    }
                    // optional alternating paths
                    if (paths.length && sr_alter) {
                        paths = tip2tipJoin(paths, paths[0].first(), toolOver * 10);
                    }
                } else
                if (sr_type === 'offset') {
                    // progressive inset from perimeter
                    POLY.offset([ area ], [ -toolDiam / 2, -toolOver ], {
                        count: 999, outs: paths, flat: true, z: 0, minArea: 0
                    });
                    paths.forEach(poly => poly.isClosed() && poly.push(poly.first()));
                    POLY.setWinding(paths.filter(p => p.isClosed()), direction === 'climb');
                }

                // convert resulting poly lines to raster float32 array groups
                paths = paths.map(poly => poly.points.map(p => [ p.x, p.y ]).flat().toFloat32());

                // prepare tool mesh points
                let toolBounds = new THREE.Box3()
                    .expandByPoint({ x: -toolDiam/2, y: -toolDiam/2, z: 0 })
                    .expandByPoint({ x: toolDiam/2, y: toolDiam/2, z: 0 });
                let toolPos = areaTool.generateProfile(resolution).profile.slice();
                for (let i=0; i<toolPos.length; i+= 3) {
                    toolBounds.expandByPoint({ x: toolPos[i], y: toolPos[i+1], z: toolPos[i+2] });
                }
                let toolData = { positions: toolPos, bounds: toolBounds };

                // prepare terrain and raster paths over terrain
                let wbounds = bounds.clone().expandByVector({ x: toolDiam/2, y: toolDiam/2, z: 0 });
                wbounds.min.z = zBottom;
                wbounds.max.z = zTop;
                await raster.loadTool({
                    sparseData: toolData
                });
                await raster.loadTerrain({
                    triangles: vertices,
                    boundsOverride: wbounds
                });
                if (paths.length === 0) {
                    // skip raster if no output generated
                    continue;
                }
                let output = await raster.generateToolpaths({
                    paths,
                    step: toolOver / 2,
                    zFloor: zBottom - 1,
                    onProgress: pct => progress(proc + (pinc * (pct/100)))
                });
                raster.terminate();

                let slopeMin = sr_slope_min ?? 0;
                let slopeMax = sr_slope_max ?? 90;
                output.paths = filterSlopePaths(output.paths, slopeMin, slopeMax, toolDiam/2);

                // convert terrain raster output back to open polylines
                // todo: add leave_z support
                for (let path of output.paths) {
                    path = newPolygon().fromArray([1, ...path]);
                    if (op.refine) path.refine(op.refine);
                    surface.push(path);
                    let slice = newLayer();
                    slice.camLines = [ path ];
                    slice.output()
                        .setLayer(rename ?? "linear", { line: color }, false)
                        .addPolys([ path ]);
                }

                // output this surface
                surfaces.push(surface);

                proc += pinc;
                progress(proc);
            }
        }
        // filter out empty slices
        this.areas = areas = areas.map(area => {
            return area.filter(slice => slice.camLines && slice.camLines.length);
        }).filter(a => a.length);

        // only render slices containing ares to mill
        addSlices(areas.flat().filter(s => s.camLines && s.camLines.length));
    }

    prepare(ops, progress) {
        let { op, state, areas, surfaces, toolOver } = this;
        let { newLayer, pocket, polyEmit, printPoint, tip2tipEmit } = ops;
        let { setContouring, setNextIsMove } = ops;
        let { process } = state.settings;

        // process surface paths
        if (surfaces.length) {
            setContouring(true, toolOver * 2);
            for (let surface of surfaces) {
                for (let poly of surface) {
                    setNextIsMove();
                    printPoint = polyEmit(poly);
                    newLayer();
                }
            }
            setContouring(false);
            // skip areas when processing surfaces
            return;
        }

        // process areas as pockets
        while (areas?.length) {
            let min = {
                dist: Infinity,
                area: undefined,
                point: undefined
            };

            for (let area of areas.filter(p => !p.used)) {
                // skip devel / debug only areas
                let topPolys = area[0].camLines;
                if (!topPolys) continue;
                // select poly with largest area
                let poly = topPolys.slice().sort((a,b) => b.area() - a.area())[0];
                if (!poly) continue;
                // compute move distance to top poly for efficient routing
                let find = poly.findClosestPointTo(printPoint);
                if (find.distance < min.dist) {
                    min.area = area;
                    min.dist = find.distance;
                    min.point = find.point
                }
            }

            // if we have a next-closest top poly, pocket that
            if (min.area) {
                min.area.used = true;
                printPoint = min.point;
                pocket({
                    cutdir: op.ov_conv,
                    depthFirst: process.camDepthFirst,
                    easeDown: op.down && process.easeDown ? op.down : 0,
                    outline: op.drape || op.mode === 'trace',
                    progress: (n,m) => progress(n/m, "area"),
                    slices: min.area.filter(slice => slice.camLines)
                });
            } else {
                break;
            }
        }
    }
}

function linearClear(polys, spacing, toolDiam) {
    if (!(polys && polys.length)) {
        return [];
    }

    let best;
    for (let angle of [ 0, 90, 45, -45, 30, -30, 60, -60 ]) {
        let points = [];
        POLY.fillArea(polys, angle, spacing, points, toolDiam);
        let lines = pointPairsToLines(points);
        if (!lines.length) {
            continue;
        }
        let score = scoreLinearClear(lines);
        if (!best || score > best.score) {
            best = { angle, lines, score };
        }
    }

    return best ? routeLinearLines(best.lines) : [];
}

function alignPerimeterToFill(perimeter, fill) {
    let start = fill?.[0]?.first();
    if (!start) {
        return;
    }

    let closest;
    for (let poly of perimeter) {
        if (poly.isOpen()) {
            continue;
        }
        let find = poly.findClosestPointTo(start);
        if (!closest || find.distance < closest.distance) {
            closest = find;
        }
    }

    if (!(closest && closest.index)) {
        return;
    }

    let poly = closest.poly;
    poly.points = [
        ...poly.points.slice(closest.index),
        ...poly.points.slice(0, closest.index)
    ];
}

function pointPairsToLines(points) {
    let lines = [];
    for (let i = 0; i < points.length; i += 2) {
        let p1 = points[i],
            p2 = points[i + 1];
        if (p1 && p2) {
            lines.push({ p1, p2, len: p1.distTo2D(p2) });
        }
    }
    return lines;
}

function scoreLinearClear(lines) {
    let cut = 0,
        travel = 0,
        last;

    for (let line of lines) {
        cut += line.len;
        if (last) {
            travel += Math.min(last.distTo2D(line.p1), last.distTo2D(line.p2));
        }
        last = line.p2;
    }

    return (cut / lines.length) - (travel / lines.length) * 0.5;
}

function routeLinearLines(lines) {
    let routed = [],
        last;

    while (lines.length) {
        let best,
            bestIndex = 0,
            bestReverse = false,
            bestDist = Infinity;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (!last) {
                best = line;
                bestIndex = i;
                break;
            }
            let d1 = last.distTo2D(line.p1),
                d2 = last.distTo2D(line.p2);
            if (d1 < bestDist) {
                best = line;
                bestIndex = i;
                bestReverse = false;
                bestDist = d1;
            }
            if (d2 < bestDist) {
                best = line;
                bestIndex = i;
                bestReverse = true;
                bestDist = d2;
            }
        }

        lines.splice(bestIndex, 1);
        let points = bestReverse ? [ best.p2, best.p1 ] : [ best.p1, best.p2 ];
        last = points[1];
        routed.push(newPolygon().setOpen().addPoints(points));
    }

    return routed;
}

function filterSlopePaths(paths, min, max, minRunLength = 0) {
    min = Math.max(0, Math.min(90, min));
    max = Math.max(0, Math.min(90, max));
    if (min > max) {
        let swap = min;
        min = max;
        max = swap;
    }
    if (!surfaceSlopeMerge && min <= 0 && max >= 90) {
        return paths;
    }

    const out = [];
    const eps = 0.00001;
    for (let path of paths) {
        let run;
        let lastAngle;
        for (let i = 3; i < path.length; i += 3) {
            let x0 = path[i - 3],
                y0 = path[i - 2],
                z0 = path[i - 1],
                x1 = path[i],
                y1 = path[i + 1],
                z1 = path[i + 2],
                dxy = Math.hypot(x1 - x0, y1 - y0),
                dz = z1 - z0,
                angle = Math.atan2(Math.abs(dz), dxy) * RAD2DEG,
                signedAngle = normalizeSlopeAngle(Math.atan2(dz, dxy) * RAD2DEG);

            if (run && Math.hypot(dxy, dz) <= surfaceSlopeMergePointEps) {
                run[run.length - 3] = x1;
                run[run.length - 2] = y1;
                run[run.length - 1] = z1;
                continue;
            }

            if (angle + eps >= min && angle - eps <= max) {
                if (!run) {
                    run = [ x0, y0, z0 ];
                } else if (surfaceSlopeMerge && canMergeSlope(run, x1, y1, signedAngle, lastAngle)) {
                    run[run.length - 3] = x1;
                    run[run.length - 2] = y1;
                    run[run.length - 1] = z1;
                    lastAngle = signedAngle;
                    continue;
                }
                run.push(x1, y1, z1);
                lastAngle = signedAngle;
            } else if (run) {
                emitSlopeRun(out, run, minRunLength);
                run = undefined;
                lastAngle = undefined;
            }
        }
        if (run) emitSlopeRun(out, run, minRunLength);
    }
    return out;
}

function emitSlopeRun(out, run, minRunLength) {
    if (run.length >= 6 && pathLength(run) >= minRunLength) {
        out.push(run);
    }
}

function pathLength(path) {
    let length = 0;
    for (let i = 3; i < path.length; i += 3) {
        length += Math.hypot(path[i] - path[i - 3], path[i + 1] - path[i - 2]);
    }
    return length;
}

function canMergeSlope(run, x1, y1, angle, lastAngle) {
    if (lastAngle === undefined || Math.abs(angle - lastAngle) > surfaceSlopeMergeEps || run.length < 6) {
        return false;
    }
    let i = run.length;
    let x0 = run[i - 6],
        y0 = run[i - 5],
        xm = run[i - 3],
        ym = run[i - 2],
        dx0 = xm - x0,
        dy0 = ym - y0,
        dx1 = x1 - xm,
        dy1 = y1 - ym,
        len = Math.hypot(dx0, dy0) * Math.hypot(dx1, dy1);

    if (len === 0) {
        return false;
    }

    let cross = Math.abs(dx0 * dy1 - dy0 * dx1) / len,
        dot = dx0 * dx1 + dy0 * dy1;
    return dot >= 0 && cross <= surfaceSlopeMergeColinearEps;
}

function normalizeSlopeAngle(angle) {
    return Math.abs(angle) <= surfaceSlopeMergeFlatEps ? 0 : angle;
}

function omitOuter(polys) {
    let inner = [];
    for (let poly of polys) {
        if (poly.inner) inner.push(...poly.inner);
    }
    return inner;
}

function omitInner(polys) {
    for (let poly of polys) {
        poly.inner = undefined;
    }
    return polys;
}

function omitMatching(target, matches) {
    target = target.clone(true);
    for (let poly of target.filter(p => p.inner)) {
        poly.inner = poly.inner.filter(inner => {
            for (let ho of matches) {
                if (inner.isEquivalent(ho)) {
                    return false;
                }
            }
            return true;
        });
    }
    return target;
}

function clampZ(poly, max, min) {
    for (let p of poly.points) {
        if (p.z < min) p.z = min;
        else if (p.z > max) p.z = max;
    }
    if (poly.inner) {
        for (let p of poly.inner) {
            clampZ(p, max, min);
        }
    }
    return poly;
}

// box2: THREE.Box2
// angle: radians (direction of each scan ray)
// step: spacing between parallel rays (world units)
function scanBoxAtAngle(box2, angle, step) {
    const cx = (box2.min.x + box2.max.x) * 0.5;
    const cy = (box2.min.y + box2.max.y) * 0.5;
    const w = box2.max.x - box2.min.x;
    const h = box2.max.y - box2.min.y;

    // ray direction
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // normal between rays (perpendicular to ray dir)
    const nx = -dy;
    const ny = dx;

    // extent of the box along the normal
    const extentN = Math.abs(nx) * w + Math.abs(ny) * h;

    // length of each ray across the box (along ray dir)
    const extentD = Math.abs(dx) * w + Math.abs(dy) * h;

    // how many rays to cover the box; +1 so edges are covered
    const count = Math.max(1, Math.ceil(extentN / step) + 1);

    const halfSpan = step * (count - 1) * 0.5;
    const halfD = extentD * 0.5;
    const rays = [];

    for (let i = 0; i < count; i++) {
        // offset along normal
        const o = -halfSpan + i * step;
        const ox = cx + nx * o;
        const oy = cy + ny * o;

        // segment endpoints for this ray inside (or slightly outside) the box
        const ax = ox - dx * halfD;
        const ay = oy - dy * halfD;
        const bx = ox + dx * halfD;
        const by = oy + dy * halfD;

        rays.push({
            a: new THREE.Vector2(ax, ay),
            b: new THREE.Vector2(bx, by),
        });
    }

    return rays;
}

export { OpArea };
