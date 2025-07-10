
import { arcToPath } from "../../../geo/paths";
import { newPolygon } from "../../../geo/polygon";
import { CAM } from "./driver-fe"


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
    } = op;

    let tool = new CAM.Tool(settings, op.tool),
      toolDiam = tool.fluteDiameter(),
      sliceOut = (this.sliceOut = []),
      startAngle = forceStartAng ? startAng : 0;

    updateToolDiams(toolDiam);

    console.log(cylinders, cylinders[widget.id]);
    let faces = cylinders[widget.id];

    if (faces.faces) faces = faces.faces;
    console.log(faces);

    let polys = [];

    //iterate over selected faces
    for (let face of faces) {
      //get poly info for the cylinder
      let { zmin, zmax, diam, center, interior, faces } =
        CAM.cylinder_poly_find(widget, face);

      console.log({ zmin, zmax, diam, center, interior });

      let radius = diam >> 1;

      let radAdd,
        zBottom = zmin - thru,
        clockwise = true,
        numSegs = faces.length / 2,
        poly = newPolygon().setOpen();

      if (offOver) {
        //apply offset override
        if (offset == "auto") {
          radAdd = (interior ? -offOver : offOver) * 2;
        } else if (offset == "inside") {
          radAdd = -offOver * 2;
        } else if (offset == "outside") {
          radAdd = offOver * 2;
        }
      } else {
        //otherwise, calculate based on offset type
        if (offset == "auto") {
          radAdd = (interior ? -toolDiam : toolDiam) * 2;
        } else if (offset == "inside") {
          radAdd = -toolDiam * 2;
        } else if (offset == "outside") {
          radAdd = toolDiam * 2;
        }
      }
      console.log({ radius, radAdd });
      radius += radAdd;

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
          console.log(currentZ, bottom, [start.z, end.z]);

          let path = arcToPath(start, end, numSegs, {
            clockwise,
            radius,
            center,
          });
          console.log({ path, start, end, radius, center });
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

          //circle down to final point
          poly.addPoints(
            arcToPath(startPoint.setZ(currentZ), finalEnd, numSegs * ofFull, {
              clockwise: !clockwise,
              radius,
              center,
            })
          );

          //do a full circle at the bottom
          poly.addPoints(
            arcToPath(finalEnd, finalEnd, numSegs, {
              clockwise,
              radius,
              center,
            })
          );

          break;
        }
        currentZ = bottom;
      }

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

  async prepare(ops, progress) {}
}
