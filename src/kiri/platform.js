/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.space
// dep: moto.webui
// dep: kiri.api
// dep: kiri.consts
// dep: kiri.utils
// dep: kiri.widget
// dep: load.stl
// dep: load.obj
// dep: load.3mf
// use: kiri-mode.cam.tool
gapp.register("kiri.platform", [], (root, exports) => {

const { base, kiri, moto, load } = root;
const { api, consts, driver, utils, newWidget, Widget } = kiri;
const { ajax, js2o } = utils;
const { space } = moto;
const { util } = base;
const { COLOR, MODES } = consts;

let grouping = false;
let topZ = 0;

function current() {
    return api.conf.get();
}

function get_mode() {
    return api.mode.get_id();
}

function platformUpdateOrigin() {
    platform.update_bounds();

    const settings = current();
    const { device, process, controller, stock, bounds } = settings;
    const MODE = get_mode();

    let ruler = controller.showRulers;
    let stockCenter = stock.center || {};
    let hasStock = stock.x && stock.y && stock.z;
    let isBelt = device.bedBelt;
    let origin = settings.origin = { x: 0, y: 0, z: 0 };
    let center = MODE === MODES.FDM ? device.originCenter || device.bedRound :
       MODE === MODES.SLA ? false :
       MODE === MODES.CAM ? process.outputOriginCenter :
       device.originCenter || process.outputOriginCenter;

    if (MODE === MODES.CAM && process.camOriginTop) {
        origin.z = (hasStock ? stock.z : topZ) + 0.01;
    }

    if (!center) {
        if (hasStock) {
            origin.x = (-stock.x / 2) + stockCenter.x;
            origin.y = (stock.y / 2) - stockCenter.y;
        } else {
            if (MODE === MODES.LASER && process.outputOriginBounds) {
                let b = bounds;
                origin.x = b.min.x,
                origin.y = -b.min.y
            } else {
                origin.x = -device.bedWidth / 2;
                origin.y = device.bedDepth / 2;
            }
        }
    } else if (hasStock) {
        origin.x = stockCenter.x;
        origin.y = -stockCenter.y;
    } else if (isBelt) {
        origin.y = device.bedDepth / 2;
    }

    space.platform.setRulers(ruler, ruler, 1 / api.view.unit_scale(), 'X', isBelt ? 'Z' : 'Y');

    let { x, y, z } = origin;
    if (controller.showOrigin && MODE !== MODES.SLA) {
        space.platform.setOrigin(x, y, z, true);
    } else {
        space.platform.setOrigin(x, y, z,false);
    }
}

function platformUpdateTopZ(zdelta) {
    const { process, stock } = current();
    const hasStock = stock.x && stock.y && stock.z;
    const MODE = get_mode();

    api.widgets.each(widget => {
        if (MODE === MODES.CAM) {
            const bounds = widget.getBoundingBox();
            const wzmax = bounds.max.z;
            const zdelta = process.camZOffset || 0;
            switch (process.camZAnchor) {
               case 'top':
                   widget.setTopZ(stock.z - zdelta);
                   break;
               case 'middle':
                   widget.setTopZ(stock.z - (stock.z - wzmax) / 2);
                   break;
               case 'bottom':
                   widget.setTopZ(wzmax + zdelta);
                   break;
            }
        } else {
            widget.setTopZ(0);
        }
    });
}

function platformUpdateSize(updateDark = true) {
    const { process, device, controller } = current();
    const { showRulers, units } = controller;

    space.platform.setRound(device.bedRound);
    space.platform.setSize(
       parseInt(device.bedWidth || 300),
       parseInt(device.bedDepth || 300),
       parseFloat(device.bedHeight || 5),
       parseFloat(device.maxHeight || 100)
    );

    const ruler = showRulers,
        unitMM = units === 'mm',
        gridMajor = unitMM ? 25 : 25.4,
        gridMinor = unitMM ? 5 : 25.4 / 10;

    if (updateDark) {
       if (controller.dark) {
           space.platform.set({ light: 0.08 });
           space.platform.setFont({rulerColor:'#888888'});
           space.platform.setGrid(gridMajor, gridMinor, 0x666666, 0x333333);
           space.platform.opacity(0.05);
           space.sky.set({ color: 0, ambient: { intensity: 0.6 } });
           document.body.classList.add('dark');
       } else {
           space.platform.set({ light: 0.08 });
           space.platform.setFont({rulerColor:'#333333'});
           space.platform.setGrid(gridMajor, gridMinor, 0x999999, 0xcccccc);
           space.platform.opacity(0.2);
           space.sky.set({ color: 0xffffff, ambient: { intensity: 1.1 } });
           document.body.classList.remove('dark');
       }
       space.platform.setSize();
    }

    space.platform.setRulers(ruler, ruler, 1 / api.view.unit_scale(), 'X', device.bedBelt ? 'Z' : 'Y');
    platform.update_origin();
}

function platformUpdateBounds() {
   const bounds = new THREE.Box3();
   api.widgets.each(widget => {
       let wp = widget.track.pos;
       let wb = widget.mesh.getBoundingBox().clone();
       wb.min.x += wp.x;
       wb.max.x += wp.x;
       wb.min.y += wp.y;
       wb.max.y += wp.y;
       bounds.union(wb);
   });
   return current().bounds = bounds;
}

function platformSelectedCount() {
    return api.view.is_arrange() ? api.selection.count() : 0;
    // return viewMode === VIEWS.ARRANGE ? selectedMeshes.length : 0;
}

function platformUpdateSelected() {
    const settings = current();
    const { device } = settings;
    const { extruders } = device;
    const { selection, ui } = api;
    const { area, enable, disable } = ui.options;

    const selreal = selection.widgets();
    const selwid = selection.widgets(true);
    const selcount = selwid.length;

    area.style.display = selreal.length ? 'flex' : '';

    if (selcount) {
        let enaC = selwid.filter(w => w.meta.disabled !== true).length;
        let disC = selwid.filter(w => w.meta.disabled === true).length;
        enable.style.display = disC ? 'flex' : 'none';
        disable.style.display = enaC ? 'flex' : 'none';
        ui.nozzle.classList.add('lt-active');
        if (api.feature.meta && selcount === 1) {
            let sel = selwid[0];
            let name = sel.meta.file || sel.meta.url;
            if (name) {
                name = name
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/.png/, '')
                    .replace(/.stl/, '');
                let sp = name.indexOf('/');
                if (sp >= 0) {
                    name = name.substring(sp + 1);
                }
                ui.mesh.name.innerText = name;
            }
            ui.mesh.points.innerText = util.comma(sel.meta.vertices);
            ui.mesh.faces.innerText = util.comma(sel.meta.vertices / 3);
        } else {
            ui.mesh.name.innerText = `[${selcount}]`;
            ui.mesh.points.innerText = '-';
            ui.mesh.faces.innerText = '-';
        }
    } else {
        enable.style.display = 'none';
        disable.style.display = 'none';
        ui.mesh.name.innerText = '[0]';
        ui.mesh.points.innerText = '-';
        ui.mesh.faces.innerText = '-';
        ui.nozzle.classList.remove('lt-active');
    }

    ui.nozzle.style.display = extruders && extruders.length > 1 ? 'flex' : '';

    if (extruders) {
        for (let i = 0; i < extruders.length; i++) {
            let b = $(`sel-ext-${i}`);
            if (b) b.classList.remove('pop-sel');
        }
        selection.for_widgets(w => {
            w.setColor(COLOR.selected);
            let ext = api.widgets.annotate(w.id).extruder || 0;
            let b = $(`sel-ext-${ext}`);
            if (b) b.classList.add('pop-sel');
            w.saveState();
        }, true);
    } else {
        selection.for_widgets(w => {
            w.setColor(COLOR.selected);
        }, true);
    }
}

function platformSelect(widget, shift, recurse = true) {
    const { event, selection, view } = api;

    if (!view.is_arrange()) {
        return;
    }

    // apply select to entire group
    if (recurse && widget && widget.group.length > 1) {
        for (let w of widget.group) {
            platformSelect(w, true, false);
        }
        return;
    }

    if (selection.contains(widget)) {
        if (shift) {
            platform.deselect(widget, recurse)
        } else if (selection.count() > 1) {
            platform.deselect(undefined, recurse);
            platform.select(widget, false, recurse);
        }
    } else {
        // prevent selection in slice view
        if (!widget.isVisible()) {
            return;
        }
        if (!shift) {
            platform.deselect(undefined, recurse);
        }
        selection.add(widget);
        event.emit('widget.select', widget);
        widget.setColor(COLOR.selected);
        selection.update_info();
    }

    platform.update_selected();
    space.update();
}

function platformDeselect(widget, recurse = true) {
    const { selection, view } = api;

    if (!view.is_arrange()) {
        // don't de-select and re-color widgets in,
        // for example, sliced or preview modes
        return;
    }

    // apply deselect to entire group
    if (recurse && widget && widget.group.length > 1) {
        for (let w of widget.group) {
            platformDeselect(w, false);
        }
        return;
    }

    if (!widget) {
        api.widgets.each(function(widget) {
            platform.deselect(widget);
        });
        return;
    }

    if (selection.remove(widget)) {
        api.event.emit('widget.deselect', widget);
    }

    widget.setColor(COLOR.deselected);
    platform.update_selected();
    selection.update_info();
    space.update();
}

function platformLoad(url, onload) {
    if (url.toLowerCase().indexOf(".stl") > 0) {
        platform.load_stl(url, onload);
    } else {
        ajax(url, vertices => {
            vertices = js2o(vertices).toFloat32();
            let widget = newWidget().loadVertices(vertices);
            widget.meta.url = url;
            platform.add(widget);
            if (onload) onload(vertices, widget);
        });
    }
}

function platformLoadSTL(url, onload, formdata, credentials, headers) {
    new load.STL().load(url, (vertices, filename) => {
        if (vertices) {
            let widget = newWidget().loadVertices(vertices);
            widget.meta.file = filename;
            platform.add(widget);
            if (onload) {
                onload(vertices, widget);
            }
        }
    }, formdata, 1 / api.view.unit_scale(), credentials, headers);
}

function platformLoadURL(url, options = {}) {
    platform.group();
    load.URL.load(url, options).then(objects => {
        let widgets = [];
        for (let object of objects) {
            let widget = newWidget(undefined, options.group).loadVertices(object.mesh);
            widget.meta.file = object.file;
            platform.add(widget);
            widgets.push(widget);
        }
        platform.group_done();
        api.event.emit("load.url", {
            url,
            options,
            widgets
        });
    }).catch(error => {
        api.show.alert(error);
    });
}

function platformComputeMaxZ() {
    topZ = 0;
    api.widgets.each(widget => {
        topZ = Math.max(topZ, widget.mesh.getBoundingBox().max.z);
    });
    space.platform.setMaxZ(topZ);
}

function platformGroup() {
    grouping = true;
}

// called after all new widgets are loaded to update group positions
function platformGroupDone(skipLayout) {
    grouping = false;
    Widget.Groups.loadDone();
    if (api.feature.drop_layout && !skipLayout) {
        platform.layout();
    }
}

let deferred = [];
let deferTimeout;

function platformAdd(widget, shift, nolayout, defer) {
    api.widgets.add(widget);
    space.world.add(widget.mesh);
    widget.anno = widget.anno || {};
    widget.anno.extruder = widget.anno.extruder || 0;
    if (defer) {
        deferred.push({widget, shift, nolayout});
        clearTimeout(deferTimeout);
        deferTimeout = setTimeout(platformAddDeferred, 150);
    } else {
        platform.select(widget, shift);
        platform.compute_max_z();
        api.space.auto_save();
        platformChanged();
        api.event.emit('widget.add', widget);
        if (nolayout) {
            return;
        }
        if (!grouping) {
            platformGroupDone();
            if (!current().controller.autoLayout) {
                positionNewWidget(widget);
            }
        }
    }
}

function platformAddDeferred() {
    for (let rec of deferred) {
        let { widget, shift, nolayout } = rec;
        // platform.select(widget, shift);
        if (!nolayout && !current().controller.autoLayout) {
            positionNewWidget(widget);
        }
    }
    if (!grouping) {
        platformGroupDone();
    }
    api.event.emit('widget.add', deferred.map(r => r.widget));
    platform.compute_max_z();
    api.space.auto_save();
    platformChanged();
    deferred = [];
}

function positionNewWidget(widget) {
    if (api.widgets.count() <= 1) {
        return;
    }
    const settings = current();
    const { device } = settings;
    const { bedWidth, bedDepth } = device;
    const wbb = widget.getBoundingBox();
    const dim = {
        x: wbb.max.x - wbb.min.x,
        y: wbb.max.y - wbb.min.y
    };
    const hdim = {
        x: dim.x / 2,
        y: dim.y / 2
    };
    const bounds = base.newBounds();
    const target = base.newBounds();
    const DEG2RAD = Math.PI / 180;
    const WIDGETS = api.widgets.all();
    // look for best position for new widget that doesn't collide
    outer: for (let rad = 10; rad < 200; rad += 10) {
        inner: for (let d = 0; d < 360; d += 1) {
            let dx = Math.cos(d * DEG2RAD) * rad;
            let dy = Math.sin(d * DEG2RAD) * rad;
            bounds.set(dx - hdim.x, dx + hdim.x, dy - hdim.y, dy + hdim.y);
            for (let w = 0, wl = WIDGETS.length; w < wl; w++) {
                let wt = WIDGETS[w];
                if (wt === widget) {
                    continue;
                }
                let tpo = wt.track.pos;
                let tbb = wt.getBoundingBox();
                let dim = {
                    x: (tbb.max.x - tbb.min.x) / 2,
                    y: (tbb.max.y - tbb.min.y) / 2
                };
                target.set(tpo.x - dim.x, tpo.x + dim.x, tpo.y - dim.y, tpo.y + dim.y);
                if (target.overlaps(bounds, 5)) {
                    continue inner;
                }
            }
            widget._move(dx, dy, widget.track.pos.z, true);
            break outer;
        }
    }
}

function platformDelete(widget, defer) {
    if (!widget) {
        return;
    }
    if (Array.isArray(widget)) {
        const mc = widget.slice();
        for (let i = 0; i < mc.length; i++) {
            platform.delete(mc[i].widget || mc[i], true);
        }
        platformDeletePost();
        api.event.emit('widget.delete', widget);
        return;
    }
    kiri.client.clear(widget);
    api.widgets.remove(widget);
    api.selection.remove(widget);
    Widget.Groups.remove(widget);
    space.world.remove(widget.mesh);
    if (!defer) {
        platformDeletePost();
        api.event.emit('widget.delete', widget);
    }
}

function platformDeletePost() {
    api.view.update_slider_max();
    platform.compute_max_z();
    if (get_mode() !== MODES.FDM) {
        platform.layout();
    }
    space.update();
    platform.update_selected();
    if (api.feature.drop_layout) {
        platform.layout();
    }
    api.space.auto_save();
    platformChanged();
}

function platformChanged() {
    h.bind($('ft-select'), api.widgets.all().map(w => {
        let color;
        return [
            h.button({
                _: w.meta.file || 'no name',
                onmouseenter() {
                    color = w.getColor();
                    w.setColor(0x0088ff);
                },
                onmouseleave() {
                    w.setColor(color);
                },
                onclick() {
                    platformSelect(w, true, false);
                    color = w.getColor();
                }
            })
        ]
    }));
}

function platformSelectAll() {
    api.widgets.each(widget => {
        platform.select(widget, true, false)
    });
}

function platformLayout(event, gap) {
    const MODE = get_mode();
    const settings = current();
    const { process, device, controller } = settings;
    const { ui } = api;

    const auto = ui.autoLayout.checked,
        isBelt = device.bedBelt,
        isArrange = api.view.is_arrange(),
        layout = isArrange && auto;

    gap = gap || controller.spaceLayout;

    switch (MODE) {
        case MODES.SLA:
            gap = gap || (process.slaSupportLayers && process.slaSupportDensity ? 2 : 1);
            break;
        case MODES.CAM:
        case MODES.LASER:
            gap = gap || process.outputTileSpacing || 1;
            break;
        case MODES.FDM:
            gap = gap || ((process.sliceSupportExtra || 0) * 2) + 1;
            // auto resize device to support a larger object
            if (isBelt) {
                fitDeviceToWidgets();
            }
            break;
    }

    api.view.set_arrange();
    api.view.hide_slices();
    api.space.auto_save();

    if (!isArrange) {
        // skip auto-layout when not in arrange mode
        api.event.emit('platform.layout');
        return space.update();
    }

    // do not layout when switching back from slice view
    if (!auto || (!space && !layout)) {
        api.event.emit('platform.layout');
        return space.update();
    }

    // in CNC mode with >1 widget, force layout with spacing @ 1.5x largest tool diameter
    if (MODE === MODES.CAM && api.widgets.count() > 1) {
        let spacing = gap || 1, CAM = driver.CAM;
        if (process.camRoughOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, process.camRoughTool));
        if (process.camOutlineOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, process.camOutlineTool));
        gap = spacing * 1.5;
    }

    // space parts to account for anchor in belt mode
    if (isBelt) {
        gap += process.firstLayerBeltLead || 0;
        const WIDGETS = api.widgets.all();
        let bounds = platformUpdateBounds(),
            movey = -(device.bedDepth / 2);
        for (let widget of WIDGETS) {
            let ylen = widget.track.box.h;
            // only move the root widget in the group
            if (widget.id === widget.group.id) {
                widget.move(0, movey + ylen/2, 0, true);
                movey += ylen + gap;
            }
        }
        if (controller.spaceLayout === 0) {
            let sum = 0;
            let sorted = WIDGETS.sort((a, b) => a.track.pos.y - b.track.pos.y);
            sorted.forEach(w => {
                w.move(0, sum, 0);
                sum += w.track.box.d + 1 + gap;
            });
        }
        if (controller.spaceRandoX) {
            for (let w of WIDGETS) {
                w.move(
                    (0.5 - Math.random()) * (device.bedWidth - w.track.box.w - process.firstLayerBrim),
                    0, 0);
            }
        }
    } else {
        let i, m, sz = space.platform.size(),
            mp = [sz.x, sz.y],
            ms = [mp[0] / 2, mp[1] / 2],
            c = Widget.Groups.blocks().sort(moto.Sort),
            p = new kiri.Pack(ms[0], ms[1], gap).fit(c);

        while (!p.packed) {
            ms[0] *= 1.1;
            ms[1] *= 1.1;
            p = new kiri.Pack(ms[0], ms[1], gap).fit(c);
        }

        for (i = 0; i < c.length; i++) {
            m = c[i];
            m.fit.x += m.w / 2 + p.pad;
            m.fit.y += m.h / 2 + p.pad;
            m.move(p.max.w / 2 - m.fit.x, p.max.h / 2 - m.fit.y, 0, true);
        }
    }

    platform.update_origin();
    space.update();
    api.event.emit('platform.layout');
}

