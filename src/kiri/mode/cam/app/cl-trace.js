/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../../app/api.js';
import { env, clearPops, isDark } from './init-ui.js';
import { parse } from '../../../../load/svg.js';
import { CAM } from './dispatch.js';
import { Layers } from '../../../app/layers.js';
import { Stack } from '../../../app/stack.js';
import { newPolygon } from '../../../../geo/polygon.js';

export let traceOn = false;
export let lastTrace;

export function setLastTrace(trace) {
    lastTrace = trace;
}

export function traceLoad(ev) {
    let widget = api.widgets.all()[0];
    if (!widget) return;
    window.showOpenFilePicker({
        types: [{
            description: 'SVG Files',
            accept: { 'text/svg': ['.svg'] }
        }],
        multiple: false
    }).then(async fileHandle => {
        const file = await fileHandle[0].getFile()
        const text = await file.text();          // string
        // const buf = await file.arrayBuffer(); // binary
        // const blob = await file.slice();
        const polys = parse(text, { flat: true, soup: true });
        const rec = env.poppedRec;
        rec.areas[widget.id] = polys.map(p => p.toArray());
        rec.svg = true;
        traceAdd();
    }).catch(error => {
        console.log('no file load', error);
    });
}

export function traceClear(ev) {
    return;
    api.widgets.for(widget => {
        unselectTraces(widget, true);
        widget.traces = [];
        widget.adds = [];
    });
    env.poppedRec.areas = [];
    env.poppedRec.svg = false;
    traceDone();
}

function startTraceAdd(ids) {
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
    if (env.poppedRec.svg === true) {
        let widgets = api.widgets.all();
        for (let [ id, areas ] of Object.entries(env.poppedRec.areas)) {
            let widget = widgets.filter(w => w.id === id)[0];
            widget.traces = areas.map(arr => newPolygon().fromArray(arr));
        }
        startTraceAdd(Object.keys(env.poppedRec.areas));
    } else {
        CAM.traces(startTraceAdd, env.poppedRec.select === 'lines');
    }
}

export function traceDone() {
    if (!traceOn) {
        return;
    }
    env.func.unpop();
    traceOn.classList.remove("editing");
    traceOn = false;
    api.widgets.setOpacity(1);
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
    color.setHex(isDark() ? 0x0066ff : 0x0000ff);
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
    if (!(material && obj.trace)) return;
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
        color.setHex(isDark() ? 0xdd0011 : 0xff0033);
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
