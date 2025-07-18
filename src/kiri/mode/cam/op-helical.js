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
    let { settings, addSlices, widget, updateToolDiams, slicer } = state;
    let { zBottom, zThru, thruHoles, color } = state;
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
    } = op;
    let {stock} = settings

    let tool = new Tool(settings, op.tool),
      toolDiam = tool.fluteDiameter(),
      sliceOut = (this.sliceOut = []),
      startAngle = forceStartAng ? startAng : 0;

    updateToolDiams(toolDiam);
    // console.log({cylinders})
    let faces = cylinders[widget.id] ?? [];
    if (faces.faces) faces = faces.faces;
    let polys = [];

    //iterate over selected faces
    for (let [i,face] of faces.entries()) {
      //get poly info for the cylinder
      let res
      try{
        res = cylinder_poly_find(
          widget,
          face
        );
      }catch(error){
        // don't quit if a cylinder errors out, just skip
        console.error(error)
        continue
      }
      let { zmin, zmax, diam, center, interior, faces } = res;
      // console.log({ zmin, zmax, diam, center, interior });
      let radius = diam >> 1;
      zmax = fromTop ?  stock.z: zmax;

      let radAdd,
        zBottom = zmin - thru,
        clockwise = true,
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

      if( radius <= 0 ){
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
      for (;;) {
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
            finalAngle = startAngle + ofCircle,
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

          // console.log({down,toBottom,ofFull,ofCircle,finalAngle,finalEnd});

          //circle down to final point
          poly.addPoints(
            arcToPath(startPoint.setZ(currentZ), finalEnd, numSegs , {
              clockwise: !clockwise,
              radius,
              center,
            })
          );

          //if settings dictate, do a full circle at the bottom
          if(finish){
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

      progress(i/faces.length, "Helical intrerpolation");
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
    let { op, state } = this;
    let { settings, widget, addSlices, updateToolDiams } = state;
    let {
      setTool,
      setSpindle,
      polyEmit,
      camOut,
      setPrintPoint,
      getPrintPoint,
    } = ops;
    let { tool, spindle, rate, feed } = op;
    setTool(tool, feed, rate);
    setSpindle(spindle);

    let [polys] = this.sliceOut.map((s) => s.camLines);

    let pp = getPrintPoint();

    // console.log(polys)

    polys = polys.slice();
    for (;;) {
      let closestDist = Infinity,
        closestI,
        closest = null,
        dist,
        poly;

      for (let i = 0; i < polys.length; i++) {
        if (!polys[i]) continue;
        if ((dist = polys[i].first().distTo2D(pp)) < closestDist) {
          closestDist = dist;
          closest = polys[i];
          closestI = i;
        }
      }

      if (!closest) break;
      poly = polys[closestI]
      polys[closestI] = null;
      //emit
      
      pp = polyEmit(poly,0,1,poly.points[0])
    }

    setPrintPoint(pp);
  }
}