function platformLoadFiles(files, group) {
    let loaded = files.length;
    platform.group();
    for (let i = 0; i < files.length; i++) {
        const file = files[i],
            reader = new FileReader(),
            lower = files[i].name.toLowerCase(),
            israw = lower.indexOf(".raw") > 0 || lower.indexOf('.') < 0,
            isstl = lower.indexOf(".stl") > 0,
            isobj = lower.indexOf(".obj") > 0,
            is3mf = lower.indexOf(".3mf") > 0,
            issvg = lower.indexOf(".svg") > 0,
            ispng = lower.indexOf(".png") > 0,
            isjpg = lower.indexOf(".jpg") > 0,
            isgcode = lower.indexOf(".gcode") > 0 || lower.indexOf(".nc") > 0,
            isset = lower.indexOf(".b64") > 0 || lower.indexOf(".km") > 0,
            iskmz = lower.indexOf(".kmz") > 0,
            isini = lower.indexOf(".ini") > 0;
        reader.file = files[i];
        reader.onloadend = function(e) {
            function load_dec() {
                if (--loaded === 0) platform.group_done(isgcode);
            }
            if (israw) {
                platform.add(
                    newWidget(undefined, group)
                    .loadVertices(JSON.parse(e.target.result).toFloat32())
                );
                load_dec();
            } else if (api.feature.on_load && (isstl || isobj || is3mf)) {
                api.feature.on_load(e.target.result, file);
                load_dec();
            } else if (isstl) {
                if (api.feature.on_add_stl) {
                    api.feature.on_add_stl(e.target.result, file);
                } else {
                    platform.add(
                        newWidget(undefined, group)
                        .loadVertices(new load.STL().parse(e.target.result, api.view.unit_scale()))
                        .saveToCatalog(e.target.file.name)
                    );
                }
                load_dec();
            } else if (isobj) {
                let objs = load.OBJ.parse(e.target.result);
                let odon = function() {
                    for (let obj of objs) {
                        let name = e.target.file.name;
                        if (obj.name) {
                            name = obj.name + ' - ' + name;
                        }
                        platform.add(
                            newWidget(undefined, group)
                            .loadVertices(obj.toFloat32(), true)
                            .saveToCatalog(name)
                        );
                    }
                    load_dec();
                };
                if (objs.length > 1 && !group) {
                    api.uc.confirm('group objects?').then(ok => {
                        if (ok) {
                            group = [];
                        }
                        odon();
                    });
                } else {
                    odon();
                }
            } else if (is3mf) {
                let odon = function(models) {
                    let msg = api.show.alert('Adding Objects');
                    for (let model of models) {
                        let name = e.target.file.name;
                        if (model.name) {
                            name = model.name + ' - ' + name;
                        }
                        platform.add(
                            newWidget(undefined, group)
                            .loadVertices(model.faces.toFloat32())
                            .saveToCatalog(name)
                        );
                    }
                    load_dec();
                    api.hide.alert(msg);
                }
                let msg = api.show.alert('Decoding 3MF');
                load.TMF.parseAsync(e.target.result).then(models => {
                    api.hide.alert(msg);
                    if (models.length > 1 && !group) {
                        UC.confirm(`group ${models.length} objects?`).then(ok => {
                            if (ok) {
                                group = [];
                            }
                            odon(models);
                        });
                    } else {
                        odon(models);
                    }
                });
            } else if (isgcode) {
                api.function.parse(e.target.result, 'gcode');
                load_dec();
            } else if (issvg) {
                group = group || [];
                let name = e.target.file.name;
                let svg = load.SVG.parse(e.target.result);
                let ind = 0;
                for (let v of svg) {
                    let num = ind++;
                    platform.add(
                        newWidget(undefined, group)
                        .loadVertices(svg[num].toFloat32())
                        .saveToCatalog(num ? `${name}-${num}` : name)
                    );
                }
                load_dec();
            } else if (iskmz) api.settings.import_zip(e.target.result, true);
            else if (isset) api.settings.import(e.target.result, true);
            else if (ispng) api.image.dialog(e.target.result, e.target.file.name);
            else if (isjpg) api.image.convert(e.target.result, e.target.file.name);
            else if (isini) api.settings.import_prusa(e.target.result);
            else api.show.alert(`Unsupported file: ${files[i].name}`);
        };
        if (isstl || ispng || isjpg || iskmz) {
            reader.readAsArrayBuffer(reader.file);
        } else {
            reader.readAsBinaryString(reader.file);
        }
    }
}

