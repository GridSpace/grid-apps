/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';
import { env, clearPops } from './client.js';
import { CAM } from './driver-fe.js';
import { Layers } from '../../core/layers.js';
import { Stack } from '../../core/stack.js';

export let traceOn = false;
export let lastTrace;

export function setLastTrace(trace) {
    lastTrace = trace;
}

export function traceAdd(ev) {
    if (traceOn) {
        return traceDone();
    }
    clearPops();
    alert = api.show.alert("analyzing parts...", 1000);
    traceOn = env.hoveredOp;
    traceOn.classList.add("editing");
    api.feature.hover = true;
    api.feature.hoverAdds = true;
    env.hover = traceHover;
    env.hoverUp = traceHoverUp;
    CAM.traces((ids) => {
        api.hide.alert(alert);
        alert = api.show.alert("[esc] cancels trace editing");
        api.widgets.for(widget => {
            if (ids.indexOf(widget.id) >= 0) {
                unselectTraces(widget, true);
                widget.trace_stack = null;
            }
            if (widget.trace_stack) {
                widget.adds.appendAll(widget.trace_stack.meshes);
                widget.trace_stack.show();
                return;
            }
            let areas = (env.poppedRec.areas[widget.id] || []);
            let stack = new Stack(widget.mesh);
            widget.trace_stack = stack;
            widget.traces?.forEach(poly => {
                let match = areas.filter(arr => poly.matches(arr));
                let layers = new Layers();
                layers.setLayer("trace", { line: 0xaaaa55, fat: 4, order: -10 }, false).addPoly(poly);
                stack.addLayers(layers);
                stack.new_meshes.forEach(mesh => {
                    mesh.trace = { widget, poly };
                    // ensure trace poly singleton from matches
                    if (match.length > 0) {
                        poly._trace = match[0];
                    } else {
                        poly._trace = poly.toArray();
                    }
                });
                widget.adds.appendAll(stack.new_meshes);
                // console.log(widget)
            });
        });
        // ensure appropriate traces are toggled matching current record
        api.widgets.for(widget => {
            widget.setVisualState({ opacity: 0.25 });
            let areas = (env.poppedRec.areas[widget.id] || []);
            let stack = widget.trace_stack;
            stack.meshes.forEach(mesh => {
                let { poly } = mesh.trace;
                let match = areas.filter(arr => poly.matches(arr));
                if (match.length > 0) {
                    if (!mesh.selected) {
                        traceToggle(mesh, true);
                    }
                } else if (mesh.selected) {
                    traceToggle(mesh, true);
                }
            });
        });
    }, env.poppedRec.select === 'lines');
}

export function traceDone() {
    if (!traceOn) {
        return;
    }
    env.func.unpop();
    traceOn.classList.remove("editing");
    traceOn = false;
    api.widgets.opacity(1);
    api.hide.alert(alert);
    api.feature.hover = false;
    api.feature.hoverAdds = false;
    api.widgets.for(widget => {
        widget.restoreVisualState();
        if (widget.trace_stack) {
            widget.trace_stack.hide();
            widget.adds.removeAll(widget.trace_stack.meshes);
        }
    });
}

export function traceHover(data) {
    if (lastTrace) {
        let { color, colorSave } = lastTrace.material[0] || lastTrace.material;
        color.r = colorSave.r;
        color.g = colorSave.g;
        color.b = colorSave.b;
    }
    lastTrace = null;
    if (data.type === 'platform') {
        return;
    }
    if (!data.int.object.trace) {
        return;
    }
    lastTrace = data.int.object;
    if (lastTrace.selected) {
        let event = data.event;
        let target = event.target;
        let { clientX, clientY } = event;
        let { offsetWidth, offsetHeight } = target;
    }
    let material = lastTrace.material[0] || lastTrace.material;
    let color = material.color;
    material.colorSave = color.clone();
    color.setHex(env.isDark() ? 0x0066ff : 0x0000ff);
}

export function traceHoverUp(int, ev) {
    if (!int) return;
    let { object } = int;
    traceToggle(object);
    if (ev.metaKey || ev.ctrlKey) {
        let { selected } = object;
        let { widget, poly } = object.trace;
        let avgZ = poly.avgZ();
        for (let add of widget.adds) {
            if (add.trace && add.selected !== selected && add.trace.poly.onZ(avgZ)) {
                traceToggle(add);
            }
        }
    }
}

export function traceToggle(obj, skip) {
    let material = obj.material[0] || obj.material;
    if (!material) return;
    let { color, colorSave } = material;
    let { widget, poly } = obj.trace;
    let areas = env.poppedRec.areas;
    if (!areas) {
        return;
    }
    let wlist = areas[widget.id] = areas[widget.id] || [];
    obj.selected = !obj.selected;
    if (!colorSave) {
        colorSave = material.colorSave = color.clone();
    }
    if (obj.selected) {
        color.setHex(env.isDark() ? 0xdd0011 : 0xff0033);
        colorSave.r = color.r;
        colorSave.g = color.g;
        colorSave.b = color.b;
        if (!skip) wlist.push(poly._trace);
    } else {
        color.setHex(0xaaaa55);
        colorSave.setHex(0xaaaa55);
        if (!skip) wlist.remove(poly._trace);
    }
    api.conf.save();
}

export function unselectTraces(widget, skip) {
    if (widget.trace_stack) {
        widget.trace_stack.meshes.forEach(mesh => {
            if (mesh.selected) {
                traceToggle(mesh, skip);
            }
        });
    }
}
