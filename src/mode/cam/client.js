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
        func = {},
        API, FDM, SPACE, STACKS, MODES, VIEWS, UI, UC;

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

        api.event.on("mode.set", (mode) => {
            isCamMode = mode === 'CAM';
            $('set-tools').style.display = isCamMode ? '' : 'none';
            kiri.space.platform.setColor(isCamMode ? 0xeeeeee : 0xcccccc);
            updateStock(undefined, 'internal');
        });

        api.event.on("view.set", (mode) => {
            isArrange = (mode === VIEWS.ARRANGE);
            isAnimate = false;
            CAM.animate_clear(api);
        });

        api.event.on("settings.saved", (settings) => {
            const proc = settings.process;
            // show/hide dots in enabled process pop buttons
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
            updateStock(settings, 'settings.saved.internal');
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

        api.event.on("button.click", target => {
            switch (target) {
                case api.ui.tabAdd:
                    return func.tadd();
                case api.ui.tabDun:
                    return func.tdone();
                case api.ui.tabClr:
                    api.uc.confirm("clear tabs?").then(ok => {
                        if (ok) func.tclear();
                    });
                    break;
            }
        });

        api.event.on("cam.tabs.add", func.tadd = () => {
            alert = api.show.alert("&lt;esc&gt; key cancels editing tabs");
            api.feature.hover = true;
        });
        api.event.on("cam.tabs.done", func.tdone = () => {
            delbox('intZ');
            delbox('intW');
            delbox('supp');
            api.hide.alert(alert);
            api.feature.hover = false;
        });
        api.event.on("cam.tabs.clear", func.tclear = () => {
            func.sdone();
            // clearAllWidgetSupports();
            // API.conf.save();
        });
        api.event.on("slice.begin", () => {
            if (isCamMode) {
                func.sdone();
                // updateVisiblity();
            }
        });
        api.event.on("key.esc", () => {
            if (isCamMode) {
                func.sdone()
            }
        });
        api.event.on("widget.rotate", rot => {
            if (!isCamMode) {
                return;
            }
            const {widget, x, y, z} = rot;
            if (x || y) {
                // clearWidgetSupports(widget);
            } else {
                let ann = API.widgets.annotate(widget.id);
                let tabs = ann.support || [];
                // tabs.forEach(sup => {
                //     let wsup = widget.tabs[sup.id];
                //     let vc = new THREE.Vector3(sup.x, sup.y, sup.z);
                //     let m4 = new THREE.Matrix4();
                //     m4 = m4.makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
                //     vc.applyMatrix4(m4);
                //     wsup.box.position.x = wsup.x = sup.x = vc.x;
                //     wsup.box.position.y = wsup.y = sup.y = vc.y;
                //     wsup.box.position.z = wsup.z = sup.z = vc.z;
                // });
            }
        });
        api.event.on("mouse.hover.up", int => {
            if (!isCamMode) {
                return;
            }
            delbox('supp');
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
            let x = ic.x - ip.x, y = -ic.z - ip.y, z = 0, id = Date.now();
            let rec = {x, y, z, dw:10, dh:10, id};
            wt.push(Object.clone(rec));
            addWidgetTab(iw, rec);
            API.conf.save();
        });
        const zaxis = {x: 0, y: 0, z: 1};
        let lastTab, tab, iw, ic;
        api.event.on("mouse.hover", data => {
            if (!isCamMode) {
                return;
            }
            delbox('supp');
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
            const { track } = iw;
            const { stock, bounds, process } = API.conf.get();
            const { camTabsWidth, camTabsHeight } = process;
            const zp = stock.z - track.box.d + process.camZBottom - process.camZTopOffset + camTabsHeight / 2;
            ic.x += n.x * 2.5;
            ic.z -= n.y * 2.5;
            ic.y = zp; // swap in world space y,z
            const q = new THREE.Quaternion().setFromAxisAngle(zaxis, Math.atan2(n.y, n.x));
            addbox({x:ic.x, y:ic.y, z:ic.z}, 0x0000dd, 'supp', {
                x:5, y:camTabsWidth, z:camTabsHeight
            }, { rotate: q });
        });
    };

    function addWidgetTab(widget, pos) {
        const { x, y, z, dw, dh, id } = pos;
        const tabs = widget.tabs = (widget.tabs || {});
        // prevent duplicate restore from repeated settings load calls
        if (!tabs[id]) {
            pos.box = addbox(
                { x, y, z }, 0x0000dd, 'supp',
                { x:dw, y:dw, z:dh }, { group: widget.mesh }
            );
            pos.box.tab = Object.assign({widget}, pos);
            tabs[id] = pos;
            widget.adds.push(pos.box);
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

        // create/inject cam stock if stock size other than default
        if (enabled && stockSet && widgets.length) {
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
            const render = new KIRI.Render().setLayer('bounds', { face: 0xaaaaaa, line: 0xaaaaaa });
            const stack = STACKS.create('bounds', SPACE.platform.world);
            stack.add(render.addPolys([
                newPolygon().centerRectangle({x:csox, y:csoy, z:0}, x, y),
                newPolygon().centerRectangle({x:csox, y:csoy, z}, x, y)
            ], { thin: true } ));
            const hx = x/2, hy = y/2;
            stack.add(render.addLines([
                newPoint(csox + hx, csoy - hy, 0), newPoint(csox + hx, csoy - hy, stock.z),
                newPoint(csox + hx, csoy + hy, 0), newPoint(csox + hx, csoy + hy, stock.z),
                newPoint(csox - hx, csoy - hy, 0), newPoint(csox - hx, csoy - hy, stock.z),
                newPoint(csox - hx, csoy + hy, 0), newPoint(csox - hx, csoy + hy, stock.z),
            ], { thin: true }));
        }

        API.platform.update_top_z(delta);
        API.platform.update_origin();
        SPACE.update();
    }

})();