function fitDeviceToWidgets() {
    let maxy = 0;
    api.widgets.each(widget => {
        let wb = widget.mesh.getBoundingBox().clone();
        maxy = Math.max(maxy, wb.max.y - wb.min.y);
    });
    const { device } = current();
    if (maxy > device.bedDepth) {
        device.bedDepthSave = device.bedDepth;
        device.bedDepth = maxy + 10;
        space.platform.setSize(
            parseInt(device.bedWidth),
            parseInt(device.bedDepth),
            parseFloat(device.bedHeight),
            parseFloat(device.maxHeight)
        );
        space.platform.update();
        return true;
    }
}

const platform = api.platform = {
    fit: fitDeviceToWidgets,
    add: platformAdd,
    delete: platformDelete,
    layout: platformLayout,
    group: platformGroup,
    group_done: platformGroupDone,
    load: platformLoad,
    load_stl: platformLoadSTL,
    load_url: platformLoadURL,
    load_files: platformLoadFiles,
    deselect: platformDeselect,
    select: platformSelect,
    select_all: platformSelectAll,
    selected_count: platformSelectedCount,
    compute_max_z: platformComputeMaxZ,
    update_origin: platformUpdateOrigin,
    update_bounds: platformUpdateBounds,
    update_size: platformUpdateSize,
    update_top_z: platformUpdateTopZ,
    update_selected: platformUpdateSelected,
    update: space.platform.update,
    set_font: space.platform.setFont,
    show_axes: space.platform.showAxes,
    show_volume: space.platform.showVolume,
    top_z() { return topZ },
    clear() { api.space.clear(); api.space.save(true)  }
};

});
