/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.cam.driver
// use: kiri-mode.cam.animate
// use: kiri-mode.cam.animate2
// use: kiri-mode.cam.tools
// use: load.gbr
gapp.register("kiri-mode.cam.client", [], (root, exports) => {

const { base, kiri } = root;
const { driver } = kiri;
const { CAM } = driver;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const hasSharedArrays = self.SharedArrayBuffer ? true : false;

let isAnimate,
    isArrange,
    isPreview,
    isCamMode,
    isIndexed,
    isParsed,
    camStock,
    camZTop,
    camZBottom,
    current,
    currentIndex,
    flipping,
    poppedRec,
    hoveredOp,
    lastMode,
    API, FDM, SPACE, STACKS, MODES, VIEWS, UI, UC, LANG, MCAM, WIDGETS;

let zaxis = { x: 0, y: 0, z: 1 },
    popOp = {},
    animVer = 0,
    seed = Date.now(),
    func = {
        hover: noop,
        hoverUp: noop
    };

function animFn() {
    return [{
        animate: CAM.animate,
        animate_clear: CAM.animate_clear
    },{
        animate: CAM.animate2,
        animate_clear: CAM.animate_clear2
    }][animVer];
}

CAM.restoreTabs = restoreTabs;

CAM.init = function(kiri, api) {
    FDM = kiri.driver.FDM;

    // console.log({kiri,api})
    WIDGETS = api.widgets;
    SPACE = kiri.space;
    MODES = kiri.consts.MODES;
    VIEWS = kiri.consts.VIEWS;
    STACKS = api.const.STACKS;
    LANG = api.const.LANG;
    MCAM = [ MODES.CAM ];
    UI = api.ui;
    UC = api.uc;
    API = api;

    function updateAxisMode(refresh) {
        const { camStockIndexGrid, camStockIndexed } = current.process;
        let newIndexed = camStockIndexed;
        let changed = refresh || isIndexed !== newIndexed;
        isIndexed = newIndexed;
        if (!isIndexed || !isCamMode) {
            WIDGETS.setAxisIndex(0);
        }
        if (!isCamMode) {
            return;
        }
        if (isIndexed) {
            current.process.camZAnchor = "middle";
        }
        animVer = isIndexed ? 1 : 0;
        SPACE.platform.setVisible(!isIndexed);
        SPACE.platform.showGrid2(!isIndexed || camStockIndexGrid);
        const showIndexed = isIndexed ? '' : 'none';
        const showNonIndexed = isIndexed ? 'none' : '';
        $('cam-index').style.display = showIndexed;
        $('cam-lathe').style.display = showIndexed;
        $('cam-flip').style.display = showNonIndexed;
        $('cam-reg').style.display = showNonIndexed;
        if (!changed) {
            return;
        }
        WIDGETS.setIndexed(isIndexed ? true : false);
        api.platform.update_bounds();
        // add or remove clock op depending on indexing
        const cp = current.process;
        if (!cp.ops) {
            return;
        }
        const clockOp = cp.ops.filter(op => op.type === '|')[0];
        if (!clockOp) {
            func.opAdd(popOp['|'].new());
        } else {
            func.opRender();
        }
        updateStock();
    }

    api.event.on("cam.parse.gerber", opts => {
        const { data, mesh } = opts;
        const { open, closed, circs, rects } = load.GBR.parse(data);
        const stack = new kiri.Stack(mesh || moto.space.world.newGroup());
        const layers = new kiri.Layers();
        for (let poly of open) {
            layers.setLayer("open", {line: 0xff8800}, false).addPoly(poly);
            let diam = poly.tool?.shape?.diameter;
            if (diam) {
                const exp = poly.offset_open(diam, 'round');
                layers.setLayer("open-exp", {line: 0xff5555}, false).addPolys(exp);
            }
        }
        for (let poly of closed) {
            layers.setLayer("close", {line: 0xff0000}, false).addPoly(poly);
        }
        for (let poly of circs) {
            layers.setLayer("circs", {line: 0x008800}, false).addPoly(poly);
        }
        for (let poly of rects) {
            layers.setLayer("rects", {line: 0x0000ff}, false).addPoly(poly);
        }
        stack.addLayers(layers);
    });

    api.event.on("widget.add", widget => {
        if (isCamMode && !Array.isArray(widget)) {
            updateAxisMode(true);
            widget.setIndexed(isIndexed ? true : false);
            api.platform.update_bounds();
        }
    });

    // wire up animate button in ui
    api.event.on("function.animate", (mode) => {
        if (isAnimate || !isCamMode) {
            return;
        }
        api.function.prepare(() => {
            if (isCamMode) {
                animate();
            }
        });
    });

    api.event.on("function.export", (mode) => {
        if (isAnimate) {
            isAnimate = false;
            animFn().animate_clear(api);
        }
    });

    api.event.on("mode.set", (mode) => {
        isIndexed = undefined;
        isCamMode = mode === 'CAM';
        SPACE.platform.setColor(isCamMode ? 0xeeeeee : 0xcccccc);
        api.uc.setVisible(UI.func.animate, isCamMode);
        // hide/show cam mode elements
        for (let el of [...document.getElementsByClassName('mode-cam')]) {
            api.uc.setClass(el, 'hide', !isCamMode);
        }
        if (!isCamMode) {
            func.clearPops();
            func.tabClear();
        }
        // do not persist traces across page reloads
        func.traceClear();
        func.opRender();
        updateStock();
    });

    api.event.on("view.set", (mode) => {
        lastMode = mode;
        isArrange = (mode === VIEWS.ARRANGE);
        isPreview = (mode === VIEWS.PREVIEW);
        isAnimate = (mode === VIEWS.ANIMATE);
        animFn().animate_clear(api);
        func.clearPops();
        if (isCamMode && isPreview) {
            WIDGETS.setAxisIndex(0);
        }
        updateStock();
        func.opRender();
        api.uc.setVisible($('layer-animate'), isAnimate && isCamMode);
    });

    api.event.on("settings.saved", (settings) => {
        validateTools(settings.tools);
        current = settings;
        let proc = settings.process;
        let hasTabs = false;
        let hasTraces = false;
        if (isCamMode && proc.ops) {
            proc.ops = proc.ops.filter(v => v);
        }
        // for any tabs or traces to set markers
        for (let widget of API.widgets.all()) {
            let wannot = widget.anno;
            if (wannot.tab && wannot.tab.length) hasTabs = true;
            if (wannot.trace && wannot.trace.length) hasTraces = true;
        }
        api.platform.update_bounds();
        updateIndex();
        updateStock();
        updateAxisMode();
        if (!poppedRec) {
            func.opRender();
        }
    });

    api.event.on("settings.load", (settings) => {
        func.opRender();
        if (!isCamMode) return;
        validateTools(settings.tools);
        restoreTabs(api.widgets.all());
        updateAxisMode();
    });

    api.event.on("cam.stock.toggle", (bool) => {
        camStock && (camStock.visible = bool ?? !camStock.visible);
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

    // invalidate trace ops on scale or rotate
    api.event.on([
        "selection.scale",
        "selection.rotate"
    ], () => {
        if (!isCamMode) return;
        for (let op of current.process.ops) {
            if (op.type === 'trace' && !flipping) {
                op.areas = {};
            }
        }
    });

    // invalidate tabs when scaleds
    api.event.on([
        "selection.scale",
    ], () => {
        func.tabClear();
    });

    api.event.on([
        // update tab color/opacity on dark/light change
        "boolean.update"
    ], updateTabs);

    api.event.on("preview.end", () => {
        isParsed = false;
        if (isCamMode) {
            let bounds = STACKS.getStack("bounds");
            if (bounds) bounds.button("animate", animate);
        }
    });

    api.event.on("code.loaded", (info) => {
        if (isCamMode) {
            isParsed = true;
            let parse = STACKS.getStack("parse", SPACE.world);
            if (parse) parse.button("animate", animate);
        }
    });

    $('op-add').onmouseenter = () => {
        if (func.unpop) func.unpop();
    };

    $('op-add-list').onclick = (ev) => {
        let settings = API.conf.get();
        let { process, device } = settings;
        switch (ev.target.innerText.toLowerCase()) {
            case "index": return func.opAddIndex();
            case "laser on": return func.opAddLaserOn();
            case "laser off": return func.opAddLaserOff();
            case "gcode": return func.opAddGCode();
            case "level": return func.opAddLevel();
            case "rough": return func.opAddRough();
            case "outline": return func.opAddOutline();
            case "contour":
                let caxis = "X";
                for (let op of current.process.ops) {
                    if (op.type === "contour" && op.axis === "X") {
                        caxis = "Y";
                    }
                }
                return func.opAddContour(caxis);
            case "lathe":
                let laxis = "X";
                for (let op of current.process.ops) {
                    if (op.type === "lathe" && op.axis === "X") {
                        laxis = "Y";
                    }
                }
                return func.opAddLathe(laxis);
            case "register": return func.opAddRegister('X', 2);
            case "drill": return func.opAddDrill();
            case "trace": return func.opAddTrace();
            case "pocket": return func.opAddPocket();
            case "flip":
                // only one flip op permitted
                for (let op of current.process.ops) {
                    if (op.type === 'flip') {
                        return;
                    }
                }
                return func.opAddFlip();
        }
    };

    func.opAddLaserOn = () => {
        func.opAdd(popOp['laser on'].new());
    };

    func.opAddLaserOff = () => {
        func.opAdd(popOp['laser off'].new());
    };

    func.opAddGCode = () => {
        func.opAdd(popOp.gcode.new());
    };

    func.opAddIndex = () => {
        func.opAdd(popOp.index.new());
    };

    func.opAddLevel = () => {
        func.opAdd(popOp.level.new());
    };

    func.opAddRough = () => {
        func.opAdd(popOp.rough.new());
    };

    func.opAddOutline = () => {
        func.opAdd(popOp.outline.new());
    };

    func.opAddPocket = () => {
        func.traceDone();
        func.surfaceDone();
        let rec = popOp.pocket.new();
        rec.surfaces = { /* widget.id: [ faces... ] */ };
        func.opAdd(rec);
    };

    func.opAddContour = (axis) => {
        let rec = popOp.contour.new();
        rec.axis = axis.toUpperCase();
        func.opAdd(rec);
    };

    func.opAddLathe = (axis) => {
        let rec = popOp.lathe.new();
        rec.axis = axis.toUpperCase();
        func.opAdd(rec);
    };

    func.opAddTrace = () => {
        let rec = popOp.trace.new();
        rec.areas = { /* widget.id: [ polygons... ] */ };
        func.opAdd(rec);
    };

    func.opAddDrill = () => {
        func.opAdd(popOp.drill.new());
    };

    func.opAddRegister = (axis, points) => {
        let rec = popOp.register.new();
        rec.axis = axis.toUpperCase();
        rec.points = points;
        func.opAdd(rec);
    };

    func.opAddFlip = () => {
        func.opAdd(popOp.flip.new());
    };

    // TAB/TRACE BUTTON HANDLERS
    api.event.on("button.click", target => {
        let process = API.conf.get().process;
        switch (target) {
            case api.ui.tabAdd:
                return func.tabAdd();
            case api.ui.tabDun:
                return func.tabDone();
            case api.ui.tabClr:
                api.uc.confirm("clear tabs?").then(ok => {
                    if (ok) func.tabClear();
                });
                break;
        }
    });

    // OPS FUNCS
    api.event.on("cam.op.add", func.opAdd = (rec) => {
        if (!isCamMode) return;
        func.clearPops();
        let oplist = current.process.ops;
        if (oplist.indexOf(rec) < 0) {
            if (oplist.length && oplist[oplist.length-1].type === '|') {
                oplist.splice(oplist.length-1,0,rec);
            } else {
                oplist.push(rec);
            }
            let fpos = oplist.findWith(rec => rec.type === 'flip');
            if (fpos >= 0 && oplist.length > 1) {
                let oprec = oplist.splice(fpos,1);
                oplist.push(oprec[0]);
            }
            API.conf.save();
            func.opRender();
        }
    });

    api.event.on("cam.op.del", func.opDel = (rec) => {
        if (!isCamMode) return;
        func.clearPops();
        let oplist = current.process.ops;
        let pos = oplist.indexOf(rec);
        if (pos >= 0) {
            oplist.splice(pos,1);
            API.conf.save();
            func.opRender();
        }
    });

    function updateIndex() {
        let oplist = current.process.ops;
        if (!(isCamMode && oplist) || lastMode === VIEWS.ANIMATE) {
            return;
        }
        let index = 0;
        let indexing = false;
        for (let op of oplist) {
            if (op.type === '|') {
                break;
            }
            if (op.type === 'index') {
                indexing = true;
                if (op.absolute) {
                    index = op.degrees
                } else {
                    index += op.degrees;
                }
            }
        }
        WIDGETS.setAxisIndex(isPreview || !isIndexed ? 0 : -index);
        currentIndex = isIndexed && !isPreview ? index * DEG2RAD : 0;
    }

    // (re)render the re-orderable op list
    api.event.on("cam.op.render", func.opRender = () => {
        let oplist = current.process.ops;
        if (!(isCamMode && oplist)) {
            return;
        }
        oplist = oplist.filter(rec => !Array.isArray(rec));
        let mark = Date.now();
        let html = [];
        let bind = {};
        let scale = API.view.unit_scale();
        let notime = false;
        oplist.forEach((rec,i) => {
            let title = '';
            let clock = rec.type === '|';
            let label = clock ? `` : rec.type;
            let clazz = notime ? [ "draggable", "notime" ] : [ "draggable" ];
            let notable = rec.note ? rec.note.split(' ').filter(v => v.charAt(0) === '#') : undefined;
            if (clock) { clazz.push('clock'); title = ` title="end of ops chain\ndrag/drop like an op\nops after this are disabled"` }
            if (notable?.length) label += ` (${notable[0].slice(1)})`;
            html.appendAll([
                `<div id="${mark+i}" class="${clazz.join(' ')}"${title}>`,
                `<label class="label">${label}</label>`,
                clock ? '' :
                `<label id="${mark+i}-x" class="del"><i class="fa fa-trash"></i></label>`,
                `</div>`
            ]);
            bind[mark+i] = rec;
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
                    func.surfaceDone();
                    func.traceDone();
                    func.tabDone();
                    func.opDel(rec);
                };
            } else {
                indexing = false;
            }
            let el = $(id);
            if (!isIndexed && type === 'lathe') {
                rec.disabled = true;
            }
            if (!hasSharedArrays && (type === 'contour' || type === 'lathe')) {
                rec.disabled = true;
            }
            if (rec.disabled) {
                el.classList.add("disabled");
            }
            bounds.push(el);
            let timer = null;
            let inside = true;
            let popped = false;
            let poprec = popOp[rec.type];
            if (type === 'index' && indexing && !rec.disabled) {
                index = rec.absolute ? rec.degrees : index + rec.degrees;
            }
            el.rec = rec;
            el.unpop = () => {
                let pos = [...el.childNodes].indexOf(poprec.div);
                if (pos >= 0) {
                    el.removeChild(poprec.div);
                }
                popped = false;
            };
            function onEnter(ev) {
                if ((surfaceOn || traceOn) && poppedRec != rec) {
                    return;
                }
                if (popped && poppedRec != rec) {
                    func.surfaceDone();
                    func.traceDone();
                }
                if (unpop) unpop();
                unpop = func.unpop = el.unpop;
                inside = true;
                // pointer to current rec for trace editing
                poppedRec = rec;
                popped = true;
                poprec.use(rec);
                hoveredOp = el;
                if (!clock) {
                    // offset Y position of pop div by % of Y screen location of button
                    el.appendChild(poprec.div);
                    poprec.addNote();
                    const { innerHeight } = window;
                    const brect = ev.target.getBoundingClientRect();
                    const prect = poprec.div.getBoundingClientRect();
                    const pcty = (brect.top / innerHeight) * 0.9;
                    const offpx = -pcty * prect.height;
                    poprec.div.style.transform = `translateY(${offpx}px)`;
                }
                // option click event appears latent
                // and overides the sticky settings
                setTimeout(() => {
                    UC.setSticky(false);
                }, 0);
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
                func.surfaceDone();
                func.traceDone();
                let target = ev.target, clist = target.classList;
                if (!clist.contains("draggable")) {
                    return;
                }
                // toggle enable / disable
                if (!clock && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    rec.disabled = !rec.disabled;
                    for (let op of ev.shiftKey ? oplist : [ rec ]) {
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
                    return true;
                }
                // duplicate op
                if (!clock && ev.shiftKey) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    oplist = current.process.ops;
                    oplist.push(Object.clone(rec));
                    API.conf.save();
                    func.opRender();
                    return true;
                }
                clist.add("drag");
                ev.stopPropagation();
                ev.preventDefault();
                let tracker = UI.tracker;
                tracker.style.display = 'block';
                let cancel = tracker.onmouseup = (ev) => {
                    oplist = current.process.ops;
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
                    API.conf.save();
                    func.opRender();
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
            if (moto.space.info.mob) {
                let touched = false;
                el.ontouchstart = (ev) => {
                    touched = true;
                    if (poppedRec === rec && popped) {
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
        if (lastMode !== VIEWS.ANIMATE) {
            // update widget rotations from timeline marker
            WIDGETS.setAxisIndex(isPreview || !isIndexed ? 0 : -index);
        }
        currentIndex = isIndexed && !isPreview ? index * DEG2RAD : 0;
        updateStock();
    });

    func.opGCode = (label, field = 'gcode') => {
        API.dialog.show('any');
        const { c_gcode } = h.bind(
            $('mod-any'), h.div({ id: "camop_dialog" }, [
                h.label(label || 'custom gcode operation'),
                h.textarea({ id: "c_gcode", rows: 15, cols: 50 }),
                h.button({ _: 'done', onclick: () => {
                    API.dialog.hide();
                    API.conf.save();
                } })
            ])
        );
        let av = poppedRec[field] || [];
        c_gcode.value = typeof(av) === 'string' ? av : av.join('\n');
        c_gcode.onkeyup = (el) => {
            poppedRec[field] = c_gcode.value.trim().split('\n');
        };
        c_gcode.focus();
    };

    // create custom gcode editor function
    function gcodeEditor(label, field) {
        return function() {
            func.opGCode(label, field);
        }
    }

    func.opFlip = () => {
        API.view.set_arrange();
        let widgets = API.widgets.all();
        let { process } = current;
        let { ops, op2 } = process;
        // add flip singleton to b-side
        let add2 = op2.length === 0;
        let axis = poppedRec.axis;
        flipping = true;
        process.camZAnchor = {
            top: "bottom",
            bottom: "top",
            middle: "middle"
        }[process.camZAnchor];
        // flip tabs
        for (let widget of widgets) {
            let anno = API.widgets.annotate(widget.id).tab || [];
            let wbm = widget.bounds.max.z;
            for (let tab of anno) {
                let box = widget.tabs[tab.id].box;
                let bpo = box.position;
                let xr = 0, yr = 0;
                let flz = wbm - bpo.z;
                if (axis === 'X') {
                    tab.pos.y = -tab.pos.y;
                    bpo.y = -bpo.y;
                    xr = Math.PI / 2;
                }
                if (axis === 'Y') {
                    tab.pos.x = -tab.pos.x;
                    bpo.x = -bpo.x;
                    yr = Math.PI / 2;
                }
                tab.pos.z = bpo.z = flz;
                let [ rx, ry, rz, rw ] = tab.rot;
                let qat = new THREE.Quaternion(rx, ry, rz, rw);
                let eul = new THREE.Euler().setFromQuaternion(qat);
                eul._z = -eul._z;
                tab.rot = new THREE.Quaternion().setFromEuler(eul);
            }
            clearTabs(widget, true);
            restoreTabs([widget]);
        }
        // flip widget
        if (axis === 'X') {
            API.selection.rotate(Math.PI, 0, 0);
        }
        if (axis === 'Y') {
            API.selection.rotate(0, Math.PI, 0);
        }
        // clear traces cache
        CAM.traces_clear();
        kiri.client.clear();
        flipping = false;
        process.ops = op2;
        process.op2 = ops;
        // flip camZBottom
        if (poppedRec.invert && process.camZBottom && camZBottom) {
            const maxZ = camZBottom._max.z
            process.camZBottom = maxZ - process.camZBottom;
            API.util.rec2ui(process);
            updateStock();
        }
        // keep flip operations in sync
        for (let op of op2) {
            if (op.type === 'flip') {
                op.axis = poppedRec.axis;
                op.invert = poppedRec.invert;
            }
        }
        if (add2) {
            func.opAdd(poppedRec);
        } else {
            func.opRender();
        }
    };

    // TAB FUNCS
    let showTab, lastTab, tab, iw, ic;
    api.event.on("cam.tabs.add", func.tabAdd = () => {
        func.traceDone();
        alert = api.show.alert("[esc] cancels tab editing");
        api.feature.hover = true;
        func.hover = func.tabHover;
        func.hoverUp = func.tabHoverUp;
    });
    api.event.on("cam.tabs.done", func.tabDone = () => {
        delbox('tabb');
        api.hide.alert(alert);
        api.feature.hover = false;
        if (lastTab) {
            lastTab.box.material.color.r = 0;
            lastTab = null;
        }
    });
    api.event.on("cam.tabs.clear", func.tabClear = () => {
        func.tabDone();
        API.widgets.all().forEach(widget => {
            clearTabs(widget);
            widget.saveState();
        });
        API.conf.save();
    });
    func.tabHover = function(data) {
        delbox('tabb');
        const { int, type, point } = data;
        const object = int ? int.object : null;
        const tab = int ? object.tab : null;
        if (lastTab) {
            lastTab.box.material.color.r = 0;
            lastTab = null;
        }
        if (tab) {
            tab.box.material.color.r = 0.5;
            lastTab = tab;
            return;
        }
        if (type !== 'widget') {
            iw = null;
            return;
        }
        let n = int.face.normal;
        iw = int.object.widget;
        ic = int.point;
        // only near vertical faces
        // if (Math.abs(n.z) > 0.3) {
        //     return;
        // }
        showTab = createTabBox(iw, ic, n);
    };
    func.tabHoverUp = function(int) {
        delbox('tabb');
        if (lastTab) {
            const {widget, box, id} = lastTab;
            widget.adds.remove(box);
            widget.mesh.remove(box);
            delete widget.tabs[id];
            let ta = API.widgets.annotate(widget.id).tab;
            let ix = 0;
            ta.forEach((rec,i) => {
                if (rec.id === id) {
                    ix = i;
                }
            });
            ta.splice(ix,1);
            API.conf.save();
            widget.saveState();
            return;
        }
        if (!iw) return;
        let ip = iw.track.pos;
        let wa = api.widgets.annotate(iw.id);
        let wt = (wa.tab = wa.tab || []);
        let pos = {
            x: showTab.pos.x - ip.x,
            y: -showTab.pos.z - ip.y,
            z: showTab.stock.z ?
                showTab.pos.y + ip.z + (isIndexed ? 0 : iw.track.tzoff) :
                showTab.dim.z/2,
        }
        let id = Date.now();
        let { dim, rot } = showTab;
        let rec = { pos, dim, rot, id };
        wt.push(Object.clone(rec));
        addWidgetTab(iw, rec);
        API.conf.save();
        iw.saveState();
    };

    // SURFACE FUNCS
    let surfaceOn = false, lastWidget;
    func.surfaceAdd = (ev) => {
        if (surfaceOn) {
            return func.surfaceDone();
        }
        func.clearPops();
        alert = api.show.alert("analyzing surfaces...", 1000);
        let surfaces = poppedRec.surfaces;
        let radians = poppedRec.follow * DEG2RAD;
        CAM.surface_prep(currentIndex * RAD2DEG, () => {
            api.hide.alert(alert);
            alert = api.show.alert("[esc] cancels surface selection");
            for (let [wid, arr] of Object.entries(surfaces)) {
                let widget = api.widgets.forid(wid);
                if (widget && arr.length)
                for (let faceid of arr) {
                    CAM.surface_toggle(widget, faceid, radians, faceids => {
                        // surfaces[widget.id] = faceids;
                    });
                }
            }
        });
        surfaceOn = hoveredOp;
        surfaceOn.classList.add("editing");
        api.feature.on_mouse_up = (obj, ev) => {
            let { face } = obj;
            let min = Math.min(face.a, face.b, face.c);
            let faceid = min / 3;
            let widget = lastWidget = obj.object.widget;
            CAM.surface_toggle(widget, faceid, radians, faceids => {
                surfaces[widget.id] = faceids;
            });
        };
    };
    func.surfaceDone = () => {
        if (!(surfaceOn && poppedRec && poppedRec.surfaces)) {
            return;
        }
        let surfaces = poppedRec.surfaces;
        for (let wid of Object.keys(surfaces)) {
            let widget = api.widgets.forid(wid);
            if (widget) {
                CAM.surface_clear(widget);
            } else {
                delete surfaces[wid];
            }
        }
        api.hide.alert(alert);
        api.feature.on_mouse_up = undefined;
        surfaceOn.classList.remove("editing");
        surfaceOn = false;
    };

    // TRACE FUNCS
    let traceOn = false, lastTrace;
    func.traceAdd = (ev) => {
        if (traceOn) {
            return func.traceDone();
        }
        func.clearPops();
        alert = api.show.alert("analyzing parts...", 1000);
        traceOn = hoveredOp;
        traceOn.classList.add("editing");
        api.feature.hover = true;
        api.feature.hoverAdds = true;
        func.hover = func.traceHover;
        func.hoverUp = func.traceHoverUp;
        CAM.traces((ids) => {
            api.hide.alert(alert);
            alert = api.show.alert("[esc] cancels trace editing");
            kiri.api.widgets.opacity(0.8);
            kiri.api.widgets.for(widget => {
                if (ids.indexOf(widget.id) >= 0) {
                    unselectTraces(widget, true);
                    widget.trace_stack = null;
                }
                if (widget.trace_stack) {
                    widget.adds.appendAll(widget.trace_stack.meshes);
                    widget.trace_stack.show();
                    return;
                }
                let areas = (poppedRec.areas[widget.id] || []);
                let stack = new kiri.Stack(widget.mesh);
                widget.trace_stack = stack;
                widget.traces.forEach(poly => {
                    let match = areas.filter(arr => poly.matches(arr));
                    let layers = new kiri.Layers();
                    layers.setLayer("trace", {line: 0xaaaa55, fat:4, order:-10}, false).addPoly(poly);
                    stack.addLayers(layers);
                    stack.new_meshes.forEach(mesh => {
                        mesh.trace = {widget, poly};
                        // ensure trace poly singleton from matches
                        if (match.length > 0) {
                            poly._trace = match[0];
                        } else {
                            poly._trace = poly.toArray();
                        }
                    });
                    widget.adds.appendAll(stack.new_meshes);
                });
            });
            // ensure appropriate traces are toggled matching current record
            kiri.api.widgets.for(widget => {
                let areas = (poppedRec.areas[widget.id] || []);
                let stack = widget.trace_stack;
                stack.meshes.forEach(mesh => {
                    let { poly } = mesh.trace;
                    let match = areas.filter(arr => poly.matches(arr));
                    if (match.length > 0) {
                        if (!mesh.selected) {
                            func.traceToggle(mesh, true);
                        }
                    } else if (mesh.selected) {
                        func.traceToggle(mesh, true);
                    }
                });
            });
        }, poppedRec.select === 'lines');
    };
    func.traceDone = () => {
        if (!traceOn) {
            return;
        }
        func.unpop();
        traceOn.classList.remove("editing");
        traceOn = false;
        kiri.api.widgets.opacity(1);
        api.hide.alert(alert);
        api.feature.hover = false;
        api.feature.hoverAdds = false;
        kiri.api.widgets.for(widget => {
            if (widget.trace_stack) {
                widget.trace_stack.hide();
                widget.adds.removeAll(widget.trace_stack.meshes);
            }
        });
    };
    func.clearPops = () => {
        if (func.unpop) func.unpop();
        func.tabDone();
        func.traceDone();
        func.surfaceDone();
    };
    api.event.on("cam.trace.clear", func.traceClear = () => {
        func.traceDone();
        API.widgets.all().forEach(widget => {
            unselectTraces(widget);
        });
        API.conf.save();
    });
    func.traceHover = function(data) {
        if (lastTrace) {
            let { color, colorSave } = lastTrace.material[0] || lastTrace.material;
            color.r = colorSave.r;
            color.g = colorSave.g;
            color.b = colorSave.b;
            lastTrace.position.z -= 0.01;
        }
        if (data.type === 'platform') {
            lastTrace = null;
            return;
        }
        if (!data.int.object.trace) {
            return;
        }
        lastTrace = data.int.object;
        lastTrace.position.z += 0.01;
        if (lastTrace.selected) {
            let event = data.event;
            let target = event.target;
            let { clientX, clientY } = event;
            let { offsetWidth, offsetHeight } = target;
        }
        let material = lastTrace.material[0] || lastTrace.material;
        let color = material.color;
        let {r, g, b} = color;
        material.colorSave = {r, g, b};
        color.r = 0;
        color.g = 0;
        color.b = 1;
    };
    func.traceHoverUp = function(int, ev) {
        if (!int) return;
        let { object } = int;
        func.traceToggle(object);
        if (ev.metaKey || ev.ctrlKey) {
            let { selected } = object;
            let { widget, poly } = object.trace;
            for (let add of widget.adds) {
                if (add.trace && add.selected !== selected && add.trace.poly.getZ() === poly.getZ()) {
                    func.traceToggle(add);
                }
            }
        }
    };
    func.traceToggle = function(obj, skip) {
        let material = obj.material[0] || obj.material;
        if (!material) return;
        let { color, colorSave } = material;
        let { widget, poly } = obj.trace;
        let areas = poppedRec.areas;
        if (!areas) {
            return;
        }
        let wlist = areas[widget.id] = areas[widget.id] || [];
        obj.selected = !obj.selected;
        if (!colorSave) {
            colorSave = material.colorSave = {
                r: color.r,
                g: color.g,
                b: color.b
            };
        }
        if (obj.selected) {
            obj.position.z += 0.01;
            color.r = colorSave.r = 0.9;
            color.g = colorSave.g = 0;
            color.b = colorSave.b = 0.1;
            if (!skip) wlist.push(poly._trace);
        } else {
            obj.position.z -= 0.01;
            color.r = colorSave.r = 0xaa/255;
            color.g = colorSave.g = 0xaa/255;
            color.b = colorSave.b = 0x55/255;
            if (!skip) wlist.remove(poly._trace);
        }
        API.conf.save();
    };

    // COMMON TAB/TRACE EVENT HANDLERS
    api.event.on("slice.begin", () => {
        if (isCamMode) {
            func.clearPops();
        }
    });
    api.event.on("key.esc", () => {
        if (isCamMode) {
            func.clearPops();
        }
    });
    api.event.on("selection.scale", () => {
        if (isCamMode) {
            func.clearPops();
        }
    });
    api.event.on("widget.duplicate", (widget, oldwidget) => {
        if (!isCamMode) {
            return;
        }
        if (traceOn) {
            func.traceDone();
        }
        unselectTraces(widget);
        if (flipping) {
            return;
        }
        let ann = API.widgets.annotate(widget.id);
        if (ann.tab) {
            ann.tab.forEach((tab,i) => {
                tab.id = Date.now() + i;
            });
            restoreTabs([widget]);
        }
    });
    api.event.on("widget.mirror", widget => {
        if (!isCamMode) {
            return;
        }
        if (traceOn) {
            func.traceDone();
        }
        unselectTraces(widget);
        if (flipping) {
            return;
        }
        mirrorTabs(widget);
    });
    api.event.on("widget.rotate", rot => {
        if (!isCamMode) {
            return;
        }
        let {widget, x, y, z} = rot;
        if (traceOn) {
            func.traceDone();
        }
        unselectTraces(widget);
        if (flipping) {
            return;
        }
        if (x || y) {
            clearTabs(widget);
        } else {
            rotateTabs(widget, x, y, z);
        }
    });
    api.event.on("mouse.hover.up", rec => {
        if (!isCamMode) {
            return;
        }
        let { object, event } = rec;
        func.hoverUp(object, event);
    });
    api.event.on("mouse.hover", data => {
        if (!isCamMode) {
            return;
        }
        func.hover(data);
    });

    function mirrorTabs(widget) {
        let tabs = API.widgets.annotate(widget.id).tab || [];
        tabs.forEach(rec => {
            let { id, pos, rot } = rec;
            let tab = widget.tabs[id];
            let e = new THREE.Euler().setFromQuaternion(rot);
            e._z = Math.PI - e._z;
        let { _x, _y, _z, _w } = rec.rot;
        let or = new THREE.Quaternion(_x, _y, _z, _w);
            let nr = new THREE.Quaternion().setFromEuler(e);
        let ra = or.angleTo(nr);
        console.log({or, nr, ra});
            rec.rot = nr;
            // let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0,0,e._z));
            // tab.box.geometry.applyMatrix4(m4);
            tab.box.position.x = pos.x = -pos.x;
        });
        SPACE.update();
    }

    function rotateTabs(widget, x, y, z) {
        let tabs = API.widgets.annotate(widget.id).tab || [];
        tabs.forEach(rec => {
            let { id, pos, rot } = rec;
            if (!Array.isArray(rot)) {
                rot = rot.toArray();
            }
            let coff = widget.track.center;
            let tab = widget.tabs[id];
            let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
            // update position vector
            let vc = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(m4);
            // update rotation quaternion
            let [ rx, ry, rz, rw ] = rot;
            rec.rot = new THREE.Quaternion().multiplyQuaternions(
                new THREE.Quaternion(rx, ry, rz, rw),
                new THREE.Quaternion().setFromRotationMatrix(m4)
            ).toArray();
            tab.box.geometry.applyMatrix4(m4);
            tab.box.position.x = pos.x = vc.x - coff.dx;
            tab.box.position.y = pos.y = vc.y - coff.dy;
            tab.box.position.z = pos.z = vc.z;
        });
        SPACE.update();
    }

    function hasIndexing() {
        return isIndexed;
    }

    function hasSpindle() {
        return current.device.spindleMax > 0;
    }

    function zTop() {
        return API.conf.get().process.camZTop > 0;
    }

    function zBottom() {
        return API.conf.get().process.camZBottom > 0;
    }

    createPopOp('level', {
        tool:    'camLevelTool',
        spindle: 'camLevelSpindle',
        step:    'camLevelOver',
        rate:    'camLevelSpeed',
        down:    'camLevelDown',
        over:    'camLevelOver',
        stock:   'camLevelStock'
    }).inputs = {
        tool:    UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep:     UC.newBlank({class:"pop-sep"}),
        spindle: UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        step:    UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
        rate:    UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        down:    UC.newInput(LANG.cc_loff_s, {title:LANG.cc_loff_l, convert:UC.toFloat, units:true}),
        over:    UC.newInput(LANG.cc_lxyo_s, {title:LANG.cc_lxyo_l, convert:UC.toFloat, units:true}),
        sep:     UC.newBlank({class:"pop-sep"}),
        stock:   UC.newBoolean(LANG.cc_lsto_s, undefined, {title:LANG.cc_lsto_l}),
    };

    createPopOp('rough', {
        tool:    'camRoughTool',
        spindle: 'camRoughSpindle',
        down:    'camRoughDown',
        step:    'camRoughOver',
        rate:    'camRoughSpeed',
        plunge:  'camRoughPlunge',
        leave:   'camRoughStock',
        leavez:  'camRoughStockZ',
        all:     'camRoughAll',
        voids:   'camRoughVoid',
        flats:   'camRoughFlat',
        inside:  'camRoughIn',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
    }).inputs = {
        tool:    UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep:     UC.newBlank({class:"pop-sep"}),
        spindle: UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:    UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        plunge:  UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        sep:     UC.newBlank({class:"pop-sep"}),
        down:    UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
        step:    UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
        leave:   UC.newInput(LANG.cr_lsto_s, {title:LANG.cr_lsto_l, convert:UC.toFloat, units:true}),
        leavez:  UC.newInput(LANG.cr_lstz_s, {title:LANG.cr_lstz_l, convert:UC.toFloat, bound:UC.bound(0,10),units:true}),
        sep:     UC.newBlank({class:"pop-sep"}),
        all:     UC.newBoolean(LANG.cr_clst_s, undefined, {title:LANG.cr_clst_l, show:hasIndexing}),
        voids:   UC.newBoolean(LANG.cr_clrp_s, undefined, {title:LANG.cr_clrp_l}),
        flats:   UC.newBoolean(LANG.cr_clrf_s, undefined, {title:LANG.cr_clrf_l}),
        inside:  UC.newBoolean(LANG.cr_olin_s, undefined, {title:LANG.cr_olin_l}),
        sep:      UC.newBlank({class:"pop-sep"}),
        exp:      UC.newExpand("overrides"),
        ov_topz:  UC.newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:UC.toFloat, units:true}),
        ov_botz:  UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, units:true}),
        ov_conv:  UC.newBoolean(LANG.ou_conv_s, undefined, {title:LANG.ou_conv_l}),
        exp_end:  UC.endExpand(),
    };

    createPopOp('outline', {
        tool:     'camOutlineTool',
        spindle:  'camOutlineSpindle',
        step:     'camOutlineOver',
        steps:    'camOutlineOverCount',
        down:     'camOutlineDown',
        rate:     'camOutlineSpeed',
        plunge:   'camOutlinePlunge',
        dogbones: 'camOutlineDogbone',
        omitvoid: 'camOutlineOmitVoid',
        omitthru: 'camOutlineOmitThru',
        outside:  'camOutlineOut',
        inside:   'camOutlineIn',
        wide:     'camOutlineWide',
        top:      'camOutlineTop',
        ov_topz:   0,
        ov_botz:   0,
        ov_conv:   '~camConventional',
    }).inputs = {
        tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep:      UC.newBlank({class:"pop-sep"}),
        spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        plunge:   UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
        step:     UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0), show:() => popOp.outline.rec.wide}),
        steps:    UC.newInput(LANG.cc_sovc_s, {title:LANG.cc_sovc_l, convert:UC.toInt, bound:UC.bound(1,5), show:() => popOp.outline.rec.wide}),
        sep:      UC.newBlank({class:"pop-sep"}),
        top:      UC.newBoolean(LANG.co_clrt_s, undefined, {title:LANG.co_clrt_l}),
        inside:   UC.newBoolean(LANG.co_olin_s, undefined, {title:LANG.co_olin_l, show:(op) => { return !op.inputs.outside.checked }}),
        outside:  UC.newBoolean(LANG.co_olot_s, undefined, {title:LANG.co_olot_l, show:(op) => { return !op.inputs.inside.checked }}),
        sep:      UC.newBlank({class:"pop-sep"}),
        omitthru: UC.newBoolean(LANG.co_omit_s, undefined, {title:LANG.co_omit_l, xshow:(op) => { return op.inputs.outside.checked }}),
        omitvoid: UC.newBoolean(LANG.co_omvd_s, undefined, {title:LANG.co_omvd_l, xshow:(op) => { return op.inputs.outside.checked }}),
        wide:     UC.newBoolean(LANG.co_wide_s, undefined, {title:LANG.co_wide_l, show:(op) => { return !op.inputs.inside.checked }}),
        dogbones: UC.newBoolean(LANG.co_dogb_s, undefined, {title:LANG.co_dogb_l, show:(op) => { return !op.inputs.wide.checked }}),
        sep:      UC.newBlank({class:"pop-sep"}),
        exp:      UC.newExpand("overrides"),
        ov_topz:  UC.newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:UC.toFloat, units:true}),
        ov_botz:  UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, units:true}),
        ov_conv:  UC.newBoolean(LANG.ou_conv_s, undefined, {title:LANG.ou_conv_l}),
        exp_end:  UC.endExpand(),
    };

    const contourFilter = gcodeEditor('Layer Filter', 'filter');

    createPopOp('contour', {
        tool:      'camContourTool',
        spindle:   'camContourSpindle',
        step:      'camContourOver',
        rate:      'camContourSpeed',
        angle:     'camContourAngle',
        leave:     'camContourLeave',
        tolerance: 'camTolerance',
        flatness:  'camFlatness',
        reduction: 'camContourReduce',
        bridging:  'camContourBridge',
        bottom:    'camContourBottom',
        curves:    'camContourCurves',
        inside:    'camContourIn',
        filter:    'camContourFilter',
        axis:      'X'
    }).inputs = {
        tool:      UC.newSelect(LANG.cc_tool, {}, "tools"),
        axis:      UC.newSelect(LANG.cd_axis, {}, "xyaxis"),
        sep:       UC.newBlank({class:"pop-sep"}),
        spindle:   UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:      UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        sep:       UC.newBlank({class:"pop-sep"}),
        step:      UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,10.0)}),
        leave:     UC.newInput(LANG.cf_leav_s, {title:LANG.cf_leav_l, convert:UC.toFloat, bound:UC.bound(0,100)}),
        sep:       UC.newBlank({class:"pop-sep"}),
        angle:     UC.newInput(LANG.cf_angl_s, {title:LANG.cf_angl_l, convert:UC.toFloat, bound:UC.bound(45,90), show:(op) => op.inputs.curves.checked}),
        flatness:  UC.newInput(LANG.ou_flat_s, {title:LANG.ou_flat_l, convert:UC.toFloat, bound:UC.bound(0,1.0), units:false, round:4}),
        tolerance: UC.newInput(LANG.ou_toll_s, {title:LANG.ou_toll_l, convert:UC.toFloat, bound:UC.bound(0,10.0), units:true, round:4}),
        reduction: UC.newInput(LANG.ou_redu_s, {title:LANG.ou_redu_l, convert:UC.toInt, bound:UC.bound(0,10), units:false}),
        // bridging:  UC.newInput(LANG.ou_brdg_s, {title:LANG.ou_brdg_l, convert:UC.toFloat, bound:UC.bound(0,1000.0), units:true, round:4, show:(op) => op.inputs.curves.checked}),
        sep:       UC.newBlank({class:"pop-sep"}),
        curves:    UC.newBoolean(LANG.cf_curv_s, undefined, {title:LANG.cf_curv_l}),
        inside:    UC.newBoolean(LANG.cf_olin_s, undefined, {title:LANG.cf_olin_l}),
        bottom:    UC.newBoolean(LANG.cf_botm_s, undefined, {title:LANG.cf_botm_l, show:(op,conf) => conf ? conf.process.camZBottom : 0}),
        filter:    UC.newRow([ UC.newButton(LANG.filter, contourFilter) ], {class:"ext-buttons f-row"})
    };

    createPopOp('lathe', {
        tool:      'camLatheTool',
        spindle:   'camLatheSpindle',
        step:      'camLatheOver',
        angle:     'camLatheAngle',
        rate:      'camLatheSpeed',
        tolerance: 'camTolerance',
        filter:    'camContourFilter',
        leave:     'camContourLeave',
        linear:    'camLatheLinear'
    }).inputs = {
        tool:      UC.newSelect(LANG.cc_tool, {}, "tools"),
        // axis:      UC.newSelect(LANG.cd_axis, {}, "xyaxis"),
        sep:       UC.newBlank({class:"pop-sep"}),
        spindle:   UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:      UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        sep:       UC.newBlank({class:"pop-sep"}),
        step:      UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,100.0)}),
        angle:     UC.newInput(LANG.cc_sang_s, {title:LANG.cc_sang_l, convert:UC.toFloat, bound:UC.bound(0.01,180.0)}),
        sep:       UC.newBlank({class:"pop-sep"}),
        tolerance: UC.newInput(LANG.ou_toll_s, {title:LANG.ou_toll_l, convert:UC.toFloat, bound:UC.bound(0,10.0), units:true, round:4}),
        leave:     UC.newInput(LANG.cf_leav_s, {title:LANG.cf_leav_l, convert:UC.toFloat, bound:UC.bound(0,100)}),
        sep:       UC.newBlank({class:"pop-sep"}),
        linear:    UC.newBoolean(LANG.ci_line_s, undefined, {title:LANG.ci_line_l}),
        // filter:    UC.newRow([ UC.newButton(LANG.filter, contourFilter) ], {class:"ext-buttons f-row"})
    };

    function canDogBones() {
        if (!poppedRec) return false;
        return poppedRec.mode === 'follow';// && poppedRec.offset && poppedRec.offset !== 'none';
    }

    function canDogBonesRev() {
        return canDogBones() && poppedRec.dogbone;
    }

    function zDogSep() {
        return canDogBones() || zBottom();
    }

    createPopOp('trace', {
        mode:    'camTraceType',
        offset:  'camTraceOffset',
        spindle: 'camTraceSpindle',
        tool:    'camTraceTool',
        step:    'camTraceOver',
        down:    'camTraceDown',
        thru:    'camTraceThru',
        rate:    'camTraceSpeed',
        plunge:  'camTracePlunge',
        offover: 'camTraceOffOver',
        dogbone: 'camTraceDogbone',
        revbone: 'camTraceDogbone',
        merge:   'camTraceMerge',
        select:  'camTraceMode',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
    }).inputs = {
        tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
        select:   UC.newSelect(LANG.cc_sele_s, {title:LANG.cc_sele_l}, "select"),
        mode:     UC.newSelect(LANG.cu_type_s, {title:LANG.cu_type_l}, "trace"),
        offset:   UC.newSelect(LANG.cc_offs_s, {title: LANG.cc_offs_l, show:() => (poppedRec.mode === 'follow')}, "traceoff"),
        sep:      UC.newBlank({class:"pop-sep"}),
        spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        plunge:   UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        sep:      UC.newBlank({class:"pop-sep"}),
        step:     UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0), show:(op) => popOp.trace.rec.mode === "clear"}),
        down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
        thru:     UC.newInput(LANG.cc_thru_s, {title:LANG.cc_thru_l, convert:UC.toFloat, units:true}),
        offover:  UC.newInput(LANG.cc_offd_s, {title:LANG.cc_offd_l, convert:UC.toFloat, units:true, show:() => poppedRec.offset !== "none" || poppedRec.mode === "clear"}),
        sep:      UC.newBlank({class:"pop-sep", modes:MCAM, xshow:zDogSep}),
        merge:    UC.newBoolean(LANG.co_merg_s, undefined, {title:LANG.co_merg_l, show:() => !popOp.trace.rec.down}),
        dogbone:  UC.newBoolean(LANG.co_dogb_s, undefined, {title:LANG.co_dogb_l, show:canDogBones}),
        revbone:  UC.newBoolean(LANG.co_dogr_s, undefined, {title:LANG.co_dogr_l, show:canDogBonesRev}),
        exp:      UC.newExpand("overrides"),
        sep:      UC.newBlank({class:"pop-sep"}),
        ov_topz:  UC.newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:UC.toFloat, units:true}),
        ov_botz:  UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, units:true}),
        ov_conv:  UC.newBoolean(LANG.ou_conv_s, undefined, {title:LANG.ou_conv_l}),
        exp_end:  UC.endExpand(),
        sep:      UC.newBlank({class:"pop-sep"}),
        menu:     UC.newRow([ UC.newButton("select", func.traceAdd) ], {class:"ext-buttons f-row"}),
    };

    createPopOp('pocket', {
        spindle:   'camPocketSpindle',
        tool:      'camPocketTool',
        step:      'camPocketOver',
        down:      'camPocketDown',
        rate:      'camPocketSpeed',
        plunge:    'camPocketPlunge',
        expand:    'camPocketExpand',
        smooth:    'camPocketSmooth',
        refine:    'camPocketRefine',
        follow:    'camPocketFollow',
        contour:   'camPocketContour',
        engrave:   'camPocketEngrave',
        outline:   'camPocketOutline',
        ov_topz:   0,
        ov_botz:   0,
        ov_conv:   '~camConventional',
        tolerance: 'camTolerance',
    }).inputs = {
        tool:      UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep:       UC.newBlank({class:"pop-sep"}),
        spindle:   UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:      UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
        plunge:    UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        sep:       UC.newBlank({class:"pop-sep"}),
        step:      UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
        down:      UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true, show:() => !poppedRec.contour}),
        sep:       UC.newBlank({class:"pop-sep"}),
        expand:    UC.newInput(LANG.cp_xpnd_s, {title:LANG.cp_xpnd_l, convert:UC.toFloat, units:true, xshow:() => !poppedRec.contour}),
        refine:    UC.newInput(LANG.cp_refi_s, {title:LANG.cp_refi_l, convert:UC.toInt, show:() => poppedRec.contour}),
        smooth:    UC.newInput(LANG.cp_smoo_s, {title:LANG.cp_smoo_l, convert:UC.toInt}),
        tolerance: UC.newInput(LANG.ou_toll_s, {title:LANG.ou_toll_l, convert:UC.toFloat, bound:UC.bound(0,10.0), units:true, round:4, show:() => poppedRec.contour}),
        follow:    UC.newInput(LANG.cp_foll_s, {title:LANG.cp_foll_l, convert:UC.toFloat}),
        sep:       UC.newBlank({class:"pop-sep"}),
        contour:   UC.newBoolean(LANG.cp_cont_s, undefined, {title:LANG.cp_cont_s}),
        engrave:   UC.newBoolean(LANG.cp_engr_s, undefined, {title:LANG.cp_engr_l, show:() => poppedRec.contour}),
        outline:   UC.newBoolean(LANG.cp_outl_s, undefined, {title:LANG.cp_outl_l}),
        exp:       UC.newExpand("overrides"),
        sep:       UC.newBlank({class:"pop-sep"}),
        ov_topz:   UC.newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:UC.toFloat, units:true}),
        ov_botz:   UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, units:true}),
        ov_conv:   UC.newBoolean(LANG.ou_conv_s, undefined, {title:LANG.ou_conv_l}),
        exp_end:   UC.endExpand(),
        sep:       UC.newBlank({class:"pop-sep"}),
        menu:      UC.newRow([ UC.newButton("select", func.surfaceAdd) ], {class:"ext-buttons f-row"}),
    };

    createPopOp('drill', {
        tool:    'camDrillTool',
        spindle: 'camDrillSpindle',
        down:    'camDrillDown',
        rate:    'camDrillDownSpeed',
        dwell:   'camDrillDwell',
        lift:    'camDrillLift',
        mark:    'camDrillMark'
    }).inputs = {
        tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep:      UC.newBlank({class:"pop-sep"}),
        spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:     UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
        dwell:    UC.newInput(LANG.cd_dwll_s, {title:LANG.cd_dwll_l, convert:UC.toFloat}),
        lift:     UC.newInput(LANG.cd_lift_s, {title:LANG.cd_lift_l, convert:UC.toFloat, units:true, show:() => !poppedRec.mark}),
        mark:     UC.newBoolean(LANG.cd_mark_s, undefined, {title:LANG.cd_mark_l}),
    };

    createPopOp('register', {
        tool:    'camDrillTool',
        spindle: 'camDrillSpindle',
        down:    'camDrillDown',
        rate:    'camDrillDownSpeed',
        dwell:   'camDrillDwell',
        lift:    'camDrillLift',
        feed:    'camRegisterSpeed',
        thru:    'camRegisterThru'
    }).inputs = {
        tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
        axis:     UC.newSelect(LANG.cd_axis, {}, "regaxis"),
        points:   UC.newSelect(LANG.cd_points, {show:() => poppedRec.axis !== '-'}, "regpoints"),
        sep:      UC.newBlank({class:"pop-sep"}),
        spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
        rate:     UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
        feed:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true, show:() => poppedRec.axis === '-'}),
        sep:      UC.newBlank({class:"pop-sep"}),
        down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
        dwell:    UC.newInput(LANG.cd_dwll_s, {title:LANG.cd_dwll_l, convert:UC.toFloat, show:() => poppedRec.axis !== '-'}),
        lift:     UC.newInput(LANG.cd_lift_s, {title:LANG.cd_lift_l, convert:UC.toFloat, units:true, show:() => poppedRec.axis !== '-'}),
        sep:      UC.newBlank({class:"pop-sep"}),
        thru:     UC.newInput(LANG.cd_thru_s, {title:LANG.cd_thru_l, convert:UC.toFloat, units:true}),
    };

    createPopOp('flip', {
        axis:     'camFlipAxis',
        invert:   'camFlipInvert'
    }).inputs = {
        axis:     UC.newSelect(LANG.cd_axis, {}, "regaxis"),
        sep:      UC.newBlank({class:"pop-sep", modes:MCAM, show:zBottom}),
        invert:   UC.newBoolean(LANG.cf_nvrt_s, undefined, {title:LANG.cf_nvrt_l, show:zBottom}),
        sep:      UC.newBlank({class:"pop-sep"}),
        action:   UC.newRow([ UC.newButton(LANG.cf_menu, func.opFlip) ], {class:"ext-buttons f-row"})
    };

    createPopOp('gcode', {
        gcode:  'camCustomGcode',
    }).inputs = {
        action:   UC.newRow([ UC.newButton(LANG.edit, gcodeEditor()) ], {class:"ext-buttons f-row"})
    };

    function angleTowardZUp() {
        api.event.emit('tool.mesh.face-up');
    }

    api.event.on('tool.mesh.face-normal', normal => {
        console.log({ poppedRec });
        poppedRec.degrees = (Math.atan2(normal.y, normal.z) * RAD2DEG).round(2);
        poppedRec.absolute = true;
        func.opRender();
        updateStock();
    });

    createPopOp('index', {
        degrees:  'camIndexAxis',
        absolute: 'camIndexAbs'
    }).inputs = {
        degrees:  UC.newInput(LANG.ci_degr_s, {title:LANG.ci_degr_l, convert:UC.toFloat, bound:UC.bound(-360,360.0) }),
        absolute: UC.newBoolean(LANG.ci_abso_s, undefined, {title:LANG.ci_abso_l}),
        select:   UC.newRow([ UC.newButton(LANG.ci_face_s, angleTowardZUp) ], {class:"ext-buttons f-row"})
    };

    const editEnable = gcodeEditor('Laser Enable Script', 'enable');
    const editOn = gcodeEditor('Laser On Script', 'on');
    const editOff = gcodeEditor('Laser Off Script', 'off');

    createPopOp('laser on', {
        enable:  'camLaserEnable',
        on:      'camLaserOn',
        off:     'camLaserOff',
        power:   'camLaserPower',
        adapt:   'camLaserAdaptive',
        adaptrp: 'camLaserAdaptMod',
        flat:    'camLaserFlatten',
        flatz:   'camLaserFlatZ',
        minp:    'camLaserPowerMin',
        maxp:    'camLaserPowerMax',
        minz:    'camLaserZMin',
        maxz:    'camLaserZMax',
    }).inputs = {
        enable:  UC.newRow([ UC.newButton(LANG.enable, editEnable) ], {class:"ext-buttons f-row"}),
        on:      UC.newRow([ UC.newButton(LANG.on, editOn) ], {class:"ext-buttons f-row"}),
        off:     UC.newRow([ UC.newButton(LANG.off, editOff) ], {class:"ext-buttons f-row"}),
        sep:     UC.newBlank({class:"pop-sep"}),
        power:   UC.newInput(LANG.cl_powr_s, {title:LANG.cl_powr_l, convert:UC.toFloat, bound:UC.bound(0,1.0), show:() => !poppedRec.adapt}),
        maxp:    UC.newInput(LANG.cl_maxp_s, {title:LANG.cl_maxp_l, convert:UC.toFloat, bound:UC.bound(0,1.0), show:() => poppedRec.adapt}),
        minp:    UC.newInput(LANG.cl_minp_s, {title:LANG.cl_minp_l, convert:UC.toFloat, bound:UC.bound(0,1.0), show:() => poppedRec.adapt}),
        maxz:    UC.newInput(LANG.cl_maxz_s, {title:LANG.cl_maxz_l, convert:UC.toFloat, show:() => poppedRec.adapt}),
        minz:    UC.newInput(LANG.cl_minz_s, {title:LANG.cl_minz_l, convert:UC.toFloat, show:() => poppedRec.adapt}),
        flatz:   UC.newInput(LANG.cl_flaz_s, {title:LANG.cl_flaz_l, convert:UC.toFloat, show:() => poppedRec.flat}),
        sep:     UC.newBlank({class:"pop-sep"}),
        adapt:   UC.newBoolean(LANG.cl_adap_s, undefined, {title:LANG.cl_adap_l}),
        adaptrp: UC.newBoolean(LANG.cl_adrp_s, undefined, {title:LANG.cl_adrp_l, show:() => poppedRec.adapt}),
        flat:    UC.newBoolean(LANG.cl_flat_s, undefined, {title:LANG.cl_flat_l }),
    };

    const editDisable = gcodeEditor('Laser Disable Script', 'disable');

    createPopOp('laser off', {
        disable: 'camLaserDisable',
    }).inputs = {
        disable: UC.newRow([ UC.newButton(LANG.disable, editDisable) ], {class:"ext-buttons f-row"}),
    };

    createPopOp('|', {}).inputs = {};
};

