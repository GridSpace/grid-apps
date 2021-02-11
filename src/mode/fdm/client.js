/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        FDM = KIRI.driver.FDM,
        SPACE, API, VIEWS, LANG, PROC, UI, UC,
        p1, p2, iw,
        lastMode, lastView, lastPillar,
        isFdmMode = false,
        addingSupports = false,
        alert = [],
        boxes = {},
        func = {};

    FDM.init = function(kiri, api) {
        UI = api.ui;
        UC = api.uc;
        API = api;
        SPACE = api.const.SPACE;
        VIEWS = api.const.VIEWS;
        LANG = KIRI.lang.current;
        PROC = Object.keys(kiri.conf.defaults.fdm.p);

        let rangeVars = {
            // slice
            "sliceShells": LANG.sl_shel_s,
            "sliceFillType": LANG.fi_type,
            "sliceFillSparse": LANG.fi_pcnt_s,
            "sliceSolidMinArea": LANG.ad_msol_s,
            // prepare
            "sliceShellOrder": LANG.sl_ordr_s,
            "outputFeedrate": LANG.ou_feed_s,
            "outputFinishrate": LANG.ou_fini_s,
            "outputShellMult": LANG.ou_shml_s,
            "outputFillMult": LANG.ou_flml_s,
            "outputSparseMult": LANG.ou_spml_s,
            "outputRetractWipe": LANG.ad_wpln_s,
            "outputShortPoly": LANG.ad_spol_s,
            "outputMinSpeed": LANG.ad_mins_s,
            "outputCoastDist": LANG.ad_scst_s,
            "sliceSupportDensity": LANG.sp_dens_s,
            "sliceSupportOffset": LANG.sp_offs_s,
            "sliceLayerStart": LANG.sl_strt_s,
            "zHopDistance": LANG.ad_zhop_s,
            // export
            "outputTemp": LANG.ou_nozl_s,
            "outputBedTemp": LANG.ou_bedd_s,
            "outputRetractDist": LANG.ad_rdst_s,
            "outputRetractSpeed": LANG.outputRetractSpeed,
            "outputRetractDwell": LANG.ad_rdwl_s,
        };

        for (let key of Object.keys(rangeVars)) {
            UI[key].range = true;
        }

        function filterSynth() {
            api.widgets.filter((widget) => {
                if (widget.track.synth) {
                    api.const.SPACE.platform.remove(widget.mesh);
                    kiri.Widget.Groups.remove(widget);
                }
                return !widget.track.synth
            });
        }

        function updateRanges(ranges = []) {
            UI.rangeGroup.style.display = isFdmMode && ranges && ranges.length ? 'flex' : 'none';
            let html = [];
            let bind = [];
            let now = Date.now();
            let sorted = ranges.sort((a,b) => b.lo - a.lo);
            for (let range of sorted) {
                let id = (now++).toString(36);
                let rows = Object.entries(range.fields).map(a => `<div><label class="pad">${rangeVars[a[0]]}</label><span></span><label class="val">${a[1]}</label></div>`).join('');
                let hover = `<div id="hov_${id}" class="range-detail">${rows}</div>`;
                let info = `<button id="sel_${id}" class="j-center grow">${range.lo} - ${range.hi}</button><button id="del_${id}"><i class="far fa-trash-alt"></i></button>`;
                html.appendAll([
                    `<div id="rng_${id}" class="range-info">${hover}${info}</div>`
                ]);
                bind.push({id, range});
            }
            UI.rangeGroup.firstElementChild.innerHTML = html.join('');
            for (let rec of bind) {
                $(`sel_${rec.id}`).onclick = () => {
                  api.show.layer(rec.range.hi, rec.range.lo);
                };
                $(`del_${rec.id}`).onclick = () => {
                    let io = ranges.indexOf(rec.range);
                    ranges.splice(io,1);
                    updateRanges(ranges);
                };
              }
        }

        api.event.on("mode.set", mode => {
            isFdmMode = mode === 'FDM';
            lastMode = mode;
            updateVisiblity();
        });
        api.event.on("view.set", view => {
            lastView = view;
            updateVisiblity();
            filterSynth();
            // let ranges = API.conf.get().process.ranges;
            if (isFdmMode) {
                if (lastView === VIEWS.SLICE) {
                    for (let key of PROC) {
                        if (UI[key] && !UI[key].range) {
                            UI[key].disabled = true;
                        }
                    }
                } else {
                    for (let key of PROC) {
                        if (UI[key]) UI[key].disabled = false;
                    }
                }
            }
            // UI.rangeGroup.style.display = ranges && ranges.length ? 'flex' : 'none';
        });
        api.event.on("range.updates", updateRanges);
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
            restoreSupports(api.widgets.all());
            updateRanges(settings.process.ranges);
        });
        api.event.on("settings.saved", (settings) => {
            updateRanges(settings.process.ranges);
            // let ranges = settings.process.ranges;
            // UI.rangeGroup.style.display = isFdmMode && ranges && ranges.length ? 'flex' : 'none';
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
            api.feature.hover = addingSupports = true;
        });
        api.event.on("fdm.supports.done", func.sdone = () => {
            delbox('intZ');
            delbox('intW');
            delbox('supp');
            api.hide.alert(alert);
            api.feature.hover = addingSupports = false;
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

            // synth support widget for each widget group
            let synth = [];
            for (let group of kiri.Widget.Groups.list()) {
                let count = 0;
                let merged = new THREE.Geometry();
                for (let widget of group) {
                    if (widget.sups) {
                        for (let sup of Object.values(widget.sups)) {
                            merged.merge(sup.box.geometry, sup.box.matrix);
                            count++;
                        }
                    }
                }
                if (!count) {
                    continue;
                }
                let bbg = new THREE.BufferGeometry().fromGeometry(merged);
                let sw = kiri.newWidget(null, group);
                let fwp = group[0].track.pos;
                sw.loadGeometry(bbg);
                sw._move(fwp.x, fwp.y, fwp.z);
                api.widgets.add(sw);
                sw.track.synth = true;
                api.const.SPACE.platform.add(sw.mesh);
            }
        });
        api.event.on("slice.end", () => {
            if (!isFdmMode) {
                return;
            }
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
            if (!addingSupports) {
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
            p1.y = Math.max(0, p1.y);
            p2.y = Math.max(0, p2.y);
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
            if (!addingSupports) {
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
            setSupportVisiblity(w, lastMode === 'FDM' && lastView === VIEWS.ARRANGE);
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
