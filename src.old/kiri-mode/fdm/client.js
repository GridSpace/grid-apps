/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.three
// dep: geo.base
// dep: moto.space
// dep: kiri.api
// dep: kiri.lang
// dep: kiri.consts
// dep: kiri-mode.fdm.driver
gapp.register("kiri-mode.fdm.client", [], (root, exports) => {

const { Quaternion, Matrix4, Vector3, BufferAttribute, BufferGeometryUtils } = THREE;
const { Mesh, BoxGeometry, MeshPhongMaterial, Raycaster, Euler } = THREE;
const { base, kiri, moto } = root;
const { util } = base;
const { api, consts, lang } = kiri;
const { FDM } = kiri.driver;
const { VIEWS } = consts;
const { space } = moto;
const LANG = lang.current;

let lastBox, lastMode, lastView, lastPillar, fromPillar,
    addingSupports = false,
    isFdmMode = false,
    nextID = Date.now(),
    p1, p2, iw,
    alert = [],
    boxes = {},
    func = {};

FDM.init = function(kiri, api) {
    const proc_keys = Object.keys(kiri.conf.defaults.fdm.p);
    const { ui, uc } = api;
    const rangeVars = {
        // slice
        // "sliceHeight": LANG.sl_lahi_s,
        "sliceShells": LANG.sl_shel_s,
        "sliceFillType": LANG.fi_type,
        "sliceFillWidth": LANG.fi_wdth_s,
        "sliceFillSparse": LANG.fi_pcnt_s,
        "sliceFillRate": LANG.ou_feed_s,
        "sliceFillGrow": LANG.fi_grow_s,
        "sliceSolidRate": LANG.ou_fini_s,
        "sliceSolidMinArea": LANG.ad_msol_s,
        "sliceTopLayers": LANG.sl_ltop_s,
        "sliceBottomLayers": LANG.sl_lbot_s,
        "firstLayerRate": LANG.fl_rate_s,
        "firstLayerPrintMult": LANG.fl_mult_s,
        "firstLayerFanSpeed": LANG.ou_fans_s,
        // prepare
        "sliceShellOrder": LANG.sl_ordr_s,
        "sliceFillOverlap": LANG.fi_over_s,
        "outputFeedrate": LANG.ou_feed_s,
        "outputFinishrate": LANG.ou_fini_s,
        "outputShellMult": LANG.ou_shml_s,
        "outputFillMult": LANG.ou_flml_s,
        "outputSparseMult": LANG.ou_spml_s,
        "outputRetractWipe": LANG.ad_wpln_s,
        "outputAlternating": LANG.ad_altr_s,
        "outputShortPoly": LANG.ad_spol_s,
        "outputMinSpeed": LANG.ad_mins_s,
        "outputCoastDist": LANG.ad_scst_s,
        "outputLoops": LANG.ag_loop_s,
        "sliceSupportDensity": LANG.sp_dens_s,
        "sliceSupportOffset": LANG.sp_offs_s,
        "sliceLayerStart": LANG.sl_strt_s,
        "firstLayerBrim": LANG.fl_brim_s,
        "firstLayerBrimIn": LANG.fl_brin_s,
        "firstLayerBrimTrig": LANG.fl_brmn_s,
        "firstLayerBrimGap": LANG.fl_brgp_s,
        // export
        "zHopDistance": LANG.ad_zhop_s,
        "arcTolerance": LANG.ad_zhop_s,
        "antiBacklash": LANG.ad_abkl_s,
        "outputTemp": LANG.ou_nozl_s,
        "outputBedTemp": LANG.ou_bedd_s,
        "outputFanSpeed": LANG.ou_fans_s,
        "outputRetractDist": LANG.ad_rdst_s,
        "outputRetractSpeed": LANG.ad_rrat_s,
        "outputRetractDwell": LANG.ad_rdwl_s,
        "outputLayerRetract": LANG.ad_lret_s
    };

    for (let key of Object.keys(rangeVars)) {
        if (ui[key]) {
            ui[key].range = true;
        }
    }

    function filterSynth() {
        api.widgets.filter((widget) => {
            if (widget.track.synth) {
                kiri.space.world.remove(widget.mesh);
                kiri.Widget.Groups.remove(widget);
            }
            return !widget.track.synth
        });
    }

    function clearRanges() {
        api.conf.get().process.ranges = [];
        ui.fdmRanges.innerHTML = '';
    }

    // re-render ranges menu
    function updateRanges(ranges = []) {
        let html = [];
        let bind = [];
        let now = Date.now();
        let sorted = ranges.sort((a,b) => b.lo - a.lo);
        for (let range of sorted) {
            let id = (now++).toString(36);
            let rows = Object.entries(range.fields).map(a => `<div><label class="pad">${rangeVars[a[0]]}</label><span></span><label class="val">${a[1]}</label></div>`).join('');
            let hover = `<div id="hov_${id}" class="range-detail">${rows}</div>`;
            let info = `<button id="sel_${id}" class="j-center grow">${range.lo} - ${range.hi}</button><button id="del_${id}"><i class="fa fa-trash"></i></button>`;
            html.appendAll([
                `<div id="rng_${id}" class="range-info">${hover}${info}</div>`
            ]);
            bind.push({id, range});
        }
        ui.fdmRanges.innerHTML = html.join('');
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

    api.event.on("function.animate", (mode) => {
        if (!(isFdmMode && lastView === VIEWS.PREVIEW)) {
            return;
        }
        let slider = $('top-slider');
        slider.style.display = 'flex';
        slider.oninput = slider.onchange = (ev) => {
            api.const.STACKS.setFraction(parseInt(ev.target.value)/1000);
            api.space.update();
        };
        $('anim-slider').value = 500;
        api.const.STACKS.setFraction(0.5);
    });

    api.event.on("mode.set", mode => {
        isFdmMode = mode === 'FDM';
        lastMode = mode;
        // hide/show fdm mode elements
        for (let el of [...document.getElementsByClassName('mode-fdm')]) {
            api.uc.setClass(el, 'hide', !isFdmMode);
        }
        updateSupportVisiblity();
    });

    api.event.on("view.set", view => {
        $('top-slider').style.display = 'none';
        lastView = view;
        updateSupportVisiblity();
        filterSynth();
        func.sdone();
        // let ranges = api.conf.get().process.ranges;
        if (isFdmMode) {
            if (lastView === VIEWS.SLICE) {
                for (let key of proc_keys) {
                    if (ui[key] && !ui[key].range) {
                        ui[key].disabled = true;
                    }
                }
            } else {
                for (let key of proc_keys) {
                    if (ui[key]) ui[key].disabled = false;
                }
            }
        }
    });

    api.event.on("range.updates", updateRanges);

    api.event.on("settings.load", (settings) => {
        if (settings.mode !== 'FDM') return;
        restoreSupports(api.widgets.all());
        updateRanges(settings.process.ranges);
    });

    api.event.on("settings.saved", (settings) => {
        updateRanges(settings.process.ranges);
    });

    api.event.on("button.click", target => {
        switch (target) {
            case api.ui.ssaGen: return func.sgen();
            case api.ui.ssmAdd: return func.sadd();
            case api.ui.ssmDun: return func.sdone();
            case api.ui.ssmClr: return func.sclear();
        }
    });

    api.event.on("fdm.supports.detect", func.sgen = () => {
        let alerts = [];
        let { process, device } = api.conf.get();
        if (!device.bedBelt) {
            if (process.sliceSupportAngle < 10) {
                alerts.push(api.show.alert("angles below 10 degrees may fail"));
            }
        }
        alerts.push(api.show.alert("analyzing part(s)...", 1000));
        FDM.support_generate(array => {
            func.sclear();
            api.hide.alert(undefined,alerts);
            for (let rec of array) {
                let { widget, supports } = rec;
                let wa = api.widgets.annotate(widget.id);
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
            api.event.emit("fdm.supports.detected");
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
        fromPillar = undefined;
    });

    api.event.on("fdm.supports.clear", func.sclear = () => {
        func.sdone();
        if (clearAllWidgetSupports()) {
            api.conf.save();
        }
    });

    api.event.on("slice.begin", () => {
        if (!isFdmMode) {
            return;
        }
        func.sdone();
        updateSupportVisiblity();
        // synth support widget for each widget group
        // iow, create support meshes based on support widget annotation
        for (let group of kiri.Widget.Groups.list()) {
            let merge = group.filter(w => w.sups).map(w => Object.values(w.sups)).flat();
            if (!merge.length) {
                continue;
            }
            let boxen = merge.map(m => {
                let geo = m.box.geometry.clone();
                if (geo.index) geo = geo.toNonIndexed();
                return geo.translate(m.x, m.y, m.z);
            });
            for (let box of boxen) {
                // eliminate / normalize uv to allow other widget merge
                box.setAttribute('uv',new BufferAttribute(new Float32Array(0), 3));
            }
            let bbg = BufferGeometryUtils.mergeGeometries(boxen);
            let sw = kiri.newWidget(null, group);
            let fwp = group[0].track.pos;
            sw.loadGeometry(bbg);
            sw._move(fwp.x, fwp.y, fwp.z);
            api.widgets.add(sw);
            sw.track.synth = true;
            sw.track.support = true;
            kiri.space.world.add(sw.mesh);
        }
    });

    api.event.on("slice.end", () => {
        if (!isFdmMode) {
            return;
        }
    });

    api.event.on("key.esc", () => {
        if (isFdmMode) {
            func.sdone()
        }
    });

    api.event.on("selection.scale", () => {
        if (isFdmMode) {
            clearRanges();
            func.sclear();
        }
    });

    api.event.on("widget.delete", widget => {
        if (isFdmMode) {
            clearRanges();
        }
    });

    api.event.on("widget.duplicate", (widget, oldwidget) => {
        if (!isFdmMode) {
            return;
        }
        let ann = api.widgets.annotate(widget.id);
        if (ann.support) {
            for (let supp of Object.values(ann.support)) {
                supp.id = Math.abs(Math.random() * 0xffffffffffff);
            }
            restoreSupports([widget]);
        }
    });

    api.event.on("widget.mirror", widget => {
        if (!isFdmMode) {
            return;
        }
        let ann = api.widgets.annotate(widget.id);
        let sups = ann.support || [];
        sups.forEach(sup => {
            let wsup = widget.sups[sup.id];
            wsup.box.position.x = wsup.x = sup.x = -sup.x;
        });
    });

    api.event.on("widget.rotate", rot => {
        if (!isFdmMode) {
            return;
        }
        let {widget, x, y, z} = rot;
        if (x || y) {
            clearWidgetSupports(widget);
        } else {
            let ann = api.widgets.annotate(widget.id);
            let sups = ann.support || [];
            sups.forEach(sup => {
                let wsup = widget.sups[sup.id];
                let vc = new Vector3(sup.x, sup.y, sup.z);
                let m4 = new Matrix4();
                m4 = m4.makeRotationFromEuler(new Euler(x || 0, y || 0, z || 0));
                vc.applyMatrix4(m4);
                wsup.box.position.x = wsup.x = sup.x = vc.x;
                wsup.box.position.y = wsup.y = sup.y = vc.y;
                wsup.box.position.z = wsup.z = sup.z = vc.z;
            });
        }
    });

    api.event.on("mouse.hover.up", func.hoverup = (on = {}) => {
        let { event } = on;
        if (!isFdmMode) {
            return;
        }
        if (!addingSupports) {
            return;
        }
        delbox('supp');
        if (lastPillar) {
            removeWidgetSupport(lastPillar.widget, lastPillar);
            return;
        }
        if (!(iw && lastBox)) return;
        let { point, dim } = lastBox;
        p1.y = Math.max(0, p1.y);
        p2.y = Math.max(0, p2.y);
        let rz = dim.rz;
        let dh = dim.z;
        let dw = api.conf.get().process.sliceSupportSize / 2;
        let ip = iw.track.pos;
        let wa = api.widgets.annotate(iw.id);
        let ws = (wa.support = wa.support || []);
        let id = ++nextID;
        let rec = {x: point.x - ip.x, y: -point.z - ip.y, z: point.y, rz, dw, dh, id};
        if (fromPillar && event && event.shiftKey) {
            let targets = api.widgets.meshes().append(space.internals().platform);
            let from = fromPillar,
                d = {
                    x: rec.x - from.x,
                    y: rec.y - from.y,
                    z: rec.z - from.z
                };
            let dist = Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z);
            let lerp = util.lerp(0,dist,dw).map(v => v/dist);
            let angle = rec.rz = Math.atan2(d.y,d.x);
            let fromrec = ws.filter(r => r.id === from.id)[0];
            if (fromrec) {
                from.rz = fromrec.rz = angle;
                removeWidgetSupport(iw, fromPillar);
                ws.push(Object.clone(fromrec));
                addWidgetSupport(iw, fromrec);
            }
            lerp.pop();
            let seed = Math.random();
            for (let pct of lerp) {
                let point = new Vector3(from.x + d.x * pct, from.z + d.z * pct, from.y + d.y * pct);
                addSupportAtPoint(targets, point, ip, angle, seed++);
            }
        }
        ws.push(Object.clone(rec));
        fromPillar = addWidgetSupport(iw, rec);
        api.conf.save();
    });

    function addSupportAtPoint(targets, point, ip, angle, id) {
        let up = new Vector3(0,1,0)
        let dn = new Vector3(0,-1,0)
        let rp = new Vector3(point.x + ip.x, point.y, -point.z - ip.y);
        let iup = new Raycaster(rp, up)
            .intersectObjects(targets, false)
            .filter(t => !t.object.pillar);
        if (iup.length && iup.length % 2 === 0) {
            let idn = new Raycaster(rp, dn)
                .intersectObjects(targets, false)
                .filter(t => !t.object.pillar);
            if (idn.length && idn.length % 2 === 0) {
                iw = iup[0].object.widget || iw;
                let wa = api.widgets.annotate(iw.id);
                let ws = (wa.support = wa.support || []);
                let phi = iup[0].point;
                let plo = idn[0].point;
                let ply = Math.max(0, plo.y);
                let mp = (phi.y + ply) / 2;
                let dy = Math.abs(phi.y - ply);
                let dw = api.conf.get().process.sliceSupportSize / 2;
                let rec = { rz:angle, x:point.x, y:point.z, z:mp, dw, dh:dy, id };
                ws.push(Object.clone(rec));
                fromPillar = addWidgetSupport(iw, rec);
            }
        }
    }

    api.event.on("mouse.hover", data => {
        if (!isFdmMode) {
            return;
        }
        if (!addingSupports) {
            return;
        }
        delbox('supp');
        const { int, type, point, event } = data;
        const pillar = int ? int.object.pillar : undefined;
        if (lastPillar) {
            lastPillar.box.material.color.r = 0;
            lastPillar = null;
        }
        if (pillar) {
            pillar.box.material.color.r = 0.5;
            lastPillar = pillar;
            if (event && (event.metaKey || event.ctrlKey)) {
                return func.hoverup();
            }
            return;
        }
        if (int && type === 'widget') {
            iw = int.object.widget || iw;
        } else {
            iw = null;
        }
        p1 = point;
        let dir = new Vector3(0,1,0)
        let ray = new Raycaster(point, dir);
        let rz = int && int.face ? Math.atan2(int.face.normal.y, int.face.normal.x) : 0;
        // when on object, project down on downward faces
        if (int && int.face && int.face.normal.z < -0.1) {
            dir.y = -1;
        }
        let targets = api.widgets.meshes().append(space.internals().platform);
        let i2 = ray.intersectObjects(targets, false)
            .filter(t => !t.object.pillar)  // eliminate other pillars
            .filter(i => i.distance > 0.1); // false matches close to origin of ray
        if (i2.length && i2.length % 2 === 0) {
            p2 = i2[0].point;
            iw = i2[0].object.widget || iw;
            let p1y = Math.max(0, p1.y);
            let p2y = Math.max(0, p2.y);
            let hy = (p1y + p2y) / 2;
            let dy = Math.abs(p1y - p2y);
            let dw = api.conf.get().process.sliceSupportSize / 2;
            addbox({x:p1.x, y:hy, z:p1.z}, 0x0000dd, 'supp', {
                x:dw, y:dw, z:dy, rz
            });
        } else {
            lastBox = null;
        }
        if (event && event.altKey) {
            return func.hoverup();
        }
    });

    api.event.on("export.debug", msg => {
        if (msg.arcQ && msg.arcQ.length > 2) {
            if (xpdebug) {
                xpdebug.destroy();
                xpdebug = undefined;
            }
            let poly = base.newPolygon().setOpen();
            for (let rec of msg.arcQ) {
                rec.z += 1;
                poly.addObj(rec);
            }

            let layers = new kiri.Layers();
            let layer = layers.setLayer("arcq", { line: 0xff00ff, face: 0xff00ff, opacity: 1 });
            layer.addPoly(poly, {thin:true});

            layer = layers.setLayer("arcc", { line: 0xff0000, face: 0xff0000, opacity: 1 });
            for (let center of msg.arcQ.center) {
                center.z += 0.5;
                layer.addPoly(base.newPolygon().centerCircle(
                    center, center.r, 20
                ));
            }

            xpdebug = new kiri.Stack(space.world, false);
            xpdebug.addLayers(layers);
            xpdebug.setVisible(0,Infinity);
            xpdebug.show();

            space.refresh();

            console.log(msg, poly);
        }
    });
}

let xpdebug;
let supsave = {};
let suptimer;

function scheduleSupportSave(widget) {
    clearTimeout(suptimer);
    supsave[widget.id] = widget;
    suptimer = setTimeout(() => {
        for (let w of Object.values(supsave)) {
            w.saveState();
        }
    }, 50);
}

function restoreSupports(widgets) {
    widgets.forEach(widget => {
        const supports = api.widgets.annotate(widget.id).support || [];
        supports.forEach(pos => {
            addWidgetSupport(widget, pos);
        });
    });
}

function addWidgetSupport(widget, pos) {
    const { x, y, z, rz, dw, dh, id } = pos;
    const sups = widget.sups = (widget.sups || {});
    // prevent duplicate restore from repeated settings load calls
    if (!sups[id]) {
        pos.box = addbox(
            { x, y, z }, 0x0000dd, id,
            { x:dw, y:dw, z:dh, rz }, { group: widget.mesh }
        );
        pos.box.pillar = Object.assign({widget}, pos);
        sups[id] = pos;
        widget.adds.push(pos.box);
        scheduleSupportSave(widget);
    }
    return sups[id];
}

function removeWidgetSupport(widget, rec) {
    const { box, id } = rec;
    widget.adds.remove(box);
    widget.mesh.remove(box);
    delete widget.sups[id];
    let sa = api.widgets.annotate(widget.id).support;
    let ix = 0;
    sa.forEach((rec,i) => {
        if (rec.id === id) {
            ix = i;
        }
    });
    sa.splice(ix,1);
    api.conf.save();
    scheduleSupportSave(widget);
    fromPillar = undefined;
}

function updateSupportVisiblity() {
    const visible = (lastMode === 'FDM' && lastView === VIEWS.ARRANGE);
    for (let w of api.widgets.all()) {
        setSupportVisiblity(w, visible);
    }
}

function setSupportVisiblity(widget, bool) {
    Object.values(widget.sups || {}).forEach(support => {
        support.box.visible = bool;
    });
}

function clearAllWidgetSupports() {
    let cleared = 0;
    api.widgets.all().forEach(widget => {
        cleared += clearWidgetSupports(widget);
    });
    return cleared;
}

function clearWidgetSupports(widget) {
    let cleared = 0;
    Object.values(widget.sups || {}).forEach(support => {
        widget.adds.remove(support.box);
        widget.mesh.remove(support.box);
        cleared++;
    });
    widget.sups = {};
    delete api.widgets.annotate(widget.id).support;
    scheduleSupportSave(widget);
    return cleared;
}

function delbox(name) {
    const old = boxes[name];
    if (old) {
        old.groupTo.remove(old);
    }
}

function addbox(point, color, name, dim = {x:1,y:1,z:1,rz:0}, opt = {}) {
    delbox(name);
    const box = boxes[name] = new Mesh(
        new BoxGeometry(dim.x, dim.y, dim.z),
        new MeshPhongMaterial({
            transparent: true,
            opacity: opt.opacity || 0.5,
            color
        })
    );
    box.position.x = point.x;
    box.position.y = point.y;
    box.position.z = point.z;

    lastBox = {point, dim};

    const group = opt.group || space.scene
    group.add(box);
    box.groupTo = group;

    if (dim.rz) {
        opt.rotate = new Quaternion().setFromAxisAngle(new Vector3(0,0,1), dim.rz);
    }
    if (opt.rotate) {
        opt.matrix = new Matrix4().makeRotationFromQuaternion(opt.rotate);
    }
    if (opt.matrix) {
        box.geometry.applyMatrix4(opt.matrix);
    }

    return box;
}

FDM.delbox = delbox;
FDM.addbox = addbox;
FDM.restoreSupports = restoreSupports;

});