function createPopOp(type, map) {
    let op = popOp[type] = {
        div: UC.newElement('div', { id:`${type}-op`, class:"cam-pop-op" }),
        use: (rec) => {
            op.rec = rec;
            for (let [key, val] of Object.entries(op.inputs)) {
                let type = val.type;
                let from = map[key];
                let rval = rec[key];
                // fill undef entries older defines
                if (type && (rval === null || rval === undefined)) {
                    if (typeof(from) === 'string') {
                        rec[key] = current.process[from];
                    } else if (from !== undefined) {
                        rec[key] = from;
                    } else {
                        console.log('error', { key, val, type, from });
                    }
                }
            }
            API.util.rec2ui(rec, op.inputs);
            op.hideshow();
        },
        using: (rec) => {
            return op.rec === rec;
        },
        bind: (ev) => {
            API.util.ui2rec(op.rec, op.inputs);
            for (let [key, val] of Object.entries(op.rec)) {
                let saveTo = map[key];
                if (saveTo && typeof(key) === 'string' && !key.startsWith("~")) {
                    current.process[saveTo] = val;
                }
            }
            API.conf.save();
            op.hideshow();
        },
        new: () => {
            let rec = { type };
            for (let [key, src] of Object.entries(map)) {
                rec[key] = typeof(src) === 'string'
                    ? current.process[src.replace('~','')]
                    : src;
            }
            return rec;
        },
        hideshow: () => {
            for (let inp of Object.values(op.inputs)) {
                let parent = inp.parentElement;
                if (parent && parent.setVisible && parent.__opt.show) {
                    parent.setVisible(parent.__opt.show(op, API.conf.get()));
                }
            }
        },
        addNote: () => {
            if (!op.note && type !== 'flip') {
                const divid = `div-${++seed}`;
                const noteid = `note-${++seed}`;
                const div = document.createElement('div');
                div.setAttribute('id', divid);
                div.classList.add('pop-tics')
                op.div.appendChild(div);
                div.innerHTML = h.build(
                    h.div([ h.label({ id: noteid }) ])
                );
                op.note = { divid, noteid };
            }
            if (op.note) {
                const { divid, noteid } = op.note;
                const div = $(divid);
                if (div) div.onclick = () => {
                    API.uc.prompt('Edit Note for Operation', poppedRec.note || '').then(note => {
                        if (note !== undefined && note !== null) {
                            poppedRec.note = op.x = note;
                            API.conf.save();
                        }
                        func.opRender();
                    });
                };
                const note = $(noteid);
                if (note) note.innerText = poppedRec.note || '';
            }
        },
        group: [],
    };

    UC.restore({
        addTo: op.div,
        bindTo: op.bind,
        lastDiv: op.div,
        lastGroup: op.group
    });
    return op;
}

