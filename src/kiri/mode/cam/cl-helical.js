import { api } from "../../core/api.js";
import { CAM } from "./driver-fe.js";

export let helicalOn = false;
export function selectHelical() {
  if (helicalOn) {
    return func.surfaceDone();
  }
  func.clearPops();
  alert = api.show.alert("analyzing surfaces...", 1000);
  let cylinders = poppedRec.cylinders;

  CAM.surface_prep(currentIndex * RAD2DEG, () => {
    api.hide.alert(alert);
    alert = api.show.alert("[esc] cancels surface selection");
    for (let [wid, arr] of Object.entries(cylinders)) {
      let widget = api.widgets.forid(wid);
      if (widget && arr.length)
        for (let faceid of arr) {
          CAM.cylinderToggle(widget, faceid, (faceids) => {
            cylinders[widget.id] = faceids;
          });
        }
    }
  });
  helicalOn = hoveredOp;
  helicalOn.classList.add("editing");
  api.feature.on_mouse_up = (obj, ev) => {
    let { face } = obj;
    let min = Math.min(face.a, face.b, face.c);
    let faceid = min / 3;
    let widget = (lastWidget = obj.object.widget);
    CAM.cylinderToggle(widget, faceid, ({ faces, error }) => {
      if (error) {
        api.show.alert(error, 3000);
        return;
      }
      cylinders[widget.id] = faces;
    });
  };
};

export function helicalDone(){
  if (!(helicalOn && poppedRec && poppedRec.cylinders)) {
    return;
  }
  let { cylinders } = poppedRec;
  for (let wid of Object.keys(cylinders)) {
    let widget = api.widgets.forid(wid);
    if (widget) {
      CAM.cylinderClear(widget);
    } else {
      delete cylinders[wid];
    }
  }
  api.hide.alert(alert);
  api.feature.on_mouse_up = undefined;
  helicalOn.classList.remove("editing");
  helicalOn = false;
  console.log("helicalOn set to false");
};
