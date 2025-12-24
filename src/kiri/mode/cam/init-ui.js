/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../../core/api.js';
import { load } from '../../../load/file.js';
import { animate as anim_2d, animate_clear as anim_2d_clear } from './anim-2d-fe.js';
import { animate2 as anim_3d, animate_clear2 as anim_3d_clear } from './anim-3d-fe.js';
import { space as SPACE } from '../../../moto/space.js';
import { Layers } from '../../core/layers.js';
import { Stack } from '../../core/stack.js';
import { updateStock } from './cl-stock.js';
import { createPopOps } from './cl-ops.js';
import { tabAdd, tabDone, tabClear, restoreTabs, rotateTabs, updateTabs, clearTabs, mirrorTabs } from './cl-tab.js';
import { traceOn, traceDone, unselectTraces } from './cl-trace.js';
import { holeSelOn, selectHolesDone, clearHolesRec } from './cl-hole.js';
import { surfaceOn, surfaceDone } from './cl-surface.js';
import { helicalOn, helicalDone } from './cl-helical.js';
import { originSelectDone } from './cl-origin.js';
import { Widget, newWidget } from '../../core/widget.js';
import { space } from '../../../moto/space.js';
import { recreateTabs } from './cl-tab.js';

const { BufferGeometryUtils } = THREE;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const hasSharedArrays = self.SharedArrayBuffer ? true : false;

const { VIEWS, STACKS } = api.const;
const { noop } = api;
const { ui: UI, uc: UC } = api;
const { widgets: WIDGETS } = api;

class Client {
    animVer = 0;
    camStock;
    showStock = true;
    current;
    currentIndex;
    flipping;
    func = {};
    hoveredOp;
    hover = noop;
    hoverUp = noop;
    isAnimate;
    isArrange;
    isPreview;
    isCamMode;
    isIndexed;
    isParsed;
    lastMode;
    popOp = {};
    poppedRec;
    zaxis = { x: 0, y: 0, z: 1 };
}

export const env = new Client();

export function isDark() {
    return api.space.is_dark()
}

export function clearPops() {
    if (env.func.unpop) env.func.unpop();
    originSelectDone();
    selectHolesDone();
    surfaceDone();
    tabDone();
    traceDone();
    selectHolesDone();
    helicalDone();
}

function animFn() {
    return [{
        animate: anim_2d,
        animate_clear: anim_2d_clear
    }, {
        animate: anim_3d,
        animate_clear: anim_3d_clear
    }][env.animVer];
}

function updateIndex() {
    let oplist = env.current.process.ops;
    if (!(env.isCamMode && oplist) || env.lastMode === VIEWS.ANIMATE) {
        return;
    }
    let index = 0;
    for (let op of oplist) {
        if (op.type === '|') {
            break;
        }
        if (op.type === 'index' && !op.disabled) {
            if (op.absolute) {
                index = op.degrees
            } else {
                index += op.degrees;
            }
        }
    }
    WIDGETS.setAxisIndex(env.isPreview || !env.isIndexed ? 0 : -index);
    env.currentIndex = env.isIndexed && !env.isPreview ? index * DEG2RAD : 0;
}

function updateAxisMode(refresh) {
    const { camStockIndexGrid, camStockIndexed } = env.current.process;
    let newIndexed = camStockIndexed;
    let changed = refresh || env.isIndexed !== newIndexed;
    env.isIndexed = newIndexed;
    if (!env.isIndexed || !env.isCamMode) {
        WIDGETS.setAxisIndex(0);
    }
    if (!env.isCamMode) {
        return;
    }
    if (env.isIndexed) {
        env.current.process.camZAnchor = "middle";
    }
    env.animVer = env.isIndexed ? 1 : 0;
    SPACE.platform.setVisible(!env.isIndexed);
    SPACE.platform.showGrid2(!env.isIndexed || camStockIndexGrid);
    const showIndexed = env.isIndexed ? '' : 'none';
    const showNonIndexed = env.isIndexed ? 'none' : '';
    $('cam-index').style.display = showIndexed;
    $('cam-lathe').style.display = showIndexed;
    $('cam-flip').style.display = showNonIndexed;
    $('cam-reg').style.display = showNonIndexed;
    if (!changed) {
        return;
    }
    WIDGETS.setIndexed(env.isIndexed ? true : false);
    api.platform.update_bounds();
    // add or remove clock op depending on indexing
    const cp = env.current.process;
    if (!cp.ops) {
        return;
    }
    const clockOp = cp.ops.filter(op => op.type === '|')[0];
    if (!clockOp) {
        opAdd(env.popOp['|'].new());
    } else {
        opRender();
    }
    updateStock();
}