function createTabBox(iw, ic, n) {
    const { track } = iw;
    const { stock, bounds, process } = API.conf.get();
    const { camTabsWidth, camTabsHeight, camTabsDepth, camTabsMidline } = process;
    const { camZBottom, camStockIndexed } = process;
    const isIndexed = camStockIndexed;
    const sz = stock.z || bounds.max.z;
    const zto = sz - iw.track.top;
    const zp = (camZBottom || isIndexed ? camZBottom : sz - track.box.d - zto) + (camTabsMidline ? 0 : camTabsHeight / 2);
    ic.x += n.x * camTabsDepth / 2; // offset from part
    ic.z -= n.y * camTabsDepth / 2; // offset swap z,y
    ic.y = zp; // offset swap in world space y,z
    const rot = new THREE.Quaternion().setFromAxisAngle(zaxis, Math.atan2(n.y, n.x));
    const pos = { x:ic.x, y:ic.y, z:ic.z };
    const dim = { x:camTabsDepth, y:camTabsWidth, z:camTabsHeight };
    const tab = addbox(pos, boxColor(), 'tabb', dim, { rotate: rot, opacity: boxOpacity() });
    return { pos, dim, rot, tab, width: camTabsWidth, height: camTabsHeight, stock };
}

function addWidgetTab(widget, rec) {
    const { pos, dim, rot, id } = rec;
    const tabs = widget.tabs = (widget.tabs || {});
    // prevent duplicate restore from repeated settings load calls
    if (!tabs[id]) {
        pos.box = addbox(
            pos, boxColor(), id,
            dim, { group: widget.mesh, rotate: rot, opacity: boxOpacity() }
        );
        pos.box.tab = Object.assign({widget, id}, pos);
        widget.adds.push(pos.box);
        tabs[id] = pos;
    }
}

