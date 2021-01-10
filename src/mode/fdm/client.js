/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        FDM = KIRI.driver.FDM,
        SPACE, API,
        p1, p2, iw,
        lastMode, lastView, lastPillar,
        isFdmMode = false,
        alert = [],
        boxes = {},
        func = {};

    FDM.init = function(kiri, api) {
        API = api;
        SPACE = api.const.SPACE;
        api.event.on("mode.set", mode => {
            isFdmMode = mode === 'FDM';
            lastMode = mode;
            updateVisiblity();
        });
        api.event.on("view.set", view => {
            lastView = view;
            updateVisiblity();
        });
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
            restoreSupports(api.widgets.all());
        });
        api.event.on("settings.saved", (settings) => {
            api.ui.fdmSupport.style.display = settings.device.bedBelt ? 'none' : 'flex';
        });
        api.event.on("button.click", target => {
            switch (target) {
                case api.ui.ssaGen: return func.sgen();
                case api.ui.ssmAdd: return func.sadd();
                case api.ui.ssmDun: return func.sdone();
                case api.ui.ssmClr:
                    return api.uc.confirm("clear supports?").then(ok => {
                        if (ok) func.sclear();
                    });
            }
        });
        api.event.on("fdm.supports.detect", func.sgen = () => {
            alert = api.show.alert("analyzing part(s)...", 1000);
            FDM.support_generate(array => {
                func.sclear();
                api.hide.alert(alert);
                for (let rec of array) {
                    let { widget, supports } = rec;
                    let wa = API.widgets.annotate(widget.id);
                    let ws = wa.support || [];
                    for (let support of supports) {
                        let { from, to, mid } = support;
                        let dw = api.conf.get().process.sliceSupportSize / 2;
                        let dh = from.z - to.z;
                        let rec = {
                            x: mid.x,
                            y: mid.y,
                            z: mid.z,
                            dw,
                            dh,
                            id: Math.random() * 0xffffffffff
                        };
                        addWidgetSupport(widget, rec);
                        ws.push(Object.clone(rec));
                    }
                    wa.support = ws;
                }
            });
        });
        api.event.on("fdm.supports.add", func.sadd = () => {
            alert = api.show.alert("[esc] key cancels support editing");
            api.feature.hover = true;
        });
        api.event.on("fdm.supports.done", func.sdone = () => {
            delbox('intZ');
            delbox('intW');
            delbox('supp');
            api.hide.alert(alert);
            api.feature.hover = false;
        });
        api.event.on("fdm.supports.clear", func.sclear = () => {
            func.sdone();
            clearAllWidgetSupports();
            API.conf.save();
        });
        api.event.on("slice.begin", () => {
            if (!isFdmMode) {
                return;
            }
            func.sdone();
            updateVisiblity();
        });
        api.event.on("key.esc", () => {
            if (!isFdmMode) {
                return;
            }
            func.sdone()
        });
        api.event.on("selection.scale", () => {
            if (isFdmMode) {
                func.sclear();
            }
        });
        api.event.on("widget.rotate", rot => {
            if (!isFdmMode) {
                return;
            }
            let {widget, x, y, z} = rot;
            if (x || y) {
                clearWidgetSupports(widget);
            } else {
                let ann = API.widgets.annotate(widget.id);
                let sups = ann.support || [];
                sups.forEach(sup => {
                    let wsup = widget.sups[sup.id];
                    let vc = new THREE.Vector3(sup.x, sup.y, sup.z);
                    let m4 = new THREE.Matrix4();
                    m4 = m4.makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
                    vc.applyMatrix4(m4);
                    wsup.box.position.x = wsup.x = sup.x = vc.x;
                    wsup.box.position.y = wsup.y = sup.y = vc.y;
                    wsup.box.position.z = wsup.z = sup.z = vc.z;
                });
            }
        });
        api.event.on("mouse.hover.up", on => {
            let { object, event } = on;
            if (!isFdmMode) {
                return;
            }
            delbox('supp');
            if (lastPillar) {
                const {widget, box, id} = lastPillar;
                widget.adds.remove(box);
                widget.mesh.remove(box);
                delete widget.sups[id];
                let sa = API.widgets.annotate(widget.id).support;
                let ix = 0;
                sa.forEach((rec,i) => {
                    if (rec.id === id) {
                        ix = i;
                    }
                });
                sa.splice(ix,1);
                API.conf.save();
                return;
            }
            if (!iw) return;
            let hy = (p1.y + p2.y) / 2;
            let dh = Math.abs(p1.y - p2.y);
            let dw = api.conf.get().process.sliceSupportSize / 2;
            let ip = iw.track.pos;
            let wa = api.widgets.annotate(iw.id);
            let ws = (wa.support = wa.support || []);
            let x = p1.x - ip.x, y = -p1.z - ip.y, z = hy, id = Date.now();
            let rec = {x, y, z, dw, dh, id};
            ws.push(Object.clone(rec));
            addWidgetSupport(iw, rec);
            API.conf.save();
        });
        api.event.on("mouse.hover", data => {
            if (!isFdmMode) {
                return;
            }
            // delbox('intZ');
            // delbox('intW');
            // addbox(point, 0xff0000, 'intZ');
            delbox('supp');
            const { int, type, point } = data;
            const pillar = int ? int.object.pillar : undefined;
            if (lastPillar) {
                lastPillar.box.material.color.r = 0;
                lastPillar = null;
            }
            if (pillar) {
                pillar.box.material.color.r = 0.5;
                lastPillar = pillar;
                return;
            }
            if (int && type === 'widget') {
                iw = int.object.widget || iw;
            } else {
                iw = null;
            }
            p1 = point;
            let dir = new THREE.Vector3(0,1,0)
            let ray = new THREE.Raycaster(point, dir);
            // when on object, project down on downward faces
            if (int && int.face && int.face.normal.z < -0.1) {
                dir.y = -1;
            }
            let targets = api.widgets.meshes()
                .append(SPACE.internals().platform)
                .appendAll(activeSupports())
                ;
            let i2 = ray.intersectObjects(targets, false);
            if (i2 && i2.length > 0) {
                // prevent false matches close to origin of ray
                i2 = i2.filter(i => i.distance > 0.01);
                // prevent single point base to top matches
                if (i2.length > 1) {
                    p2 = i2[0].point;
                    iw = i2[0].object.widget || iw;
                    let hy = (p1.y + p2.y) / 2;
                    let dy = Math.abs(p1.y - p2.y);
                    let dw = api.conf.get().process.sliceSupportSize / 2;
                    // addbox(p2, 0x00ff00, 'intW');
                    addbox({x:p1.x, y:hy, z:p1.z}, 0x0000dd, 'supp', {
                        x:dw, y:dw, z:dy
                    });
                }
            }
        });
    }

    function activeSupports() {
        const active = [];
        API.widgets.all().forEach(widget => {
            Object.values(widget.sups || {}).forEach(support => {
                active.push(support.box);
                support.box.support = true;
                // console.log({support});
            });
        });
        return active;
    }

    function restoreSupports(widgets) {
        widgets.forEach(widget => {
            const supports = API.widgets.annotate(widget.id).support || [];
            supports.forEach(pos => {
                addWidgetSupport(widget, pos);
            });
        });
    }

    function addWidgetSupport(widget, pos) {
        const { x, y, z, dw, dh, id } = pos;
        const sups = widget.sups = (widget.sups || {});
        // prevent duplicate restore from repeated settings load calls
        if (!sups[id]) {
            pos.box = addbox(
                { x, y, z }, 0x0000dd, id,
                { x:dw, y:dw, z:dh }, { group: widget.mesh }
            );
            pos.box.pillar = Object.assign({widget}, pos);
            sups[id] = pos;
            widget.adds.push(pos.box);
        }
    }

    function updateVisiblity() {
        API.widgets.all().forEach(w => {
            setSupportVisiblity(w, lastMode === 'FDM' && lastView === API.const.VIEWS.ARRANGE);
        });
    }

    function setSupportVisiblity(widget, bool) {
        Object.values(widget.sups || {}).forEach(support => {
            support.box.visible = bool;
        });
    }

    function clearAllWidgetSupports() {
        API.widgets.all().forEach(widget => {
            clearWidgetSupports(widget);
        });
    }

    function clearWidgetSupports(widget) {
        Object.values(widget.sups || {}).forEach(support => {
            widget.adds.remove(support.box);
            widget.mesh.remove(support.box);
        });
        widget.sups = {};
        delete API.widgets.annotate(widget.id).support;
    }

    function delbox(name) {
        const old = boxes[name];
        if (old) {
            old.groupTo.remove(old);
        }
    }

    function addbox(point, color, name, dim = {x:1,y:1,z:1}, opt = {}) {
        delbox(name);
        const box = boxes[name] = new THREE.Mesh(
            new THREE.BoxGeometry(dim.x, dim.y, dim.z),
            new THREE.MeshPhongMaterial({
                transparent: true,
                opacity: 0.5,
                color
            })
        );
        box.position.x = point.x;
        box.position.y = point.y;
        box.position.z = point.z;

        const group = opt.group || SPACE.scene
        group.add(box);
        box.groupTo = group;

        if (opt.rotate) {
            opt.matrix = new THREE.Matrix4().makeRotationFromQuaternion(opt.rotate);
        }
        if (opt.matrix) {
            box.geometry.applyMatrix4(opt.matrix);
        }
        return box;
    }

    FDM.delbox = delbox;
    FDM.addbox = addbox;

})();