const opAddLaserOn = () => {
    opAdd(env.popOp['laser on'].new());
};

const opAddLaserOff = () => {
    opAdd(env.popOp['laser off'].new());
};

const opAddGCode = () => {
    opAdd(env.popOp.gcode.new());
};

const opAddIndex = () => {
    opAdd(env.popOp.index.new());
};

const opAddLevel = () => {
    opAdd(env.popOp.level.new());
};

const opAddRough = () => {
    opAdd(env.popOp.rough.new());
};

const opAddOutline = () => {
    opAdd(env.popOp.outline.new());
};

const opAddPocket = () => {
    traceDone();
    surfaceDone();
    let rec = env.popOp.pocket.new();
    rec.surfaces = { /* widget.id: [ faces... ] */ };
    opAdd(rec);
};

const opAddHelical = () => {
    traceDone();
    surfaceDone();
    let rec = env.popOp.helical.new();
    rec.cylinders = { /* widget.id: [ faces... ] */ };
    opAdd(rec);
};

const opAddArea = () => {
    traceDone();
    surfaceDone();
    let rec = env.popOp.area.new();
    rec.areas = { /* widget.id: [ polygons... ] */ };
    rec.surfaces = { /* widget.id: [ faces... ] */ };
    opAdd(rec);
};

const opAddContour = (axis) => {
    let rec = env.popOp.contour.new();
    rec.axis = axis.toUpperCase();
    opAdd(rec);
};

const opAddLathe = (axis) => {
    let rec = env.popOp.lathe.new();
    rec.axis = axis.toUpperCase();
    opAdd(rec);
};

const opAddTrace = () => {
    let rec = env.popOp.trace.new();
    rec.areas = { /* widget.id: [ polygons... ] */ };
    opAdd(rec);
};

const opAddDrill = () => {
    let rec = env.popOp.drill.new();
    rec.drills = {};
    opAdd(rec);
};

const opAddRegister = (axis, points) => {
    let rec = env.popOp.register.new();
    rec.axis = axis.toUpperCase();
    rec.points = points;
    opAdd(rec);
};

const opAddFlip = () => {
    opAdd(env.popOp.flip.new());
};

const traceClear = () => {
    traceDone();
    api.widgets.all().forEach(widget => {
        unselectTraces(widget);
    });
    api.conf.save();
};

export const opAdd = (rec) => {
    if (!env.isCamMode) return;
    clearPops();
    let oplist = env.current.process.ops;
    if (oplist.indexOf(rec) < 0) {
        if (oplist.length && oplist[oplist.length - 1].type === '|') {
            oplist.splice(oplist.length - 1, 0, rec);
        } else {
            oplist.push(rec);
        }
        let fpos = oplist.findWith(rec => rec.type === 'flip');
        if (fpos >= 0 && oplist.length > 1) {
            let oprec = oplist.splice(fpos, 1);
            oplist.push(oprec[0]);
        }
        api.conf.save();
        opRender();
    }
};

const opDel = (rec) => {
    if (!env.isCamMode) return;
    clearPops();
    let oplist = env.current.process.ops;
    let pos = oplist.indexOf(rec);
    if (pos >= 0) {
        oplist.splice(pos, 1);
        api.conf.save();
        opRender();
    }
};

