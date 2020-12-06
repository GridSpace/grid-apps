/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        newPolygon = BASE.newPolygon,
        newPoint = BASE.newPoint,
        toolInfo,
        isAnimate,
        isArrange,
        isCamMode,
        isParsed,
        camStock,
        current,
        API, FDM, SPACE, STACKS, MODES, VIEWS, UI, UC;

    let zaxis = {x: 0, y: 0, z: 1},
        func = {};

    CAM.init = function(kiri, api) {
        FDM = KIRI.driver.FDM;

        // console.log({kiri,api})
        STACKS = api.const.STACKS;
        SPACE = api.const.SPACE;
        MODES = api.const.MODES;
        VIEWS = api.const.VIEWS;
        UI = api.ui;
        UC = api.uc;
        API = api;

        toolInfo = $('tool-info');

        // wire up animate button in ui
        api.function.animate = () => {
            api.function.prepare(() => {
                if (isCamMode && camStock) {
                    animate();
                }
            });
        };

        api.event.on("mode.set", (mode) => {
            isCamMode = mode === 'CAM';
            $('set-tools').style.display = isCamMode ? '' : 'none';
            kiri.space.platform.setColor(isCamMode ? 0xeeeeee : 0xcccccc);
            updateStock(undefined, 'internal');
            if (!isCamMode) {
                func.tabClear();
                func.traceDone();
                UI.func.animate.style.display = 'none';
                UI.label.slice.innerText = 'slice';
                UI.label.preview.innerText = 'preview';
                UI.label.export.innerText = 'export';
            } else {
                UI.label.slice.innerText = 'scan';
                checkOutlineSettings(api.conf.get());
            }
            // do not persist traces across page reloads
            func.traceClear();
        });

        api.event.on("view.set", (mode) => {
            isArrange = (mode === VIEWS.ARRANGE);
            isAnimate = false;
            CAM.animate_clear(api);
            func.tabDone();
            func.traceDone();
        });

        function checkOutlineSettings(settings) {
            let ui = api.ui, proc = settings.process;
            // fix invalid in/out enabled condition
            if (ui.camOutlineIn.checked && ui.camOutlineOut.checked) {
                proc.camOutlineIn = proc.camOutlineOut = false;
                ui.camOutlineIn.checked = ui.camOutlineOut.checked = false;
                api.uc.refresh();
            }
        }

        api.event.on("settings.saved", (settings) => {
            current = settings;
            const proc = settings.process;
            let hasTabs = false;
            let hasTraces = false;
            // for any tabs or traces to set markers
            Object.keys(settings.widget).forEach(wid => {
                let wannot = settings.widget[wid];
                if (wannot.tab && wannot.tab.length) hasTabs = true;
                if (wannot.trace && wannot.trace.length) hasTraces = true;
            });
            checkOutlineSettings(settings);
            // show/hide dots in enabled process pop buttons
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
            api.ui.camTracing.marker.style.display = hasTraces ? 'flex' : 'none';
            api.ui.camTabs.marker.style.display = hasTabs ? 'flex' : 'none';
            api.ui.camStock.marker.style.display = proc.camStockOn ? 'flex' : 'none';
            updateStock(settings, 'settings.saved.internal');
        });

        api.event.on("settings.load", (settings) => {
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

        // TAB/TRACE BUTTON HANDLERS
        api.event.on("button.click", target => {
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
                case api.ui.traceAdd:
                    return func.traceAdd();
                case api.ui.traceDun:
                    return func.traceDone();
                case api.ui.traceClr:
                    api.uc.confirm("clear traces?").then(ok => {
                        if (ok) func.traceClear();
                    });
                    break;
            }
        });

        // TAB FUNCS
        let showTab, lastTab, tab, iw, ic;
        api.event.on("cam.tabs.add", func.tabAdd = () => {
            func.traceDone();
            alert = api.show.alert("[esc] key cancels tab editing");
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
        api.event.on("cam.trace.add", func.traceAdd = () => {
            if (traceOn) {
                return;
            }
            func.tabDone();
            alert = api.show.alert("analyzing parts...");
            traceOn = true;
            KIRI.client.traces((ids) => {
                api.hide.alert(alert);
                alert = api.show.alert("[esc] key cancels trace editing");
                KIRI.api.widgets.opacity(0.5);
                KIRI.api.widgets.for(widget => {
                    if (ids.indexOf(widget.id) >= 0) {
                        clearTraces(widget);
                        widget.trace_stack = null;
                    }
                    if (widget.trace_stack) {
                        widget.adds.appendAll(widget.trace_stack.meshes);
                        widget.trace_stack.show();
                        return;
                    }
                    let stack = new KIRI.Stack(widget.mesh);
                    widget.trace_stack = stack;
                    widget.traces.forEach(poly => {
                        let layers = new KIRI.Layers();
                        layers.setLayer("trace", {line: 0x88aa55}, false).addPoly(poly);
                        stack.addLayers(layers);
                        stack.new_meshes.forEach(mesh => {
                            mesh.trace = {widget, poly};
                        });
                        widget.adds.appendAll(stack.new_meshes);
                    });
                    // for (let [key, val] of Object.entries(widget.sindex)) {
                    //     console.log('sindex', {key, val});
                    //     let layers = new KIRI.Layers();
                    //     layers.setLayer("sindex", {line: 0x55aa88}, false).addPolys(val);
                    //     stack.addLayers(layers);
                    // }
                });
            });
            api.feature.hover = true;
            api.feature.hoverAdds = true;
            func.hover = func.traceHover;
            func.hoverUp = func.traceHoverUp;
        });
        api.event.on("cam.trace.done", func.traceDone = () => {
            if (!traceOn) {
                return;
            }
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
            toolInfo.style.display = '';
        });
        api.event.on("cam.trace.clear", func.traceClear = () => {
            func.traceDone();
            API.widgets.all().forEach(widget => {
                clearTraces(widget);
            });
            API.conf.save();
        });
        func.traceHover = function(data) {
            if (lastTrace) {
                let { color, colorSave } = lastTrace.material[0];
                color.r = colorSave.r;
                color.g = colorSave.g;
                color.b = colorSave.b;
            }
            if (data.type === 'platform') {
                lastTrace = null;
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
                toolInfo.style.right = `${offsetWidth - clientX + 5}px`;
                toolInfo.style.bottom = `${offsetHeight - clientY + 5}px`;
                let traceInfo = lastTrace.trace.poly.traceInfo;
                let tool = new CAM.Tool(current, traceInfo.tool);
                toolInfo.innerText = [
                    `  tool: ${tool.getName()}`,
                    `  feed: ${traceInfo.speed}`,
                    `plunge: ${traceInfo.plunge}`
                ].join('\n');
                toolInfo.style.display = 'flex';
            } else {
                toolInfo.style.display = '';
            }
            let material = lastTrace.material[0];
            let color = material.color;
            let {r, g, b} = color;
            material.colorSave = {r, g, b};
            color.r = 1;
            color.g = 0;
            color.b = 0;
        };
        func.traceHoverUp = function(int) {
            if (!int) return;
            func.traceToggle(int.object);
        };
        func.traceToggle = function(obj) {
            let material = obj.material[0];
            let { color, colorSave } = material;
            let { widget, poly } = obj.trace;
            let wannot = API.widgets.annotate(widget.id);
            let atrace = wannot.trace = wannot.trace || [];
            let wtrace = widget.trace = widget.trace || [];
            let process = current.process;
            obj.selected = !obj.selected;
            if (obj.selected) {
                color.r = colorSave.r = 0.9;
                color.g = colorSave.g = 0;
                color.b = colorSave.b = 0.1;
                poly.traceInfo = {
                    tool: process.camTraceTool,
                    speed: process.camTraceSpeed,
                    plunge: process.camTracePlunge,
                    path: KIRI.codec.encode(poly)
                };
                wtrace.push(poly);
                atrace.push(poly.traceInfo);
            } else {
                color.r = colorSave.r = 0x88/255;
                color.g = colorSave.g = 0xaa/255;
                color.b = colorSave.b = 0x55/255;
                wtrace.remove(poly);
                atrace.remove(poly.traceInfo);
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
            const {widget, x, y, z} = rot;
            if (traceOn) {
                func.traceDone();
            }
            clearTraces(widget);
            if (x || y) {
                clearTabs(widget);
            } else {
                let tabs = API.widgets.annotate(widget.id).tab || [];
                tabs.forEach(rec => {
                    let { id, pos, rot } = rec;
                    let tab = widget.tabs[id];
                    let m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, z || 0));
                    // update position vector
                    let vc = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(m4);
                    // update rotation quaternion
                    rec.rot = new THREE.Quaternion().multiplyQuaternions(
                        new THREE.Quaternion(rot._x, rot._y, rot._z, rot._w),
                        new THREE.Quaternion().setFromRotationMatrix(m4)
                    );
                    tab.box.geometry.applyMatrix4(m4);
                    tab.box.position.x = pos.x = vc.x;
                    tab.box.position.y = pos.y = vc.y;
                    tab.box.position.z = pos.z = vc.z;
                });
                SPACE.update();
            }
        });
        api.event.on("mouse.hover.up", int => {
            if (!isCamMode) {
                return;
            }
            func.hoverUp(int);
        });
        api.event.on("mouse.hover", data => {
            if (!isCamMode) {
                return;
            }
            func.hover(data);
        });
    };

    function createTabBox(iw, ic, n) {
        const { track } = iw;
        const { stock, bounds, process } = API.conf.get();
        const { camTabsWidth, camTabsHeight, camTabsDepth } = process;
        const sz = stock.z || bounds.max.z;
        const zp = sz - track.box.d + process.camZBottom - process.camZTopOffset + camTabsHeight / 2;
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

    function clearTabs(widget) {
        Object.values(widget.tabs || {}).forEach(rec => {
            widget.adds.remove(rec.box);
            widget.mesh.remove(rec.box);
        });
        widget.tabs = {};
        delete API.widgets.annotate(widget.id).tab;
    }

    function clearTraces(widget) {
        let stack = widget.trace_stack;
        if (stack) {
            stack.meshes.forEach(mesh => {
                if (mesh.selected) {
                    func.traceToggle(mesh);
                }
            });
        }
        widget.trace = null;
        delete API.widgets.annotate(widget.id).trace;
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
        let compute = enabled && stockSet && widgets.length;

        UI.func.animate.style.display = refresh ? '' : 'none';

        // create/inject cam stock if stock size other than default
        if (compute) {
            UI.func.animate.style.display = '';
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
