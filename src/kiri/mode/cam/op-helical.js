import { arcToPath } from "../../../geo/paths.js";
import { newPolygon } from "../../../geo/polygon.js";
import { CamOp } from "./op.js";
import { Tool } from "./tool.js";
import { cylinder_poly_find } from "./slice.js";
import { newPoint } from "../../../geo/point.js";
import { newSlice } from "../../core/slice.js";

export class OpHelical extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, addSlices, widget, updateToolDiams } = state;
        let {
            cylinders,
            forceStartAng,
            startAng,
            fromTop,
            offOver,
            offset,
            down,
            thru,
            finish,
            clockwise,
            reverse,
            entry,
            entryOffset,
        } = op;
        let { color } = state;
        let { stock } = settings

        let tool = new Tool(settings, op.tool),
            toolDiam = tool.fluteDiameter(),
            sliceOut = (this.sliceOut = []),
            startAngle = forceStartAng ? startAng : 0;

        updateToolDiams(toolDiam);
        // console.log({cylinders});
        let faces = cylinders[widget.id] ?? [];
        if (faces.faces) faces = faces.faces;
        let polys = [];

        //iterate over selected faces
        for (let [i, face] of faces.entries()) {
            //get poly info for the cylinder
            let res
            try {
                res = cylinder_poly_find(
                    widget,
                    face
                );
            } catch (error) {
                // don't quit if a cylinder errors out, just skip
                console.error(error)
                continue
            }
            let { zmin, zmax, diam, center, interior, faces } = res;
            // console.log({ zmin, zmax, diam, center, interior });
            let radius = diam / 2;
            zmax = fromTop ? stock.z : zmax;

            let radAdd,
                zBottom = zmin - thru,
                numSegs = faces.length / 2,
                poly = newPolygon().setOpen();

            if (offOver) {
                //apply offset override
                if (offset == "auto") {
                    radAdd = interior ? -offOver : offOver;
                } else if (offset == "inside") {
                    radAdd = -offOver;
                } else if (offset == "outside") {
                    radAdd = offOver;
                }
            } else {
                //otherwise, calculate based on offset type
                if (offset == "auto") {
                    radAdd = (interior ? -toolDiam : toolDiam) / 2;
                } else if (offset == "inside") {
                    radAdd = -toolDiam / 2;
                } else if (offset == "outside") {
                    radAdd = toolDiam / 2;
                }
            }
            radius += radAdd;

            if (radius <= 0) {
                //if negative radius, skip this cylinder
                console.log('negative radius', radius);
                continue
            }

            let startPoint = center
                .clone()
                .setZ(zmax)
                .add(
                    newPoint(
                        Math.cos(startAngle) * radius,
                        Math.sin(startAngle) * radius,
                        0
                    )
                );

            let currentZ = zmax;
            for (; ;) {
                let bottom = currentZ - down;
                if (bottom > zBottom) {
                    //if not at the bottom, do a whole helix
                    let start = startPoint.setZ(currentZ),
                        end = startPoint.clone().setZ(bottom);
                    // console.log(currentZ, bottom, [start.z, end.z]);
                    let path = arcToPath(start, end, numSegs, {
                        clockwise,
                        radius,
                        center,
                    });
                    // console.log({ path, start, end, radius, center });
                    poly.addPoints(path);
                } else {
                    //if at the bottom, do a partial helix
                    let toBottom = currentZ - zBottom,
                        ofFull = toBottom / down,
                        ofCircle = ofFull * (2 * Math.PI),
                        cwMultiplier = clockwise ? -1 : 1,
                        finalAngle = startAngle + (ofCircle * cwMultiplier),
                        finalEnd = center
                            .clone()
                            .setZ(zBottom)
                            .add(
                                newPoint(
                                    Math.cos(finalAngle) * radius,
                                    Math.sin(finalAngle) * radius,
                                    0
                                )
                            );

                    // console.log({down,toBottom,ofFull,ofCircle,startAngle,finalAngle,finalEnd});
                    //if not already very close to final point
                    if (ofCircle >= 0.001) {
                        //circle down to final point
                        poly.addPoints(
                            arcToPath(startPoint.setZ(currentZ), finalEnd, numSegs, {
                                clockwise,
                                radius,
                                center,
                            })
                        );
                    }

                    //if starting at the bottom, reverse poly
                    if (reverse) {
                        poly.reverse();
                    }

                    if (entry) {
                        //get first z of poly to use for entry
                        let firstZ = poly.first().z;
                        //create new pointArray
                        let entry = [newPoint(0, 0, 0)];
                        //add center point
                        let entryCenter = center.clone().setZ(firstZ)

                        //if doing a curved enter, add more
                        if (entryOffset > 0) {
                            if (entryOffset > radius) {
                                console.error("entryOffset must be less than radius of helix");
                            } else {
                                //calculate entry center
                                let lineOut = radius - entryOffset;
                                let centerOffset = (entryOffset ** 2 + 2 * entryOffset * lineOut) / (2 * (entryOffset + lineOut));
                                //add entry points
                                entry.push(
                                    newPoint(0, -lineOut, 0),
                                    ...arcToPath(
                                        newPoint(0, -lineOut, 0),
                                        newPoint(radius, 0, 0),
                                        128,
                                        {
                                            clockwise: false,
                                            radius: lineOut,
                                            center: newPoint(centerOffset, 0, 0)
                                        }
                                    ),
                                    newPoint(radius, 0, 0),
                                )
                            }
                        }
                        //for each point
                        //rotate by start angle
                        // add to hole center
                        let invert = ((clockwise && !reverse) || (!clockwise && reverse)) ? -1 : 1
                        let entryAngle = reverse ? finalAngle : startAngle
                        entry = entry.map(p => {
                            // TODO: there's totally a way to do this with a matrix
                            // logical XOR
                            p.y *= invert
                            p.rotate(entryAngle)
                            return p.add(entryCenter)
                        })
                        //append to start of poly
                        poly = newPolygon().setOpen().addPoints(entry).addPoints(poly.points);
                    }
                    //if doing a finish pass, do a full circle at the bottom
                    if (finish && !reverse) {
                        poly.addPoints(
                            arcToPath(finalEnd, finalEnd, numSegs, {
                                clockwise,
                                radius,
                                center,
                            }),
                        );
                        poly.append(
                            finalEnd.clone().setZ(zBottom),
                        )
                    }
                    break;
                }
                currentZ = bottom;
            }

            progress(i / faces.length, "Helical intrerpolation");
            polys.push(poly);
        }

        let slice = newSlice(0);
        slice.camTrace = { tool: op.tool, rate: op.feed, plunge: op.rate };
        slice.camLines = polys;

        slice
            .output()
            .setLayer("Helical", { face: color, line: color })
            .addPolys(slice.camLines);

        addSlices(slice);
        sliceOut.push(slice);
    }

    async prepare(ops, progress) {
        let { polyEmit, printPoint, setTool } = ops;
        let { tool, spindle, rate, feed } = this.op;

        setTool(tool, feed, rate);

        let [ polys ] = this.sliceOut.map((s) => s.camLines);
        polys = polys.slice();

        for (;;) {
            let closestDist = Infinity,
                closestI,
                closest = null,
                dist,
                poly;

            for (let i = 0; i < polys.length; i++) {
                if (!polys[i]) continue;
                if ((dist = polys[i].first().distTo2D(printPoint)) < closestDist) {
                    closestDist = dist;
                    closest = polys[i];
                    closestI = i;
                }
            }

            if (!closest) break;
            poly = polys[closestI]
            polys[closestI] = null;
            printPoint = polyEmit(poly);
        }
    }
}
