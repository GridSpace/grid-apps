/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        newPolygon = BASE.newPolygon,
        newPoint = BASE.newPoint,
        isAnimate,
        isArrange,
        isCamMode,
        isParsed,
        camStock,
        current,
        poppedRec,
        hoveredOp,
        API, FDM, SPACE, STACKS, MODES, VIEWS, UI, UC, LANG;

    let zaxis = { x: 0, y: 0, z: 1 },
        popOp = {},
        func = {},
        flipping;

    CAM.restoreTabs = restoreTabs;

    CAM.init = function(kiri, api) {
        FDM = KIRI.driver.FDM;

        // console.log({kiri,api})
        STACKS = api.const.STACKS;
        SPACE = api.const.SPACE;
        MODES = api.const.MODES;
        VIEWS = api.const.VIEWS;
        LANG = api.const.LANG;
        UI = api.ui;
        UC = api.uc;
        API = api;

        // wire up animate button in ui
        api.event.on("function.animate", (mode) => {
            if (isAnimate) {
                return;
            }
            if (isCamMode && !camStock) {
                return api.show.alert("animation requires stock to be enabled");
            }
            api.function.prepare(() => {
                if (isCamMode && camStock) {
                    animate();
                }
            });
        });

        api.event.on("mode.set", (mode) => {
            isCamMode = mode === 'CAM';
            $('set-tools').style.display = isCamMode ? '' : 'none';
            kiri.space.platform.setColor(isCamMode ? 0xeeeeee : 0xcccccc);
            updateStock(undefined, 'internal');
            UI.func.animate.style.display = isCamMode ? '' : 'none';
            if (!isCamMode) {
                func.tabClear();
                func.traceDone();
                UI.label.slice.innerText = LANG.slice;
                UI.label.preview.innerText = LANG.preview;
                UI.label.export.innerText = LANG.export;
            } else {
                UI.label.slice.innerText = LANG.start;
            }
            // do not persist traces across page reloads
            func.traceClear();
            func.opRender();
        });

        api.event.on("view.set", (mode) => {
            isArrange = (mode === VIEWS.ARRANGE);
            isAnimate = false;
            CAM.animate_clear(api);
            func.tabDone();
            func.traceDone();
            func.opRender();
        });

        api.event.on("settings.saved", (settings) => {
            current = settings;
            let proc = settings.process;
            let hasTabs = false;
            let hasTraces = false;
            if (isCamMode && proc.ops) {
                proc.ops = proc.ops.filter(v => v);
            }
            // for any tabs or traces to set markers
            Object.keys(settings.widget).forEach(wid => {
                let wannot = settings.widget[wid];
                if (wannot.tab && wannot.tab.length) hasTabs = true;
                if (wannot.trace && wannot.trace.length) hasTraces = true;
            });
            // show/hide dots in enabled process pop buttons
            api.ui.camTabs.marker.style.display = hasTabs ? 'flex' : 'none';
            api.ui.camStock.marker.style.display = proc.camStockOn ? 'flex' : 'none';
            updateStock(settings, 'settings.saved.internal');
        });

        api.event.on("settings.load", (settings) => {
            func.opRender();
            if (!isCamMode) return;
            restoreTabs(api.widgets.all());
        });

        api.event.on([
            "init-done",
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

        api.event.on("preview.end", () => {
            isParsed = false;
            if (isCamMode && camStock) {
                STACKS.getStack("bounds").button("animate", animate);
            }
        });

        api.event.on("code.loaded", (info) => {
            if (isCamMode && camStock) {
                isParsed = true;
                STACKS.getStack("parse", SPACE.platform.world).button("animate", animate);
            }
        });

        $('op-add').onmouseenter = () => {
            if (func.unpop) func.unpop();
        };

        $('op-add-list').onclick = (ev) => {
            let settings = API.conf.get();
            let { process, device } = settings;
            switch (ev.target.innerText) {
                case "level": return func.opAddLevel();
                case "rough": return func.opAddRough();
                case "outline": return func.opAddOutline();
                case "contour":
                    let oplist = current.process.ops, axis = "X";
                    for (let op of oplist) {
                        if (op.type === "contour" && op.axis === "X") {
                            axis = "Y";
                        }
                    }
                    return func.opAddContour(axis);
                case "register": return func.opAddRegister('X', 2);
                case "drill": return func.opAddDrill();
                case "trace": return func.opAddTrace();
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

        func.opAddLevel = () => {
            func.opAdd(popOp.level.new());
        };

        func.opAddRough = () => {
            func.opAdd(popOp.rough.new());
        };

        func.opAddOutline = () => {
            func.opAdd(popOp.outline.new());
        };

        func.opAddContour = (axis) => {
            let rec = popOp.contour.new();
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
            let oplist = current.process.ops;
            if (oplist.indexOf(rec) < 0) {
                oplist.push(rec);
                API.conf.save();
                func.opRender();
            }
        });

        api.event.on("cam.op.del", func.opDel = (rec) => {
            if (!isCamMode) return;
            let oplist = current.process.ops;
            let pos = oplist.indexOf(rec);
            if (pos >= 0) {
                oplist.splice(pos,1);
                API.conf.save();
                func.opRender();
            }
        });

        api.event.on("cam.op.render", func.opRender = () => {
            $('camops').style.display = isCamMode && isArrange ? 'flex' : '';
            let oplist = current.process.ops;
            if (!(isCamMode && oplist)) return;
            let mark = Date.now();
            let html = [];
            $('ophint').style.display = oplist.length === 0 ? '' : 'none';
            let bind = {};
            let scale = API.view.unit_scale();
            oplist.forEach((rec,i) => {
                html.appendAll([
                    `<div id="${mark+i}" class="draggable">`,
                    `<label class="label">${rec.type}</label>`,
                    `<label id="${mark+i}-x" class="del"><i class="fas fa-times"></i></label>`,
                    `</div>`
                ]);
                bind[mark+i] = rec;
            });
            let listel = $('oplist');
            listel.innerHTML = html.join('');
            let bounds = [];
            let unpop = null;
            // drag and drop re-ordering
            for (let [id, rec] of Object.entries(bind)) {
                $(`${id}-x`).onmousedown = (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    func.traceDone();
                    func.tabDone();
                    func.opDel(rec);
                };
                let el = $(id);
                bounds.push(el);
                let timer = null;
                let inside = true;
                let poprec = popOp[rec.type];
                el.unpop = () => {
                    let pos = [...el.childNodes].indexOf(poprec.div);
                    if (pos >= 0) {
                        el.removeChild(poprec.div);
                    }
                };
                el.onmouseenter = (ev) => {
                    if (unpop) unpop();
                    unpop = func.unpop = el.unpop;
                    inside = true;
                    // pointer to current rec for trace editing
                    poppedRec = rec;
                    poprec.use(rec);
                    hoveredOp = el;
                    el.appendChild(poprec.div);
                    // option click event appears latent
                    // and overides the sticky settings
                    setTimeout(() => {
                        UC.setSticky(false);
                    }, 0);
                };
                el.onmouseleave = () => {
                    inside = false;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (!inside && poprec.using(rec) && !UC.isSticky()) {
                            el.unpop();
                        }
                    }, 250);
                };
                el.rec = rec;
                el.onmousedown = (ev) => {
                    func.traceDone();
                    let target = ev.target, clist = target.classList;
                    if (!clist.contains("draggable")) {
                        return;
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
                    };
                    tracker.onmousemove = (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        if (ev.buttons === 0) {
                            return cancel();
                        }
                        for (let el of bounds) {
                            if (el === target) continue;
                            let rect = el.getBoundingClientRect();
                            let left = rect.left;
                            let right = rect.left + rect.width;
                            if (ev.pageX >= left && ev.pageX <= right) {
                                let mid = (left + right) / 2;
                                try { listel.removeChild(target); } catch (e) { }
                                el.insertAdjacentElement(ev.pageX < mid ? "beforebegin" : "afterend", target);
                            }
                        }
                    };
                };
            }
        });

        func.opFlip = () => {
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
                    let { rot } = tab;
                    let qat = new THREE.Quaternion(rot._x, rot._y, rot._z, rot._w);
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
            flipping = false;
            process.ops = op2;
            process.op2 = ops;
            // special case, auto-adjust camZBottom
            if (process.camZBottom && widgets.length === 1) {
                process.camZBottom = widgets[0].bounds.max.z - process.camZBottom;
                API.util.rec2ui(process);
            }
            for (let op of op2) {
                if (op.type === 'flip') {
                    op.axis = poppedRec.axis;
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
            if (Math.abs(n.z) > 0.1) {
                return;
            }
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
                return;
            }
            if (!iw) return;
            let ip = iw.track.pos;
            let wa = api.widgets.annotate(iw.id);
            let wt = (wa.tab = wa.tab || []);
            let pos = {
                x: showTab.pos.x - ip.x,
                y: -showTab.pos.z - ip.y,
                z: showTab.pos.y + ip.z,
            }
            let id = Date.now();
            let { dim, rot } = showTab;
            let rec = { pos, dim, rot, id };
            wt.push(Object.clone(rec));
            addWidgetTab(iw, rec);
            API.conf.save();
        };

        // TRACE FUNCS
        let traceOn = false, lastTrace;
        func.traceAdd = (ev) => {
            func.unpop();
            func.tabDone();
            func.traceDone();
            alert = api.show.alert("analyzing parts...", 1000);
            traceOn = hoveredOp;
            traceOn.classList.add("editing");
            CAM.traces((ids) => {
                api.hide.alert(alert);
                alert = api.show.alert("[esc] cancels trace editing");
                KIRI.api.widgets.opacity(0.8);
                KIRI.api.widgets.for(widget => {
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
                    let stack = new KIRI.Stack(widget.mesh);
                    widget.trace_stack = stack;
                    widget.traces.forEach(poly => {
                        let match = areas.filter(arr => poly.matches(arr));
                        let layers = new KIRI.Layers();
                        layers.setLayer("trace", {line: 0xaaaa55}, false).addPoly(poly);
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
                KIRI.api.widgets.for(widget => {
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
            }, poppedRec.single);
            api.feature.hover = true;
            api.feature.hoverAdds = true;
            func.hover = func.traceHover;
            func.hoverUp = func.traceHoverUp;
        };
        func.traceDone = () => {
            if (!traceOn) {
                return;
            }
            func.unpop();
            traceOn.classList.remove("editing");
            traceOn = false;
            KIRI.api.widgets.opacity(1);
            api.hide.alert(alert);
            api.feature.hover = false;
            api.feature.hoverAdds = false;
            KIRI.api.widgets.for(widget => {
                if (widget.trace_stack) {
                    widget.trace_stack.hide();
                    widget.adds.removeAll(widget.trace_stack.meshes);
                }
            });
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
                let { color, colorSave } = lastTrace.material[0];
                color.r = colorSave.r;
                color.g = colorSave.g;
                color.b = colorSave.b;
                lastTrace.position.z -= 0.05;
            }
            if (data.type === 'platform') {
                lastTrace = null;
                return;
            }
            if (!data.int.object.trace) {
                return;
            }
            lastTrace = data.int.object;
            lastTrace.position.z += 0.05;
            if (lastTrace.selected) {
                let event = data.event;
                let target = event.target;
                let { clientX, clientY } = event;
                let { offsetWidth, offsetHeight } = target;
            }
            let material = lastTrace.material[0];
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
                    if (add.selected !== selected && add.trace.poly.getZ() === poly.getZ()) {
                        func.traceToggle(add);
                    }
                }
            }
        };
        func.traceToggle = function(obj, skip) {
            let material = obj.material[0];
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
                obj.position.z += 0.05;
                color.r = colorSave.r = 0.9;
                color.g = colorSave.g = 0;
                color.b = colorSave.b = 0.1;
                if (!skip) wlist.push(poly._trace);
            } else {
                obj.position.z -= 0.05;
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
                func.tabDone();
                func.traceDone();
            }
        });
        api.event.on("key.esc", () => {
            if (isCamMode) {
                func.tabDone();
                func.traceDone();
            }
        });
        api.event.on("selection.scale", () => {
            if (isCamMode) {
                func.tabClear();
                func.traceClear();
            }
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

        function rotateTabs(widget, x, y, z) {
            let tabs = API.widgets.annotate(widget.id).tab || [];
            tabs.forEach(rec => {
                let { id, pos, rot } = rec;
                let coff = widget.track.center;
                let tab = widget.tabs[id];
                let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
                // update position vector
                let vc = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(m4);
                // update rotation quaternion
                rec.rot = new THREE.Quaternion().multiplyQuaternions(
                    new THREE.Quaternion(rot._x, rot._y, rot._z, rot._w),
                    new THREE.Quaternion().setFromRotationMatrix(m4)
                );
                tab.box.geometry.applyMatrix4(m4);
                tab.box.position.x = pos.x = vc.x - coff.dx;
                tab.box.position.y = pos.y = vc.y - coff.dy;
                tab.box.position.z = pos.z = vc.z;
            });
            SPACE.update();
        }

        function hasSpindle() {
            return current.device.spindleMax > 0;
        }

        createPopOp('level', {
            tool:    'camLevelTool',
            spindle: 'camLevelSpindle',
            step:    'camLevelOver',
            rate:    'camLevelSpeed',
            down:    'camLevelDown'
        }).inputs = {
            tool:    UC.newSelect(LANG.cc_tool, {}, "tools"),
            sep:     UC.newBlank({class:"pop-sep"}),
            spindle: UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            step:    UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
            rate:    UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
            down:    UC.newInput(LANG.cc_loff_s, {title:LANG.cc_loff_l, convert:UC.toFloat, units:true}),
        };

        createPopOp('rough', {
            tool:    'camRoughTool',
            spindle: 'camRoughSpindle',
            down:    'camRoughDown',
            step:    'camRoughOver',
            rate:    'camRoughSpeed',
            plunge:  'camRoughPlunge',
            leave:   'camRoughStock',
            voids:   'camRoughVoid',
            flats:   'camRoughFlat',
            inside:  'camRoughIn',
            top:     'camRoughTop'
        }).inputs = {
            tool:    UC.newSelect(LANG.cc_tool, {}, "tools"),
            sep:     UC.newBlank({class:"pop-sep"}),
            spindle: UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            down:    UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
            step:    UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
            rate:    UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
            plunge:  UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
            leave:   UC.newInput(LANG.cr_lsto_s, {title:LANG.cr_lsto_l, convert:UC.toFloat, units:true}),
            sep:     UC.newBlank({class:"pop-sep"}),
            voids:   UC.newBoolean(LANG.cr_clrp_s, undefined, {title:LANG.cr_clrp_l}),
            flats:   UC.newBoolean(LANG.cr_clrf_s, undefined, {title:LANG.cr_clrf_l}),
            top:     UC.newBoolean(LANG.cr_clrt_s, undefined, {title:LANG.cr_clrt_l}),
            inside:  UC.newBoolean(LANG.cr_olin_s, undefined, {title:LANG.cr_olin_l})
        };

        createPopOp('outline', {
            tool:     'camOutlineTool',
            spindle:  'camOutlineSpindle',
            step:     'camOutlineOver',
            down:     'camOutlineDown',
            rate:     'camOutlineSpeed',
            plunge:   'camOutlinePlunge',
            dogbones: 'camOutlineDogbone',
            omitthru: 'camOutlineOmitThru',
            outside:  'camOutlineOut',
            inside:   'camOutlineIn',
            wide:     'camOutlineWide'
        }).inputs = {
            tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
            sep:      UC.newBlank({class:"pop-sep"}),
            spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
            step:     UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0), show:() => popOp.outline.rec.wide}),
            rate:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
            plunge:   UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
            sep:      UC.newBlank({class:"pop-sep"}),
            dogbones: UC.newBoolean(LANG.co_dogb_s, undefined, {title:LANG.co_dogb_l, show:(op) => { return !op.inputs.wide.checked }}),
            inside:   UC.newBoolean(LANG.co_olin_s, undefined, {title:LANG.co_olin_l, show:(op) => { return !op.inputs.outside.checked }}),
            outside:  UC.newBoolean(LANG.co_olot_s, undefined, {title:LANG.co_olot_l, show:(op) => { return !op.inputs.inside.checked }}),
            omitthru: UC.newBoolean(LANG.co_omit_s, undefined, {title:LANG.co_omit_l, xshow:(op) => { return op.inputs.outside.checked }}),
            wide:     UC.newBoolean(LANG.co_wide_s, undefined, {title:LANG.co_wide_l, show:(op) => { return !op.inputs.inside.checked }})
        };

        createPopOp('contour', {
            tool:      'camContourTool',
            spindle:   'camContourSpindle',
            step:      'camContourOver',
            rate:      'camContourSpeed',
            angle:     'camContourAngle',
            tolerance: 'camTolerance',
            curves:    'camContourCurves',
            inside:    'camContourIn',
            axis:      'X'
        }).inputs = {
            tool:      UC.newSelect(LANG.cc_tool, {}, "tools"),
            axis:      UC.newSelect(LANG.cd_axis, {}, "regaxis"),
            sep:       UC.newBlank({class:"pop-sep"}),
            spindle:   UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            step:      UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0)}),
            rate:      UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
            angle:     UC.newInput(LANG.cf_angl_s, {title:LANG.cf_angl_l, convert:UC.toFloat, bound:UC.bound(45,90)}),
            tolerance: UC.newInput(LANG.ou_toll_s, {title:LANG.ou_toll_l, convert:UC.toFloat, bound:UC.bound(0,10.0), units:true}),
            sep:       UC.newBlank({class:"pop-sep"}),
            curves:    UC.newBoolean(LANG.cf_curv_s, undefined, {title:LANG.cf_curv_l}),
            inside:    UC.newBoolean(LANG.cf_olin_s, undefined, {title:LANG.cf_olin_l})
        };

        createPopOp('trace', {
            mode:    'camTraceType',
            offset:  'camTraceOffset',
            spindle: 'camTraceSpindle',
            tool:    'camTraceTool',
            step:    'camTraceOver',
            down:    'camTraceDown',
            rate:    'camTraceSpeed',
            plunge:  'camTracePlunge',
            single:  'camTraceLines',
        }).inputs = {
            tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
            sep:      UC.newBlank({class:"pop-sep"}),
            mode:     UC.newSelect(LANG.cu_type_s, {title:LANG.cu_type_l}, "trace"),
            offset:   UC.newSelect(LANG.cc_offs_s, {title: LANG.cc_offs_l, show:() => (poppedRec.mode === 'follow')}, "traceoff"),
            spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            step:     UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.01,1.0), show:(op) => popOp.trace.rec.mode === "clear"}),
            down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
            rate:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true}),
            plunge:   UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
            sep:      UC.newBlank({class:"pop-sep"}),
            single:   UC.newBoolean(LANG.cc_sngl_s, undefined, {title:LANG.cc_sngl_l}),
            select: UC.newRow([
                UC.newButton(undefined, func.traceAdd, {icon:'<i class="fas fa-plus"></i>'}),
                UC.newButton(undefined, func.traceDone, {icon:'<i class="fas fa-check"></i>'}),
            ], {class:"ext-buttons f-row"}),
        };

        createPopOp('drill', {
            tool:    'camDrillTool',
            spindle: 'camDrillSpindle',
            down:    'camDrillDown',
            rate:    'camDrillDownSpeed',
            dwell:   'camDrillDwell',
            lift:    'camDrillLift'
        }).inputs = {
            tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
            sep:      UC.newBlank({class:"pop-sep"}),
            spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
            rate:     UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
            dwell:    UC.newInput(LANG.cd_dwll_s, {title:LANG.cd_dwll_l, convert:UC.toFloat}),
            lift:     UC.newInput(LANG.cd_lift_s, {title:LANG.cd_lift_l, convert:UC.toFloat, units:true})
        };

        createPopOp('register', {
            tool:    'camDrillTool',
            spindle: 'camDrillSpindle',
            down:    'camDrillDown',
            rate:    'camDrillDownSpeed',
            dwell:   'camDrillDwell',
            lift:    'camDrillLift',
            feed:    'camRegisterSpeed',
        }).inputs = {
            tool:     UC.newSelect(LANG.cc_tool, {}, "tools"),
            axis:     UC.newSelect(LANG.cd_axis, {}, "regaxis"),
            points:   UC.newSelect(LANG.cd_points, {show:() => poppedRec.axis !== '-'}, "regpoints"),
            sep:      UC.newBlank({class:"pop-sep"}),
            spindle:  UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, show:hasSpindle}),
            feed:     UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, units:true, show:() => poppedRec.axis === '-'}),
            down:     UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, units:true}),
            rate:     UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, units:true}),
            dwell:    UC.newInput(LANG.cd_dwll_s, {title:LANG.cd_dwll_l, convert:UC.toFloat, show:() => poppedRec.axis !== '-'}),
            lift:     UC.newInput(LANG.cd_lift_s, {title:LANG.cd_lift_l, convert:UC.toFloat, units:true, show:() => poppedRec.axis !== '-'})
        };

        createPopOp('flip', {
            axis:     'camFlipAxis'
        }).inputs = {
            axis:     UC.newSelect(LANG.cd_axis, {}, "regaxis"),
            sep:      UC.newBlank({class:"pop-sep"}),
            action:   UC.newRow([
                UC.newButton(LANG.cc_flip, func.opFlip)
            ], {class:"ext-buttons f-row"})
        };
    };

    function createPopOp(type, map) {
        let op = popOp[type] = {
            div: UC.newElement('div', { id:`${type}-op`, class:"cam-pop-op" }),
            use: (rec) => {
                op.rec = rec;
                for (let [key, val] of Object.entries(op.inputs)) {
                    let type = val.type;
                    let from = map[key];
                    if (rec[key] === undefined && type && from) {
                        let newval = current.process[from];
                        rec[key] = current.process[from];
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
                    if (saveTo) {
                        current.process[saveTo] = val;
                    }
                }
                API.conf.save();
                op.hideshow();
            },
            new: () => {
                let rec = { type };
                for (let [key, val] of Object.entries(map)) {
                    rec[key] = current.process[val];
                }
                return rec;
            },
            hideshow: () => {
                for (let inp of Object.values(op.inputs)) {
                    let parent = inp.parentElement;
                    if (parent.setVisible && parent.__opt.show) {
                        parent.setVisible(parent.__opt.show(op));
                    }
                }
            },
            group: []
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
        const sz = stock.z || bounds.max.z;
        const zto = sz - iw.track.top;
        const zp = sz - track.box.d + process.camZBottom - zto + (camTabsMidline ? 0 : camTabsHeight / 2);
        ic.x += n.x * camTabsDepth / 2; // offset from part
        ic.z -= n.y * camTabsDepth / 2; // offset swap z,y
        ic.y = zp; // offset swap in world space y,z
        const rot = new THREE.Quaternion().setFromAxisAngle(zaxis, Math.atan2(n.y, n.x));
        const pos = { x:ic.x, y:ic.y, z:ic.z };
        const dim = { x:camTabsDepth, y:camTabsWidth, z:camTabsHeight };
        const tab = addbox(pos, 0x0000dd, 'tabb', dim, { rotate: rot });
        return { pos, dim, rot, tab, width: camTabsWidth, height: camTabsHeight };
    }

    function addWidgetTab(widget, rec) {
        const { pos, dim, rot, id } = rec;
        const tabs = widget.tabs = (widget.tabs || {});
        // prevent duplicate restore from repeated settings load calls
        if (!tabs[id]) {
            pos.box = addbox(
                pos, 0x0000dd, id,
                dim, { group: widget.mesh, rotate: rot }
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
                rec = Object.clone(rec);
                rec.rot = new THREE.Quaternion(rec.rot._x ,rec.rot._y, rec.rot._z, rec.rot._w);
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

    function unselectTraces(widget, skip) {
        if (widget.trace_stack) {
            widget.trace_stack.meshes.forEach(mesh => {
                if (mesh.selected) {
                    func.traceToggle(mesh, skip);
                }
            });
        }
    }

    function addbox() { return FDM.addbox(...arguments)};
    function delbox() { return FDM.delbox(...arguments)};

    function animate() {
        isAnimate = true;
        API.widgets.opacity(isParsed ? 0 : 0.75);
        API.hide.slider();
        STACKS.clear();
        CAM.animate(API);
    }

    function updateStock(args, event) {
        if (isAnimate) {
            return;
        }

        STACKS.remove('bounds');
        if (isCamMode && isArrange) {
            STACKS.clear();
        }

        if (!isCamMode) {
            if (camStock) {
                SPACE.platform.remove(camStock);
                camStock = null;
            }
            return;
        }

        const refresh = (event === "selection.scale" || event === 'selection.rotate');

        let settings = API.conf.get();
        let widgets = API.widgets.all();
        let proc = settings.process;
        let enabled = UI.camStockOn.checked;
        let offset = UI.camStockOffset.checked;
        let stockSet = offset || (proc.camStockX && proc.camStockY && proc.camStockZ > 0);
        let topZ = API.platform.top_z();
        let delta = 0;
        let csox = 0;
        let csoy = 0;
        let stock = settings.stock = { };
        let compute = enabled && stockSet && (!offset || widgets.length);

        UI.func.animate.classList.add('disabled');

        // create/inject cam stock if stock size other than default
        if (compute) {
            UI.func.animate.classList.remove('disabled');
            let csx = proc.camStockX;
            let csy = proc.camStockY;
            let csz = proc.camStockZ;
            if (offset) {
                let min = { x: Infinity, y: Infinity, z: 0 };
                let max = { x: -Infinity, y: -Infinity, z: -Infinity };
                widgets.forEach(function(widget) {
                    let wbnd = widget.getBoundingBox(refresh);
                    let wpos = widget.track.pos;
                    min = {
                        x: Math.min(min.x, wpos.x + wbnd.min.x),
                        y: Math.min(min.y, wpos.y + wbnd.min.y),
                        z: 0
                    };
                    max = {
                        x: Math.max(max.x, wpos.x + wbnd.max.x),
                        y: Math.max(max.y, wpos.y + wbnd.max.y),
                        z: Math.max(max.z, wbnd.max.z)
                    };
                });
                csx += max.x - min.x;
                csy += max.y - min.y;
                csz += max.z - min.z;
                csox = min.x + ((max.x - min.x) / 2);
                csoy = min.y + ((max.y - min.y) / 2);
            }
            if (!camStock) {
                let geo = new THREE.BoxGeometry(1, 1, 1);
                let mat = new THREE.MeshBasicMaterial({
                    color: 0x777777,
                    opacity: 0.2,
                    transparent: true,
                    side:THREE.DoubleSide
                });
                camStock = new THREE.Mesh(geo, mat);
                camStock.renderOrder = 2;
                SPACE.platform.add(camStock);
            }
            stock = settings.stock = {
                x: csx,
                y: csy,
                z: csz,
                center: {
                    x: csox,
                    y: csoy,
                    z: csz / 2
                }
            };
            camStock.scale.x = csx + 0.005;
            camStock.scale.y = csy + 0.005;
            camStock.scale.z = csz + 0.005;
            camStock.position.x = csox;
            camStock.position.y = csoy;
            camStock.position.z = csz / 2;
            delta = csz - topZ;
        } else if (camStock) {
            SPACE.platform.remove(camStock);
            camStock = null;
            delta = 0;
        }

        const {x, y, z} = stock;
        if (x && y && z && !STACKS.getStack('bounds')) {
            const render = new KIRI.Layers().setLayer('bounds', { face: 0xaaaaaa, line: 0xaaaaaa });
            const stack = STACKS.setFreeMem(false).create('bounds', SPACE.platform.world);
            stack.add(render.addPolys([
                newPolygon().centerRectangle({x:csox, y:csoy, z:0}, x, y),
                newPolygon().centerRectangle({x:csox, y:csoy, z}, x, y)
            ], { thin: true } ));
            const hx = x/2, hy = y/2;
            const sz = stock.z || 0;
            stack.add(render.addLines([
                newPoint(csox + hx, csoy - hy, 0), newPoint(csox + hx, csoy - hy, sz),
                newPoint(csox + hx, csoy + hy, 0), newPoint(csox + hx, csoy + hy, sz),
                newPoint(csox - hx, csoy - hy, 0), newPoint(csox - hx, csoy - hy, sz),
                newPoint(csox - hx, csoy + hy, 0), newPoint(csox - hx, csoy + hy, sz),
            ], { thin: true }));
            STACKS.setFreeMem(true);
        }

        API.platform.update_top_z(delta);
        API.platform.update_origin();
        SPACE.update();
    }

})();