export function opRender() {
    let oplist = env.current?.process?.ops;
    if (!(env.isCamMode && oplist)) {
        return;
    }
    oplist = oplist.filter(rec => !Array.isArray(rec));
    let mark = Date.now();
    let html = [];
    let bind = {};
    let scale = api.view.unit_scale();
    let notime = false;
    oplist.forEach((rec, i) => {
        let title = '';
        let clock = rec.type === '|';
        let label = clock ? `` : (rec.mode ? rec.type + ' ' + rec.mode : rec.type);
        let clazz = notime ? ["draggable", "notime"] : ["draggable"];
        let notable = rec.note ? rec.note.split(' ').filter(v => v.charAt(0) === '#') : undefined;
        if (clock) { clazz.push('clock'); title = ` title="end of ops chain\ndrag/drop like an op\nops after this are disabled"` }
        if (notable?.length) {
            rec.rename = notable[0].slice(1);
            label += ` (${rec.rename})`;
        } else {
            delete rec.rename;
        }
        html.appendAll([
            `<div id="${mark + i}" class="${clazz.join(' ')}"${title}>`,
            `<label class="label">${label}</label>`,
            clock ? '' :
                `<label id="${mark + i}-x" class="del"><i class="fa fa-trash"></i></label>`,
            `</div>`
        ]);
        bind[mark + i] = rec;
        notime = notime || clock;
    });
    let listel = $('oplist');
    listel.innerHTML = html.join('');
    let bounds = [];
    let unpop = null;
    let index = 0;
    let indexing = true;
    // drag and drop re-ordering
    for (let [id, rec] of Object.entries(bind)) {
        let type = rec.type;
        let clock = type === '|';
        if (!clock) {
            $(`${id}-x`).onmousedown = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                surfaceDone();
                traceDone();
                tabDone();
                opDel(rec);
            };
        } else {
            indexing = false;
        }
        let el = $(id);
        if (!env.isIndexed && type === 'lathe') {
            rec.disabled = true;
        }
        if (!hasSharedArrays && (type === 'contour' || type === 'lathe')) {
            rec.disabled = true;
        }
        if (rec.disabled) {
            el.classList.add("disabled");
        }
        bounds.push(el);
        let parent = $('camops');
        let timer = null;
        let inside = true;
        let popped = false;
        let poprec = env.popOp[rec.type];
        if (type === 'index' && indexing && !rec.disabled) {
            index = rec.absolute ? rec.degrees : index + rec.degrees;
        }
        el.rec = rec;
        el.unpop = () => {
            let pos = [...parent.childNodes].indexOf(poprec.div);
            if (pos >= 0) {
                parent.removeChild(poprec.div);
            }
            popped = false;
        };
        function onEnter(ev) {
            if ((clock || surfaceOn || traceOn) && env.poppedRec != rec) {
                return;
            }
            if (popped && env.poppedRec != rec) {
                surfaceDone();
                traceDone();
            }
            if (unpop) unpop();
            env.func.unpop = unpop = el.unpop;
            inside = true;
            // pointer to current rec for trace editing
            env.poppedRec = rec;
            popped = true;
            poprec.use(rec);
            env.hoveredOp = el;
            // offset Y position of pop div by % of Y screen location of button
            parent.appendChild(poprec.div);
            poprec.addNote();
            const { innerHeight } = window;
            const brect = ev.target.getBoundingClientRect();
            const prect = parent.getBoundingClientRect();
            const Prect = poprec.div.getBoundingClientRect();
            const tdiff = prect.top - brect.top;
            const botoff = innerHeight - (brect.top + Prect.height);
            const offpx = -tdiff + (botoff < 0 ? botoff : -Prect.height/3);
            poprec.div.style.transform = `translateY(${offpx}px)`;
            poprec.div.onmouseenter = () => { inside = true };
            poprec.div.onmouseleave = onLeave;
            // option click event appears latent
            // and overides the sticky settings
            setTimeout(() => {
                UC.setSticky(false);
            }, 10);
        }
        function onLeave(ev) {
            inside = false;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (!inside && poprec.using(rec) && !UC.isSticky()) {
                    el.unpop();
                }
            }, 250);
        }
        function onDown(ev) {
            if (!ev.target.rec) {
                // only trigger on operation buttons bound to recs
                return;
            }
            let mobile = ev.touches;
            surfaceDone();
            traceDone();
            let target = ev.target, clist = target.classList;
            if (!clist.contains("draggable")) {
                return;
            }
            // toggle enable / disable
            if (!clock && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                ev.stopPropagation();
                rec.disabled = !rec.disabled;
                for (let op of ev.shiftKey ? oplist : [rec]) {
                    if (op !== rec) {
                        op.disabled = op.type !== '|' ? !rec.disabled : false;
                    }
                }
                for (let el of bounds) {
                    if (el.rec.disabled) {
                        el.classList.add("disabled");
                    } else {
                        el.classList.remove("disabled");
                    }
                }
                if (env.isIndexed) {
                    updateIndex();
                }
                return true;
            }
            // duplicate op
            if (!clock && ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                oplist = env.current.process.ops;
                oplist.push(Object.clone(rec));
                api.conf.save();
                opRender();
                return true;
            }
            clist.add("drag");
            ev.stopPropagation();
            ev.preventDefault();
            let tracker = UI.tracker;
            tracker.style.display = 'block';
            let cancel = tracker.onmouseup = (ev) => {
                oplist = env.current.process.ops;
                clist.remove("drag");
                tracker.style.display = 'none';
                if (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                }
                oplist.length = 0;
                for (let child of listel.childNodes) {
                    oplist.push(child.rec);
                }
                api.conf.save();
                opRender();
                if (mobile) {
                    el.ontouchmove = onDown;
                    el.ontouchend = undefined;
                }
            };
            function onMove(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                if (ev.buttons === 0) {
                    return cancel();
                }
                for (let el of bounds) {
                    if (el === target) continue;
                    let rect = el.getBoundingClientRect();
                    let top = rect.top;
                    let bottom = rect.bottom;// + rect.height;
                    let tar = mobile ? ev.touches[0] : ev;
                    if (tar.pageY >= top && tar.pageY <= bottom) {
                        let mid = (top + bottom) / 2;
                        try { listel.removeChild(target); } catch (e) { }
                        el.insertAdjacentElement(tar.pageY < mid ? "beforebegin" : "afterend", target);
                    }
                }
            }
            tracker.onmousemove = onMove;
            if (mobile) {
                el.ontouchmove = onMove;
                el.ontouchend = cancel;
            }
        }
        if (SPACE.info.mob) {
            let touched = false;
            el.ontouchstart = (ev) => {
                touched = true;
                if (env.poppedRec === rec && popped) {
                    onLeave(ev);
                } else {
                    onEnter(ev);
                }
            };
            el.ontouchmove = onDown;
            el.onmouseenter = (ev) => {
                if (touched) {
                    // touches block mouse events on touchscreen PCs
                    // which are often sent along with touch events
                    // but when not touched, allow the mouse to work
                    return;
                }
                el.onmousedown = onDown;
                el.onmouseleave = onLeave;
                onEnter(ev);
            };
        } else {
            el.onmousedown = onDown;
            el.onmouseenter = onEnter;
            el.onmouseleave = onLeave;
        }
    }
    if (env.lastMode !== VIEWS.ANIMATE) {
        // update widget rotations from timeline marker
        WIDGETS.setAxisIndex(env.isPreview || !env.isIndexed ? 0 : -index);
    }
    env.currentIndex = env.isIndexed && !env.isPreview ? index * DEG2RAD : 0;
    updateStock();
}

