/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';
import { env, clearPops } from './client.js';
import { CAM } from './driver-fe.js';
import { lastTrace, setLastTrace } from './cl-trace.js';

export let holeSelOn = false;
export let lastSelHoles;

/**
 * Client side function to select holes in widgets for CAM operations.
 * If holes have already been analyzed, they are displayed immediately.
 * Otherwise, the CAM server is queried and the results are cached.
 * @param {boolean} individual - select all holes, false to only select
 *  holes of tool diameter.
 */
export async function selectHoles(individual) {
    // console.log("client individual selected",individual)
    if (holeSelOn) {
        return selectHolesDone();
    }
    clearPops();
    let alert = api.show.alert("analyzing parts...");
    holeSelOn = env.hoveredOp;
    holeSelOn.classList.add("editing");
    api.feature.hover = true;
    api.feature.hoverAdds = true;
    env.hover = selectHolesHover;
    env.hoverUp = selectHolesHoverUp;

    const widgets = api.widgets.all()
    /**
     * creates a mesh for a hole and adds it to a widget
     * @param {Object3D} widget - widget to add the hole mesh to
     * @param {Object} drill - {depth,selected} object of the hole
     * @returns {Mesh} the created mesh
     */
    function createHoleMesh(widget, drill) {
        let { depth, selected, diam } = drill
        let color = selected ? 0xFF0000 : 0x39e366
        let geo = new THREE.CylinderGeometry(diam / 2, diam / 2, depth, 20);
        const material = new THREE.MeshPhongMaterial({ color });
        let mesh = new THREE.Mesh(geo, material);
        mesh.position.copy(drill)
        mesh.position.z -= depth / 2
        mesh.rotation.x = Math.PI / 2
        drill.widgetID = widget.id
        drill.meshId = mesh.id; // add pointers to both objects
        mesh.hole = drill;
        mesh.parent = widget.mesh;
        widget.mesh.add(mesh);
        widget.adds.push(mesh); // for click detection
        return mesh
    }
    let meshesCached = widgets.every(widget => env.poppedRec.drills[widget.id] != undefined)
    if (individual && meshesCached) {
        // if any widget already has cached holes
        // console.log("already has cached holes",env.poppedRec.drills)
        api.hide.alert(alert);
        api.widgets.for(widget => {
            if (widget.adds) {
                let drills = env.poppedRec.drills[widget.id];
                let ids = drills.map(hole => hole.meshId);
                if (false && widget.adds.includes(mesh)) {
                    // mesh in the old code was a dead artifact
                    // so this code branch never actually ran
                    widget.adds.forEach(add => {
                        if (ids.includes(add.id)) {
                            add.visible = true;
                        }
                    })
                } else {
                    drills.forEach(drill => {
                        createHoleMesh(widget, drill);
                    });
                }
            }
        })
    } else {
        // if no widget has cached holes
        let alert2 = api.show.alert("");
        let found = await CAM.holes(
            individual,
            env.poppedRec,
            (progress, msg) => {
                alert2[0] = msg;
                api.show.progress(progress, msg);
                api.alerts.update();
            },
            async centers => {
                api.show.progress(0);
                if (!Array.isArray(centers)) {
                    console.log("worker returned a malformed drills response");
                    return;
                }
                if (centers.length === 0) {
                    console.log("no drill holes found");
                    return;
                }
                let shadow = centers.some(c => c.shadowed);
                api.hide.alert(alert2);
                if (shadow) {
                    alert2 = api.show.alert("Some holes are shadowed by part and are not shown.");
                }
                centers = centers ?? [];
                // list of all hole centers and if they are selected
                api.widgets.for(widget => {
                    const { holes } = centers.find(center => center.id == widget.id);
                    // console.log(holes)
                    if (!holes.length) unselectHoles(holes);
                    holes.forEach(hole => {
                        createHoleMesh(widget, hole);
                    });
                    //add hole data to record
                    env.poppedRec.drills = env.poppedRec.drills ?? {};
                    env.poppedRec.drills[widget.id] = holes;
                    //give widget access to an array of drill records that refrence it
                    //so that it can be cleared when widget is rotated or mirrored etc.
                    if (!widget.drills) { widget.drills = [] };
                    widget.drills.push(holes);
                })
            }
        );
        if (!found || found.length === 0) {
            api.hide.alert(alert);
            api.hide.alert(alert2);
            api.show.alert("no drill holes found");
            return;
        }
    }
    //hide the alert once hole meshes are calculated on the worker, and then added to the scene
    // api.hide.alert(alert);
    let escAlert = api.show.alert("[esc] cancels drill editing", 1000);
    setTimeout(() => {
        api.hide.alert(escAlert);
    }, 5000);
    api.widgets.opacity(0.8);
}

export function selectHolesHover(data) {
    //not used right now. may be useful in the future
    
}

export function selectHolesHoverUp(int, ev) {
    if (!int) return; //if not a hole mesh return
    let { object } = int;
    selectHoleToggle(object);
}

/**
 * Toggle the selection of a hole mesh and update its color
 * @param {Object3D} mesh - the hole mesh to toggle
 */
export function selectHoleToggle(mesh) {
    let { hole } = mesh
    if (!hole) return
    hole.selected = !hole.selected;
    mesh.material.color.setHex(hole.selected ? 0xFF0000 : 0x39e366);
}

/**
 * Clears the recorded holes in the widget (widget.drills array)
 * and also clears the widget.adds array.
 * @param {Object} widget - the widget with the drills array to clear
 */
export function clearHolesRec(widget) {
    if (widget.drills) {
        widget.drills.forEach(rec => {
        })
    }
    if (widget.adds) {
        widget.adds.length = 0 //clear adds array
    }
}

/**
 * Cleanup function for selectHoles.
 * Removes all adds from the scene, hides the alert, and resets the opacity of the widgets.
 * Also resets the hover features and the editing class on the holeSelOn html element.
 */
export function selectHolesDone() {
    if (!holeSelOn) {
        return;
    }
    env.func.unpop();
    holeSelOn.classList.remove("editing");
    holeSelOn = false;
    api.widgets.opacity(1);
    api.hide.alert(alert);
    api.feature.hover = false;
    api.feature.hoverAdds = false;

    api.widgets.for(widget => {
        for (let add of widget.adds) {
            add.visible = false
            widget.mesh.remove(add);
        }
    });
}

export function unselectHoles(widget) {
    if (!widget.holes) return
    widget.holes.forEach(hole => {
        hole.selected = false
    })
}