function restoreTabs(widgets) {
    widgets.forEach(widget => {
        const tabs = API.widgets.annotate(widget.id).tab || [];
        tabs.forEach(rec => {
            let [ x, y, z, w ] = rec.rot;
            rec = Object.clone(rec);
            rec.rot = new THREE.Quaternion(x, y, z, w);
            addWidgetTab(widget, rec);
        });
    });
}

function clearTabs(widget, skiprec) {
    Object.values(widget.tabs || {}).forEach(rec => {
        widget.adds.remove(rec.box);
        widget.mesh.remove(rec.box);
    });
    widget.tabs = {};
    if (!skiprec) {
        delete API.widgets.annotate(widget.id).tab;
    }
}

function updateTabs() {
    // update tab color and opacity
    API.widgets.all().forEach(widget => {
        Object.values(widget.tabs || {}).forEach(rec => {
            for (let rec of widget.adds || []) {
                rec.material.color = new THREE.Color(boxColor());
                rec.material.opacity = boxOpacity();
            }
        });
    });
}

function unselectTraces(widget, skip) {
    if (widget.trace_stack) {
        widget.trace_stack.meshes.forEach(mesh => {
            if (mesh.selected) {
                func.traceToggle(mesh, skip);
            }
        });
    }
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

function addbox() { return FDM.addbox(...arguments)};

function delbox() { return FDM.delbox(...arguments)};

function boxColor() {
    return API.space.is_dark() ? 0x00ddff : 0x0000dd;
}

function boxOpacity() {
    return API.space.is_dark() ? 0.75 : 0.6;
}

function animate() {
    isAnimate = true;
    API.widgets.opacity(isParsed ? 0 : 0.75);
    API.hide.slider();
    STACKS.clear();
    animFn().animate(API);
    API.view.set_animate();
}

function updateStock() {
    if (isAnimate) {
        if (isIndexed) {
            SPACE.world.remove(camStock);
            camStock = undefined;
        }
        return;
    }

    if (!isCamMode) {
        SPACE.world.remove(camZTop);
        SPACE.world.remove(camZBottom);
        SPACE.world.remove(camStock);
        camStock = null;
        camZTop = null;
        camZBottom = null;
        return;
    }

    const settings = API.conf.get();
    const widgets = API.widgets.all();

    const { stock, process } = settings;
    const { x, y, z, center } = stock;

    UI.func.animate.classList.add('disabled');
    if (x && y && z) {
        UI.func.animate.classList.remove('disabled');
        if (!camStock) {
            let geo = new THREE.BoxGeometry(1, 1, 1);
            let mat = new THREE.MeshBasicMaterial({
                color: 0x777777,
                opacity: 0.05,
                transparent: true,
                side:THREE.DoubleSide
            });
            camStock = new THREE.Mesh(geo, mat);
            camStock.renderOrder = 2;

            let lo = 0.5;
            let lidat = [
                 lo, lo, lo,  lo, lo,-lo,
                 lo, lo, lo,  lo,-lo, lo,
                 lo, lo, lo, -lo, lo, lo,
                -lo,-lo,-lo, -lo,-lo, lo,
                -lo,-lo,-lo, -lo, lo,-lo,
                -lo,-lo,-lo,  lo,-lo,-lo,
                 lo, lo,-lo, -lo, lo,-lo,
                 lo, lo,-lo,  lo,-lo,-lo,
                 lo,-lo,-lo,  lo,-lo, lo,
                 lo,-lo, lo, -lo,-lo, lo,
                -lo,-lo, lo, -lo, lo, lo,
                -lo, lo, lo, -lo, lo,-lo
            ];
            let ligeo = new THREE.BufferGeometry();
            ligeo.setAttribute('position', new THREE.BufferAttribute(lidat.toFloat32(), 3));
            let limat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
            let lines = new THREE.LineSegments(ligeo, limat);
            camStock.lines = lines;
            camStock.add(lines);

            SPACE.world.add(camStock);
        }
        camStock.scale.x = x + 0.005;
        camStock.scale.y = y + 0.005;
        camStock.scale.z = z + 0.005;
        camStock.position.x = center.x;
        camStock.position.y = center.y;
        camStock.position.z = center.z;
        camStock.rotation.x = currentIndex || 0;
        camStock.lines.material.color =
            new THREE.Color(API.space.is_dark() ? 0x555555 : 0xaaaaaa);
    } else if (camStock) {
        SPACE.world.remove(camStock);
        camStock = null;
    }

    SPACE.world.remove(camZTop);
    if (process.camZTop && widgets.length) {
        let max = { x, y, z };
        for (let w of widgets) {
            max.x = Math.max(max.x, w.track.box.w);
            max.y = Math.max(max.y, w.track.box.h);
            max.z = Math.max(max.z, w.track.box.d);
        }
        let geo = new THREE.PlaneGeometry(max.x, max.y);
        let mat = new THREE.MeshBasicMaterial({
            color: 0x777777,
            opacity: 0.55,
            transparent: true,
            side:THREE.DoubleSide
        });
        camZTop = new THREE.Mesh(geo, mat);
        camZTop._max = max;
        camZTop.renderOrder = 1;
        camZTop.position.x = center.x;
        camZTop.position.y = center.y;
        camZTop.position.z = process.camZTop;
        SPACE.world.add(camZTop);
    } else {
        camZTop = undefined;
    }

    SPACE.world.remove(camZBottom);
    if (process.camZBottom && widgets.length) {
        let max = { x, y, z };
        for (let w of widgets) {
            max.x = Math.max(max.x, w.track.box.w);
            max.y = Math.max(max.y, w.track.box.h);
            max.z = Math.max(max.z, w.track.box.d);
        }
        let geo = new THREE.PlaneGeometry(max.x, max.y);
        let mat = new THREE.MeshBasicMaterial({
            color: 0x777777,
            opacity: 0.55,
            transparent: true,
            side:THREE.DoubleSide
        });
        camZBottom = new THREE.Mesh(geo, mat);
        camZBottom._max = max;
        camZBottom.renderOrder = 1;
        camZBottom.position.x = center.x;
        camZBottom.position.y = center.y;
        camZBottom.position.z = process.camZBottom;
        SPACE.world.add(camZBottom);
    } else {
        camZBottom = undefined;
    }

    SPACE.update();
}

});