export function init() {

    api.event.on('tool.mesh.face-normal', normal => {
        // console.log({ env.poppedRec });
        env.poppedRec.degrees = (Math.atan2(normal.y, normal.z) * RAD2DEG).round(2);
        env.poppedRec.absolute = true;
        opRender();
        updateStock();
    });

    api.event.on("cam.trace.clear", traceClear);

    api.event.on("cam.parse.gerber", opts => {
        const { data, mesh } = opts;
        const { open, closed, circs, rects } = load.GBR.parse(data);
        const stack = new Stack(mesh || SPACE.world.newGroup());
        const layers = new Layers();
        for (let poly of open) {
            layers.setLayer("open", { line: 0xff8800 }, false).addPoly(poly);
            let diam = poly.tool?.shape?.diameter;
            if (diam) {
                const exp = poly.offset_open(diam, 'round');
                layers.setLayer("open-exp", { line: 0xff5555 }, false).addPolys(exp);
            }
        }
        for (let poly of closed) {
            layers.setLayer("close", { line: 0xff0000 }, false).addPoly(poly);
        }
        for (let poly of circs) {
            layers.setLayer("circs", { line: 0x008800 }, false).addPoly(poly);
        }
        for (let poly of rects) {
            layers.setLayer("rects", { line: 0x0000ff }, false).addPoly(poly);
        }
        stack.addLayers(layers);
    });

    api.event.on("widget.add", widget => {
        if (env.isCamMode && !Array.isArray(widget)) {
            updateAxisMode(true);
            widget.setIndexed(env.isIndexed ? true : false);
            api.platform.update_bounds();
        }
    });

    // wire up animate button in ui
    api.event.on("function.animate", (mode) => {
        if (env.isAnimate || !env.isCamMode) {
            return;
        }
        api.function.prepare(() => {
            if (env.isCamMode) {
                animate();
            }
        });
    });

    api.event.on("function.export", (mode) => {
        if (env.isAnimate) {
            env.isAnimate = false;
            animFn().animate_clear(api);
        }
    });

    api.event.on("mode.set", (mode) => {
        env.isIndexed = undefined;
        env.isCamMode = mode === 'CAM';
        SPACE.platform.setColor(env.isCamMode ? 0xeeeeee : 0xcccccc);
        api.uc.setVisible(UI.func.animate, env.isCamMode);
        // hide/show cam mode elements
        for (let el of [...document.getElementsByClassName('mode-cam')]) {
            api.uc.setClass(el, 'hide', !env.isCamMode);
        }
        if (!env.isCamMode) {
            clearPops();
            tabClear();
        }
        // do not persist traces across page reloads
        traceClear();
        opRender();
        updateStock();
    });

    api.event.on("view.set", (mode) => {
        env.lastMode = mode;
        env.isArrange = (mode === VIEWS.ARRANGE);
        env.isPreview = (mode === VIEWS.PREVIEW);
        env.isAnimate = (mode === VIEWS.ANIMATE);
        animFn().animate_clear(api);
        clearPops();
        if (env.isCamMode && env.isPreview) {
            WIDGETS.setAxisIndex(0);
        }
        updateStock();
        opRender();
        api.uc.setVisible($('layer-animate'), env.isAnimate && env.isCamMode);

        if (!env.isCamMode) {
            return;
        }

        // remove tab synth
        api.widgets.filter((widget) => {
            if (widget.track.synth) {
                space.world.remove(widget.mesh);
                Widget.Groups.remove(widget);
            }
            return !widget.track.synth
        });

    });

    api.event.on("settings.saved", (settings) => {
        validateTools(settings.tools);
        env.current = settings;
        let proc = settings.process;
        let hasTabs = false;
        let hasTraces = false;
        if (env.isCamMode && proc.ops) {
            proc.ops = proc.ops.filter(v => v);
        }
        // for any tabs or traces to set markers
        for (let widget of api.widgets.all()) {
            let wannot = widget.anno;
            if (wannot.tab && wannot.tab.length) hasTabs = true;
            if (wannot.trace && wannot.trace.length) hasTraces = true;
        }
        api.platform.update_bounds();
        updateIndex();
        updateStock();
        updateAxisMode();
        if (!env.poppedRec) {
            opRender();
        }
    });

    api.event.on("settings.load", (settings) => {
        opRender();
        if (!env.isCamMode) return;
        validateTools(settings.tools);
        restoreTabs(api.widgets.all());
        updateAxisMode();
    });

    api.event.on("cam.stock.toggle", (bool) => {
        env.showStock = bool ?? !env.showStock;
        updateStock();
    });

    api.event.on("boolean.click", api.platform.update_bounds);

    api.event.on([
        "init-done",
        "view.set",
        // update stock when modes change?
        "slice.end",
        "preview.end",
        // update stock when preferences change
        // "boolean.click",
        "boolean.update",
        // update stock when objects move
        "platform.layout",
        "selection.drag",
        "selection.move",
        // force bounds update, too
        "selection.scale",
        "selection.rotate"
    ], updateStock);

    // invalidate trace and drill ops on scale or rotate
    api.event.on([
        "selection.scale",
        "selection.rotate"
    ], () => {
        if (!env.isCamMode) return;
        for (let op of env.current.process.ops) {
            if (op.type === 'trace' && !env.flipping) {
                op.areas = {};
            }
            else if (op.type === 'drill' && !env.flipping) {
                op.drills = {};
            }
        }
    });

    // invalidate tabs when scaleds
    api.event.on([
        "selection.scale",
    ], () => {
        tabClear();
    });

    api.event.on([
        // update tab color/opacity on dark/light change
        "boolean.update"
    ], updateTabs);

    api.event.on("preview.end", () => {
        env.isParsed = false;
        if (env.isCamMode) {
            let bounds = STACKS.getStack("bounds");
            if (bounds) bounds.button("animate", animate);
        }
    });

    api.event.on("code.loaded", (info) => {
        if (env.isCamMode) {
            env.isParsed = true;
            let parse = STACKS.getStack("parse", SPACE.world);
            if (parse) parse.button("animate", animate);
        }
    });

    $('op-add').onmouseenter = () => {
        if (env.func.unpop) env.func.unpop();
    };

    $('op-add-list').onclick = (ev) => {
        let settings = api.conf.get();
        let { process, device } = settings;
        switch (ev.target.innerText.toLowerCase()) {
            case "index": return opAddIndex();
            case "laser on": return opAddLaserOn();
            case "laser off": return opAddLaserOff();
            case "gcode": return opAddGCode();
            case "level": return opAddLevel();
            case "rough": return opAddRough();
            case "outline": return opAddOutline();
            case "contour":
                let caxis = "X";
                for (let op of env.current.process.ops) {
                    if (op.type === "contour" && op.axis === "X") {
                        caxis = "Y";
                    }
                }
                return opAddContour(caxis);
            case "lathe":
                let laxis = "X";
                for (let op of env.current.process.ops) {
                    if (op.type === "lathe" && op.axis === "X") {
                        laxis = "Y";
                    }
                }
                return opAddLathe(laxis);
            case "register": return opAddRegister('X', 2);
            case "drill": return opAddDrill();
            case "trace": return opAddTrace();
            case "pocket": return opAddPocket();
            case "helical": return opAddHelical();
            case "area": return opAddArea();
            case "flip":
                // only one flip op permitted
                for (let op of env.current.process.ops) {
                    if (op.type === 'flip') {
                        return;
                    }
                }
                return opAddFlip();
        }
    };

    // TAB/TRACE BUTTON HANDLERS
    api.event.on("button.click", target => {
        let process = api.conf.get().process;
        switch (target) {
            case api.ui.tabAdd:
                return tabAdd();
            case api.ui.tabDun:
                return tabDone();
            case api.ui.tabClr:
                api.uc.confirm("clear tabs?").then(ok => {
                    if (ok) tabClear();
                });
                break;
        }
    });

    api.event.on("cam.op.add", opAdd);

    api.event.on("cam.op.del", opDel);

    api.event.on("cam.op.render", opRender);

    api.event.on("cam.tabs.add", tabAdd);

    api.event.on("cam.tabs.done", tabDone);

    api.event.on("cam.tabs.clear", tabClear);

    // COMMON TAB/TRACE EVENT HANDLERS
    api.event.on("slice.begin", () => {
        if (!env.isCamMode) {
            return;
        }
        clearPops();
        recreateTabs();
        for (let group of Widget.Groups.list()) {
            let root = group[0];
            if (root.tabs)
            for (let tab of Object.values(root.tabs)) {
                let geo = tab.box.geometry.clone();
                if (geo.index) geo = geo.toNonIndexed();
                geo.translate(tab.x, tab.y, tab.z);
                let bbg = BufferGeometryUtils.mergeGeometries([ geo ]);
                let sw = newWidget(null, group);
                let fwp = group[0].track.pos;
                sw.loadGeometry(bbg);
                sw._move(fwp.x, fwp.y, fwp.z);
                api.widgets.add(sw);
                sw.track.synth = true;
                sw.track.indexed = root.track.indexed;
            }
        }
    });

    api.event.on("key.esc", () => {
        if (env.isCamMode) {
            clearPops();
        }
    });

    api.event.on("selection.scale", () => {
        if (env.isCamMode) {
            clearPops();
        }
    });

    api.event.on("widget.duplicate", (widget, oldwidget) => {
        if (!env.isCamMode) {
            return;
        }
        if (traceOn) {
            traceDone();
        }
        if(helicalOn){
            helicalDone();
        }
        unselectTraces(widget);
        if (env.flipping) {
            return;
        }
        let ann = api.widgets.annotate(widget.id);
        if (ann.tab) {
            ann.tab.forEach((tab, i) => {
                tab.id = Date.now() + i;
            });
            restoreTabs([widget]);
        }
    });

    api.event.on("widget.mirror", widget => {
        if (!env.isCamMode) {
            return;
        }
        if (traceOn) {
            traceDone();
        }
        if (holeSelOn) {
            selectHolesDone();
        }
        if(helicalOn){
            helicalDone();
        }
        clearHolesRec(widget)
        unselectTraces(widget);
        if (env.flipping) {
            return;
        }
        mirrorTabs(widget);
    });

    api.event.on("widget.rotate", rot => {
        if (!env.isCamMode) {
            return;
        }
        let { widget, x, y, z } = rot;
        if (traceOn) {
            traceDone();
        }
        unselectTraces(widget);
        if (holeSelOn) {
            selectHolesDone();
        }
        if(helicalOn){
            helicalDone();
        }
        if (env.flipping) {
            return;
        }
        clearHolesRec(widget)
        if (x || y) {
            clearTabs(widget);
        } else {
            rotateTabs(widget, x, y, z);
        }
    });

    api.event.on("mouse.hover.up", rec => {
        if (!env.isCamMode) {
            return;
        }
        let { object, event } = rec;
        env.hoverUp(object, event);
    });

    api.event.on("mouse.hover", data => {
        if (!env.isCamMode) {
            return;
        }
        env.hover(data);
    });

    createPopOps();
}

function validateTools(tools) {
    if (tools) {
        let max = 0;
        for (let t of tools) {
            if (Number.isInteger(t.number)) {
                max = Math.max(max, t.number);
            }
        }
        for (let t of tools) {
            if (!Number.isInteger(t.number)) {
                t.number = ++max;
                console.log('added tool #', t);
            }
        }
    }
}

function animate() {
    env.isAnimate = true;
    api.widgets.setOpacity(env.isParsed ? 0 : 0.75);
    api.hide.slider();
    STACKS.clear();
    animFn().animate(api);
    api.view.set_animate();
}
