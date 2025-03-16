/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: kiri.api
// dep: kiri.main
// dep: kiri.lang
// dep: kiri.stats
// dep: kiri.consts
// dep: kiri.devices
// dep: kiri.platform
// dep: kiri.selection
// use: kiri.tools
// use: kiri.pack
gapp.register("kiri.init", (root, exports) => {

    // builds and wires up the UI
    let { base, kiri } = root,
        { api, catalog, consts, space } = kiri,
        { sdb, stats, platform, selection, ui, uc } = api,
        { VIEWS, MODES, SEED } = consts,
        { LANG, LOCAL, SETUP } = api.const,
        { CAM, SLA, FDM, LASER, DRAG, WJET, WEDM } = MODES,
        WIN = self.window,
        DOC = self.document,
        STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
        TWOD = [LASER, DRAG, WJET, WEDM],
        TWONED = [LASER, DRAG, WJET],
        THREED = [FDM, CAM, SLA],
        GCODE = [FDM, CAM, ...TWOD],
        CAM_LZR = [CAM, ...TWOD],
        FDM_LZN = [FDM, ...TWONED],
        NO_WEDM = [FDM, CAM, SLA, LASER, DRAG, WJET],
        FDM_CAM = [FDM, CAM],
        proto = location.protocol,
        platformColor,
        separator = true,
        hideable = true,
        inline = true,
        driven = true,
        trigger = true,
        units = true;

    // copy version from grid app
    kiri.version = gapp.version;

    function settings() {
        return api.conf.get();
    }

    function updateTool(ev) {
        api.tool.update(ev);
    }

    function checkSeed(then) {
        // skip sample object load in onshape (or any script postload)
        if (!sdb[SEED]) {
            sdb[SEED] = new Date().getTime();
            if (!SETUP.s && api.feature.seed) {
                if (SETUP.debug) {
                    return then();
                }
                platform.load_stl("/obj/cube.stl", function(vert) {
                    catalog.putFile("sample cube.stl", vert);
                    platform.update_bounds();
                    space.view.home();
                    setTimeout(() => { api.space.save(true) },500);
                    then();
                    api.help.show();
                });
                return true;
            }
        }
        return false;
    }

    function unitsSave() {
        api.conf.update({ controller: true });
        platform.update_size();
    }

    function aniMeshSave() {
        api.conf.update({ controller: true });
        api.conf.save();
    }

    function lineTypeSave() {
        const sel = ui.lineType.options[ui.lineType.selectedIndex];
        if (sel) {
            settings().controller.lineType = sel.value;
            api.conf.save();
        }
    }

    function thinWallSave() {
        let opt = ui.sliceDetectThin;
        let level = opt.options[opt.selectedIndex];
        if (level) {
            settings().process.sliceDetectThin = level.value;
            api.conf.save();
        }
    }

    function detailSave() {
        let level = ui.detail.options[ui.detail.selectedIndex];
        if (level) {
            level = level.value;
            let rez = base.config.clipperClean;
            switch (level) {
                case '100': rez = 50; break;
                case '75': rez = base.config.clipperClean; break;
                case '50': rez = 500; break;
                case '25': rez = 1000; break;
            }
            kiri.client.config({
                base: { clipperClean: rez }
            });
            settings().controller.detail = level;
            api.conf.save();
        }
    }

    function speedSave() {
        settings().controller.showSpeeds = ui.showSpeeds.checked;
        api.view.update_speeds();
    }

    function zAnchorSave() {
        api.conf.update();
        api.platform.update_top_z();
    }

    function setThreaded(bool) {
        if (bool) {
            kiri.client.pool.start();
        } else {
            kiri.client.pool.stop();
        }
        return bool;
    }

    api.event.on("set.threaded", bool => setThreaded(bool));

    function booleanSave() {
        let control = settings().controller;
        let doAlert = ui.ortho.checked !== control.ortho;
        if (control.assembly != ui.assembly.checked) {
            kiri.client.wasm(ui.assembly.checked);
        }
        if (control.antiAlias != ui.antiAlias.checked) {
            api.show.alert('Page Reload Required to Change Aliasing');
        }
        control.shiny = ui.shiny.checked;
        control.drawer = ui.drawer.checked;
        control.scrolls = ui.scrolls.checked;
        control.showOrigin = ui.showOrigin.checked;
        control.showRulers = ui.showRulers.checked;
        control.autoLayout = ui.autoLayout.checked;
        control.freeLayout = ui.freeLayout.checked;
        control.spaceRandoX = ui.spaceRandoX.checked;
        control.autoSave = ui.autoSave.checked;
        control.antiAlias = ui.antiAlias.checked;
        control.reverseZoom = ui.reverseZoom.checked;
        control.dark = ui.dark.checked;
        control.exportOcto = ui.exportOcto.checked;
        control.exportGhost = ui.exportGhost.checked;
        control.exportLocal = ui.exportLocal.checked;
        control.exportThumb = ui.exportThumb.checked;
        control.exportPreview = ui.exportPreview.checked;
        control.healMesh = ui.healMesh.checked;
        control.threaded = setThreaded(ui.threaded.checked);
        control.assembly = ui.assembly.checked;
        control.ortho = ui.ortho.checked;
        control.devel = ui.devel.checked;
        space.view.setZoom(control.reverseZoom, control.zoomSpeed);
        // platform.layout();
        api.conf.save();
        api.platform.update_size();
        updateStats();
        updateDrawer();
        api.event.emit('boolean.update');
        if (doAlert) {
            api.show.alert("change requires page refresh");
        }
    }

    function updateDrawer() {
        const { drawer, scrolls } = settings().controller;
        $c('app', drawer  ? 'slideshow' : '',   drawer  ? '' : 'slideshow');
        $c('app', scrolls ? '' : 'hide-scroll', scrolls ? 'hide-scroll' : '');
    }

    function updateStats() {
        if (self.debug !== true) {
            return;
        }
        let { div, fps, rms, rnfo } = ui.stats;
        div.style.display = 'flex';
        setInterval(() => {
            const nrms = space.view.getRMS().toFixed(1);
            const nfps = space.view.getFPS().toFixed(1);
            const rend = space.renderInfo();
            const { memory, render } = rend;
            if (nfps !== fps.innerText) {
                fps.innerText = nfps;
            }
            if (nrms !== rms.innerText) {
                rms.innerText = nrms;
            }
            if (rnfo.offsetParent !== null) {
                rnfo.innerHTML = Object.entries({ ...memory, ...render, render_ms: nrms, frames_sec: nfps }).map(row => {
                    return `<div>${row[0]}</div><label>${base.util.comma(row[1])}</label>`
                }).join('');
            }
        }, 100);
    }

    function onBooleanClick(el) {
        // copy some ui elements to target settings
        let settings = api.conf.get();
        settings.device.bedBelt = ui.deviceBelt.checked && api.mode.is_fdm();
        settings.device.bedRound = ui.deviceRound.checked && api.mode.is_fdm();
        settings.device.originCenter = ui.deviceOrigin.checked || ui.deviceRound.checked;
        settings.device.fwRetract = ui.fwRetract.checked;
        // refresh vars and other ui elements
        uc.refresh();
        if (el === ui.camStockIndexed) {
            api.view.set_arrange();
        }
        api.conf.update();
        DOC.activeElement.blur();
        api.event.emit("boolean.click");
        api.devices.update_laser_state();
    }

    function onButtonClick(ev) {
        let target = ev.target;
        while (target && target.tagName !== 'BUTTON') {
            target = target.parentNode;
        }
        api.event.emit("button.click", target);
    }

    function inputHasFocus() {
        let active = DOC.activeElement;
        return active && (active.nodeName === "INPUT" || active.nodeName === "TEXTAREA");
    }

    function cca(c) {
        return c.charCodeAt(0);
    }

    function keyUpHandler(evt) {
        if (api.feature.on_key) {
            if (api.feature.on_key({up:evt})) return;
        }
        for (let handler of api.feature.on_key2) {
            if (handler({up:evt})) return;
        }
        switch (evt.keyCode) {
            // escape
            case 27:
                // blur text input focus
                DOC.activeElement.blur();
                // dismiss modals
                api.modal.hide();
                // deselect widgets
                platform.deselect();
                // hide all dialogs
                api.dialog.hide();
                // cancel slicing
                api.function.cancel();
                // and send an event (used by FDM client)
                api.event.emit("key.esc");
                break;
        }
        return false;
    }

    function keyDownHandler(evt) {
        if (api.modal.visible()) {
            return false;
        }
        if (api.feature.on_key) {
            if (api.feature.on_key({down:evt})) return;
        }
        for (let handler of api.feature.on_key2) {
            if (handler({down:evt})) return;
        }
        let move = evt.altKey ? 5 : 0,
            deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);
        switch (evt.keyCode) {
            case 8: // apple: delete/backspace
            case 46: // others: delete
                if (inputHasFocus()) return false;
                platform.delete(selection.meshes());
                evt.preventDefault();
                break;
            case 37: // left arrow
                if (inputHasFocus()) return false;
                if (deg) selection.rotate(0, 0, -deg);
                if (move > 0) selection.move(-move, 0, 0);
                evt.preventDefault();
                break;
            case 39: // right arrow
                if (inputHasFocus()) return false;
                if (deg) selection.rotate(0, 0, deg);
                if (move > 0) selection.move(move, 0, 0);
                evt.preventDefault();
                break;
            case 38: // up arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return api.show.layer(api.var.layer_at+1);
                if (deg) selection.rotate(deg, 0, 0);
                if (move > 0) selection.move(0, move, 0);
                evt.preventDefault();
                break;
            case 40: // down arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return api.show.layer(api.var.layer_at-1);
                if (deg) selection.rotate(-deg, 0, 0);
                if (move > 0) selection.move(0, -move, 0);
                evt.preventDefault();
                break;
            case 65: // 'a' for select all
                if (evt.metaKey || evt.ctrlKey) {
                    if (inputHasFocus()) return false;
                    evt.preventDefault();
                    platform.deselect();
                    platform.select_all();
                }
                break;
            case 83: // 's' for save workspace
                if (evt.ctrlKey) {
                    evt.preventDefault();
                    api.conf.save();
                    console.log("settings saved");
                } else
                if (evt.metaKey) {
                    evt.preventDefault();
                    api.space.save();
                    api.settings.sync.put();
                }
                break;
            case 76: // 'l' for restore workspace
                if (evt.metaKey) {
                    evt.preventDefault();
                    api.space.restore();
                }
                break;
        }
    }

    function keyHandler(evt) {
        let handled = true;
        if (api.modal.visible() || inputHasFocus()) {
            return false;
        }
        if (api.feature.on_key) {
            if (api.feature.on_key({key:evt})) return;
        }
        for (let handler of api.feature.on_key2) {
            if (handler({key:evt})) return;
        }
        if (evt.ctrlKey) {
            switch (evt.key) {
                case 'g': return api.group.merge();
                case 'u': return api.group.split();
            }
        }
        switch (evt.charCode) {
            case cca('`'): api.show.slices(0); break;
            case cca('0'): api.show.slices(api.var.layer_max); break;
            case cca('1'): api.show.slices(api.var.layer_max/10); break;
            case cca('2'): api.show.slices(api.var.layer_max*2/10); break;
            case cca('3'): api.show.slices(api.var.layer_max*3/10); break;
            case cca('4'): api.show.slices(api.var.layer_max*4/10); break;
            case cca('5'): api.show.slices(api.var.layer_max*5/10); break;
            case cca('6'): api.show.slices(api.var.layer_max*6/10); break;
            case cca('7'): api.show.slices(api.var.layer_max*7/10); break;
            case cca('8'): api.show.slices(api.var.layer_max*8/10); break;
            case cca('9'): api.show.slices(api.var.layer_max*9/10); break;
            case cca('?'):
                api.help.show();
                break;
            case cca('Z'): // reset stored state
                uc.confirm('clear all settings and preferences?').then(yes => {
                    if (yes) {
                        sdb.clear();
                        WIN.location.reload();
                    }
                });
                break;
            case cca('C'): // refresh catalog
                catalog.refresh();
                break;
            case cca('i'): // file import
                api.event.import();
                break;
            case cca('S'): // slice
            case cca('s'): // slice
                api.function.slice();
                break;
            case cca('P'): // prepare
            case cca('p'): // prepare
                if (api.mode.get() !== 'SLA') {
                    // hidden in SLA mode
                    api.function.print();
                }
                break;
            case cca('X'): // export
            case cca('x'): // export
                api.function.export();
                break;
            case cca('g'): // CAM animate
                api.function.animate();
                break;
            case cca('O'): // manual rotation
                rotateInputSelection();
                break;
            case cca('r'): // recent files
                api.modal.show('files');
                break;
            case cca('q'): // preferences
                api.modal.show('prefs');
                break;
            case cca('l'): // device
                settingsLoad();
                break;
            case cca('e'): // device
                api.show.devices();
                break;
            case cca('o'): // tools
                api.show.tools();
                break;
            case cca('c'): // local devices
                api.show.local();
                break;
            case cca('v'): // toggle single slice view mode
                if (api.view.get() === VIEWS.ARRANGE) {
                    api.space.set_focus(selection.widgets());
                }
                if (api.var.layer_hi == api.var.layer_lo) {
                    api.var.layer_lo = 0;
                } else {
                    api.var.layer_lo = api.var.layer_hi;
                }
                api.show.slices();
                break;
            case cca('d'): // duplicate object
                duplicateSelection();
                break;
            case cca('m'): // mirror object
                mirrorSelection();
                break;
            case cca('a'):
                if (api.view.get() === VIEWS.ARRANGE) {
                    // auto arrange items on platform
                    platform.layout();
                    if (!api.conf.get().controller.spaceRandoX) {
                        api.space.set_focus(selection.widgets());
                    }
                } else {
                    // go to arrange view
                    api.view.set(VIEWS.ARRANGE);
                }
                break;
            default:
                api.event.emit('keypress', evt);
                handled = false;
                break;
        }
        if (handled) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        return false;
    }

    function duplicateSelection() {
        selection.duplicate();
    }

    function mirrorSelection() {
        selection.mirror();
    }

    function keys(o) {
        let key, list = [];
        for (key in o) { if (o.hasOwnProperty(key)) list.push(key) }
        return list.sort();
    }

    function clearSelected(children) {
        for (let i=0; i<children.length; i++) {
            children[i].setAttribute('class','');
        }
    }

    function rotateInputSelection() {
        if (selection.meshes().length === 0) {
            api.show.alert("select object to rotate");
            return;
        }
        api.uc.prompt("Enter X,Y,Z degrees of rotation","").then(coord => {
            coord = (coord || '').split(',');
            let prod = Math.PI / 180,
                x = parseFloat(coord[0] || 0.0) * prod,
                y = parseFloat(coord[1] || 0.0) * prod,
                z = parseFloat(coord[2] || 0.0) * prod;
            selection.rotate(x, y, z);
        });
    }

    function positionSelection() {
        if (selection.meshes().length === 0) {
            api.show.alert("select object to position");
            return;
        }
        let current = settings(),
            { device, process} = current,
            center = process.ctOriginCenter || process.camOriginCenter || device.bedRound || device.originCenter,
            bounds = boundsSelection();

        api.uc.prompt("Enter X,Y coordinates for selection","").then(coord => {
            coord = (coord || '').split(',');
            let x = parseFloat(coord[0] || 0.0),
                y = parseFloat(coord[1] || 0.0),
                z = parseFloat(coord[2] || 0.0);

            if (!center) {
                x = x - device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
                y = y - device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
            }

            selection.move(x, y, z, true);
        });
    }

    function deviceExport(exp, name) {
        name = (name || "device")
            .toLowerCase()
            .replace(/ /g,'_')
            .replace(/\./g,'_');
        uc.prompt("Export Device Filename", name).then(name => {
            if (name) {
                api.util.download(exp, `${name}.km`);
            }
        });
    }

    function objectsExport(format = "stl") {
        // return selection.export();
        uc.confirm("Export Filename", {ok:true, cancel: false}, `selected.${format}`).then(name => {
            if (!name) return;
            if (name.toLowerCase().indexOf(`.${format}`) < 0) {
                name = `${name}.${format}`;
            }
            api.util.download(selection.export(format), name);
        });
    }

    function workspaceNew() {
        uc.confirm("Clear Workspace?", {ok:true, cancel: false}).then(value => {
            if (value === true) {
                let proc = api.settings.proc();
                proc.ops && (proc.ops.length = 0);
                proc.op2 && (proc.op2.length = 0);
                api.platform.clear();
            }
        });
    }

    function profileExport() {
        const opt = {pre: [
            "<div class='f-col a-center gap5 mlr10'>",
            "  <h3>Workspace Export</h3>",
            "  <label>This will create a backup of your</label>",
            "  <label>workspace, devices, and settings</label>",
            "  <span class='mt10'><input id='excwork' type='checkbox'>&nbsp;Exclude meshes</span>",
            "</div>"
        ]};
        let suggestion = "workspace";
        let file = api.widgets.all()[0]?.meta.file || '';
        if (file) {
            suggestion = `${suggestion}_${file.split('.')[0]}`.replaceAll(' ','_');
        };
        uc.confirm("Filename", {ok:true, cancel: false}, suggestion, opt).then(name => {
            if (!name) return;

            let work = !$('excwork').checked;
            let json = api.conf.export({work, clear:true});

            kiri.client.zip([
                {name:"workspace.json", data:JSON.stringify(json)}
            ], progress => {
                api.show.progress(progress.percent/100, "compressing workspace");
            }, output => {
                api.show.progress(0);
                api.util.download(output, `${name}.kmz`);
            });
        });
    }

    function settingsSave(ev, name) {
        if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }

        api.dialog.hide();
        let mode = api.mode.get(),
            s = settings(),
            def = "default",
            cp = s.process,
            pl = s.sproc[mode],
            lp = s.cproc[mode],
            saveAs = (name) => {
                if (!name) {
                    return;
                }
                let np = pl[name] = {};
                cp.processName = name;
                pl[name] = Object.clone(cp);
                for (let k in cp) {
                    if (!cp.hasOwnProperty(k)) continue;
                    np[k] = cp[k];
                }
                s.cproc[mode] = name;
                s.devproc[s.device.deviceName] = name;
                api.conf.save();
                api.conf.update();
                api.event.settings();
                sync_put();
            };

        if (name) {
            saveAs(name);
        } else {
            uc.prompt("Save Settings As", cp ? lp || def : def).then(saveAs);
        }
    }

    function settingsLoad() {
        api.conf.show();
    }

    function updateDeviceSize() {
        api.conf.update();
        platform.update_size();
        platform.update_origin();
    }

    async function sync_put() {
        await api.settings.sync.put();
    }

    function dragOverHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        // prevent drop actions when a dialog is open
        if (api.modal.visible()) {
            return;
        }

        evt.dataTransfer.dropEffect = 'copy';
        let oldcolor = space.platform.setColor(0x00ff00);
        if (oldcolor !== 0x00ff00) platformColor = oldcolor;
    }

    function dragLeave() {
        space.platform.setColor(platformColor);
    }

    function dropHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        // prevent drop actions when a dialog is open
        if (api.modal.visible()) {
            return;
        }

        space.platform.setColor(platformColor);

        let files = evt.dataTransfer.files;

        switch (api.feature.drop_group) {
            case true:
                return api.platform.load_files(files, []);
            case false:
                return api.platform.load_files(files, undefined);
        }

        if (files.length === 1) {
            api.platform.load_files(files);
        } else if (files.length > 1) {
            uc.confirm(`group ${files.length} files?`).then(yes => {
                api.platform.load_files(files, yes ? [] : undefined);
            });
        }
    }

    function loadCatalogFile(e) {
        api.widgets.load(e.target.getAttribute('load'), function(widget) {
            platform.add(widget);
            api.dialog.hide();
        });
    }

    function updateCatalog(files) {
        let table = ui.catalogList,
            list = [];
        table.innerHTML = '';
        for (let name in files) {
            list.push({n:name, ln:name.toLowerCase(), v:files[name].vertices, t:files[name].updated});
        }
        list.sort(function(a,b) {
            return a.ln < b.ln ? -1 : 1;
        });
        for (let i=0; i<list.length; i++) {
            let row = DOC.createElement('div'),
                renm = DOC.createElement('button'),
                load = DOC.createElement('button'),
                size = DOC.createElement('button'),
                del = DOC.createElement('button'),
                file = list[i],
                name = file.n,
                date = new Date(file.t),
                split = name.split('.'),
                short = split[0],
                ext = split[1] ? `.${split[1]}` : '';

            renm.setAttribute('class', 'rename');
            renm.setAttribute('title', 'rename file');
            renm.innerHTML = '<i class="far fa-edit"></i>';
            renm.onclick = () => {
                api.uc.prompt(`rename file`, short).then(newname => {
                    if (newname && newname !== short) {
                        catalog.rename(name, `${newname}${ext}`, then => {
                            api.modal.show('files');
                        });
                    }
                });
            };

            load.setAttribute('load', name);
            load.setAttribute('title', `file: ${name}\nvertices: ${file.v}\ndate: ${date}`);
            load.onclick = loadCatalogFile;
            load.appendChild(DOC.createTextNode(short));

            del.setAttribute('del', name);
            del.setAttribute('title', "remove '"+name+"'");
            del.onclick = () => { catalog.deleteFile(name) };
            del.innerHTML = '<i class="far fa-trash-alt"></i>';

            size.setAttribute("disabled", true);
            size.setAttribute("class", "label");
            size.appendChild(DOC.createTextNode(base.util.comma(file.v)));

            row.setAttribute("class", "f-row a-center");
            row.appendChild(renm);
            row.appendChild(load);
            row.appendChild(size);
            row.appendChild(del);
            table.appendChild(row);
        }
    }

    function isMultiHead() {
        let dev = api.conf.get().device;
        return isNotBelt() && dev.extruders && dev.extruders.length > 1;
    }

    function isBelt() {
        return api.device.isBelt();
    }

    function isNotBelt() {
        return !isBelt();
    }

    // MAIN INITIALIZATION FUNCTION
    function init_one() {
        let { event, conf, view, show } = api,
            { bound, toInt, toFloat } = uc,
            { newBlank, newButton, newBoolean, newGroup, newInput } = uc,
            { newSelect, newLabel, newValue, newRow, newGCode, newDiv } = uc;

        event.emit('init.one');

        // ensure we have settings from last session
        conf.restore();

        let container = $('container'),
            gcode = $('dev-gcode'),
            tracker = $('tracker'),
            controller = settings().controller;

        WIN.addEventListener("resize", () => {
            event.emit('resize');
        });

        event.on('resize', () => {
            if (WIN.innerHeight < 800) {
                ui.modalBox.classList.add('mh85');
            } else {
                ui.modalBox.classList.remove('mh85');
            }
            view.update_slider();
        });

        space.sky.showGrid(false);
        space.sky.setColor(controller.dark ? 0 : 0xffffff);
        space.setAntiAlias(controller.antiAlias);
        space.init(container, function (delta) {
            let vars = api.var;
            if (vars.layer_max === 0 || !delta) return;
            if (controller.reverseZoom) delta = -delta;
            let same = vars.layer_hi === vars.layer_lo;
            let track = vars.layer_lo > 0;
            if (delta > 0) {
                vars.layer_hi = Math.max(same ? 0 : vars.layer_lo, vars.layer_hi - 1);
                if (track) {
                    vars.layer_lo = Math.max(0, vars.layer_lo - 1);
                }
            } else if (delta < 0) {
                vars.layer_hi = Math.min(vars.layer_max, vars.layer_hi + 1);
                if (track) {
                    vars.layer_lo = Math.min(vars.layer_hi, vars.layer_lo + 1);
                }
            }
            if (same) {
                vars.layer_lo = vars.layer_hi;
            }
            view.update_slider();
            show.slices();
        }, controller.ortho);
        space.platform.onMove(conf.save);
        space.platform.setRound(true);
        space.useDefaultKeys(api.feature.on_key === undefined || api.feature.on_key_defaults);
        updateDrawer();

        // api augmentation with local functions
        api.device.export = deviceExport;
        let anim = ui.anim = {};

        Object.assign(ui, {
            tracker:            tracker,
            container:          container,

            alert: {
                dialog:         $('alert-area'),
                text:           $('alert-text')
            },
            func: {
                slice:          $('act-slice'),
                preview:        $('act-preview'),
                animate:        $('act-animate'),
                export:         $('act-export')
            },
            label: {
                slice:          $('label-slice'),
                preview:        $('label-preview'),
                animate:        $('label-animate'),
                export:         $('label-export'),
            },
            acct: {
                help:           $('app-help'),
                don8:           $('app-don8'),
                mesh:           $('app-mesh'),
                export:         $('app-export')
            },
            dev: {
                header:         $('dev-header'),
                search:         $('dev-search'),
                filter:         $('dev-filter')
            },
            mesh: {
                name:           $('mesh-name'),
                points:         $('mesh-points'),
                faces:          $('mesh-faces'),
            },

            stats: {
                fps:            $('fps'),
                rms:            $('rms'),
                div:            $('stats'),
                rnfo:           $('rnfo'),
            },

            load:               $('load-file'),
            speeds:             $('speeds'),
            speedbar:           $('speedbar'),
            context:            $('context-menu'),

            ltsetup:            $('lt-setup'),
            ltfile:             $('lt-file'),
            ltview:             $('lt-view'),
            ltact:              $('lt-start'),
            edit:               $('lt-tools'),
            nozzle:             $('menu-nozzle'),

            modal:              $('modal'),
            modalBox:           $('modal-box'),
            modals: {
                help:               $('mod-help'),
                setup:              $('mod-setup'),
                prefs:              $('mod-prefs'),
                files:              $('mod-files'),
                saves:              $('mod-saves'),
                tools:              $('mod-tools'),
                xany:               $('mod-x-any'),
                xsla:               $('mod-x-sla'),
                xlaser:             $('mod-x-laser'),
                local:              $('mod-local'),
                don8:               $('mod-don8'),
                any:                $('mod-any'),
            },

            catalogBody:        $('catalogBody'),
            catalogList:        $('catalogList'),

            devices:            $('devices'),
            deviceAdd:          $('device-add'),
            deviceDelete:       $('device-del'),
            deviceRename:       $('device-ren'),
            deviceExport:       $('device-exp'),
            deviceSave:         $('device-save'),

            toolsSave:          $('tools-save'),
            toolsClose:         $('tools-close'),
            toolsImport:        $('tools-import'),
            toolsExport:        $('tools-export'),
            toolSelect:         $('tool-select'),
            toolAdd:            $('tool-add'),
            toolCopy:           $('tool-dup'),
            toolDelete:         $('tool-del'),
            toolType:           $('tool-type'),
            toolName:           $('tool-name'),
            toolNum:            $('tool-num'),
            toolFluteDiam:      $('tool-fdiam'),
            toolFluteLen:       $('tool-flen'),
            toolShaftDiam:      $('tool-sdiam'),
            toolShaftLen:       $('tool-slen'),
            toolTaperAngle:     $('tool-tangle'),
            toolTaperTip:       $('tool-ttip'),
            toolMetric:         $('tool-metric'),

            setMenu:            $('set-menu'),
            settings:           $('settings'),
            settingsBody:       $('settingsBody'),
            settingsList:       $('settingsList'),

            slider:             $('slider'),
            sliderMax:          $('slider-max'),
            sliderMin:          $('slider-zero'),
            sliderLo:           $('slider-lo'),
            sliderMid:          $('slider-mid'),
            sliderHi:           $('slider-hi'),
            sliderHold:         $('slider-hold'),
            sliderRange:        $('slider-center'),

            loading:            $('progress').style,
            progress:           $('progbar').style,
            prostatus:          $('progtxt'),

            selection:          $('selection'),
            sizeX:              $('size_x'),
            sizeY:              $('size_y'),
            sizeZ:              $('size_z'),
            scaleX:             $('scale_x'),
            scaleY:             $('scale_y'),
            scaleZ:             $('scale_z'),
            lockX:              $('lock_x'),
            lockY:              $('lock_y'),
            lockZ:              $('lock_z'),
            stock:              $('stock'),
            stockWidth:         $('stock-width'),
            stockDepth:         $('stock-width'),
            stockHeight:        $('stock-width'),

            /** CAM Animation Bar */

            _____: {
                _____: newDiv({ addto: $('layer-animate'), set:true }),
                row: newRow([
                    anim.replay   = newButton(null,"anim.replay",{icon:'<i class="fas fa-fast-backward"></i>',title:"restart"}),
                    anim.play     = newButton(null,"anim.play",{icon:'<i class="fas fa-play"></i>',title:"play"}),
                    anim.pause    = newButton(null,"anim.pause",{icon:'<i class="fas fa-pause"></i>',title:"pause"}),
                    anim.step     = newButton(null,"anim.step",{icon:'<i class="fas fa-step-forward"></i>',title:"single step"}),
                    anim.speed    = newButton(null,"anim.fast",{icon:'<i class="fas fa-forward"></i>',title:"toggle speed"}),
                    anim.labspd   = newValue(3, {class:"center padleft"}),
                    anim.labx     = newLabel("X", {class:"padleft"}),
                    anim.valx     = newValue(7, {class:"center"}),
                    anim.laby     = newLabel("Y", {class:"padleft"}),
                    anim.valy     = newValue(7, {class:"center"}),
                    anim.labz     = newLabel("Z", {class:"padleft"}),
                    anim.valz     = newValue(6, {class:"center"}),
                    anim.laba     = newLabel("A", {class:"padleft hide"}),
                    anim.vala     = newValue(6, {class:"center hide"}),
                    anim.labpro   = newLabel("%", {class:"padleft"}),
                    anim.progress = newValue(5, {class:"center"}),
                    anim.trans    = newButton(null,"anim.trans",{icon:'<i class="fa-solid fa-border-none"></i>',title:"transparency",class:"padleft"}),
                    anim.model    = newButton(null,"anim.model",{icon:'<i class="fa-solid fa-eye"></i>',title:"show model"}),
                    anim.shade    = newButton(null,"anim.stock",{icon:'<i class="fa-solid fa-cube"></i>',title:"stock box"}),
                ])
            },

            /** Device Browser / Editor */

            _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true }),
            device:           newGroup(LANG.dv_gr_dev, null, {group:"ddev", inline, class:"noshow"}),

            _____:            newGroup("workspace", null, {group:"dext", inline}),
            bedWidth:         newInput('X (width)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:updateDeviceSize}),
            bedDepth:         newInput('Y (depth)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:updateDeviceSize}),
            maxHeight:        newInput('Z (height)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:updateDeviceSize}),
            resolutionX:      newInput(LANG.dv_rezx_s, {title:LANG.dv_rezx_l, convert:toInt, size:6, modes:SLA}),
            resolutionY:      newInput(LANG.dv_rezy_s, {title:LANG.dv_rezy_l, convert:toInt, size:6, modes:SLA}),
            _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:NO_WEDM }),
            _____:            newGroup("firmware", null, {group:"dext", inline, modes:NO_WEDM}),
            fwRetract:        newBoolean(LANG.dv_retr_s, onBooleanClick, {title:LANG.dv_retr_l, modes:FDM}),
            deviceOrigin:     newBoolean(LANG.dv_orgc_s, onBooleanClick, {title:LANG.dv_orgc_l, modes:FDM_LZN, show:() => !ui.deviceRound.checked}),
            deviceRound:      newBoolean(LANG.dv_bedc_s, onBooleanClick, {title:LANG.dv_bedc_l, modes:FDM, trigger, show:isNotBelt}),
            deviceBelt:       newBoolean(LANG.dv_belt_s, onBooleanClick, {title:LANG.dv_belt_l, modes:FDM, trigger, show:() => !ui.deviceRound.checked}),
            separator:        newBlank({class:"pop-sep", modes:FDM, driven}),
            spindleMax:       newInput(LANG.dv_spmx_s, {title:LANG.dv_spmx_l, convert:toInt, size:5, modes:CAM, trigger}),
            deviceZMax:       newInput(LANG.dv_zmax_s, {title:LANG.dv_zmax_l, convert:toInt, size:5, modes:FDM}),
            gcodeTime:        newInput(LANG.dv_time_s, {title:LANG.dv_time_l, convert:toFloat, size:5, modes:FDM}),
            _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:FDM }),
            extruder:         newGroup(LANG.dv_gr_ext, null, {group:"dext", inline}),
            extFilament:      newInput(LANG.dv_fila_s, {title:LANG.dv_fila_l, convert:toFloat, modes:FDM}),
            extNozzle:        newInput(LANG.dv_nozl_s, {title:LANG.dv_nozl_l, convert:toFloat, modes:FDM}),
            extOffsetX:       newInput(LANG.dv_exox_s, {title:LANG.dv_exox_l, convert:toFloat, modes:FDM}),
            extOffsetY:       newInput(LANG.dv_exoy_s, {title:LANG.dv_exoy_l, convert:toFloat, modes:FDM}),
            extPad:           newBlank({class:"grow", modes:FDM}),
            separator:        newBlank({class:"pop-sep", modes:FDM, driven}),
            extActions:       newRow([
                ui.extPrev = newButton(undefined, undefined, {icon:'<i class="fas fa-less-than"></i>'}),
                ui.extAdd  = newButton(undefined, undefined, {icon:'<i class="fas fa-plus"></i>'}),
                ui.extDel  = newButton(undefined, undefined, {icon:'<i class="fas fa-minus"></i>'}),
                ui.extNext = newButton(undefined, undefined, {icon:'<i class="fas fa-greater-than"></i>'})
            ], {class:"dev-buttons ext-buttons var-row", modes:FDM}),
            _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:CAM_LZR }),
            _____:            newGroup(LANG.dv_gr_out, null, {group:"dgco", inline}),
            gcodeStrip:       newBoolean(LANG.dv_strc_s, onBooleanClick, {title:LANG.dv_strc_l, modes:CAM}),
            gcodeSpace:       newBoolean(LANG.dv_tksp_s, onBooleanClick, {title:LANG.dv_tksp_l, modes:CAM_LZR}),
            laserMaxPower:    newInput(LANG.ou_maxp_s, {title:LANG.ou_maxp_l, modes:LASER, size:7, text:true}),
            useLaser:         newBoolean(LANG.dv_lazr_s, onBooleanClick, {title:LANG.dv_lazr_l, modes:CAM}),
            gcodeFExt:        newInput(LANG.dv_fext_s, {title:LANG.dv_fext_l, modes:CAM_LZR, size:7, text:true}),
            gcodeEd:          newGroup(LANG.dv_gr_gco, $('dg'), {group:"dgcp", inline, modes:GCODE}),
            gcodeMacros:      newRow([
                (ui.gcodePre      = newGCode(LANG.dv_head_s, {title:LANG.dv_head_l, modes:GCODE, area:gcode})).button,
                (ui.gcodePost     = newGCode(LANG.dv_foot_s, {title:LANG.dv_foot_l, modes:GCODE, area:gcode})).button,
                (ui.gcodeLayer    = newGCode(LANG.dv_layr_s, {title:LANG.dv_layr_l, modes:FDM,   area:gcode})).button,
                (ui.gcodeTrack    = newGCode(LANG.dv_prog_s, {title:LANG.dv_prog_l, modes:FDM,   area:gcode})).button,
                (ui.gcodeFan      = newGCode(LANG.dv_fanp_s, {title:LANG.dv_fanp_l, modes:FDM,   area:gcode})).button,
                (ui.gcodeFeature  = newGCode(LANG.dv_feat_s, {title:LANG.dv_feat_l, modes:FDM,   area:gcode})).button,
                (ui.gcodeLaserOn  = newGCode(LANG.dv_lzon_s, {title:LANG.dv_lzon_l, modes:LASER, area:gcode})).button,
                (ui.gcodeLaserOff = newGCode(LANG.dv_lzof_s, {title:LANG.dv_lzof_l, modes:LASER, area:gcode})).button,
                (ui.gcodeWaterOn  = newGCode(LANG.dv_waon_s, {title:LANG.dv_waon_l, modes:WJET,  area:gcode})).button,
                (ui.gcodeWaterOff = newGCode(LANG.dv_waof_s, {title:LANG.dv_waof_l, modes:WJET,  area:gcode})).button,
                (ui.gcodeKnifeDn  = newGCode(LANG.dv_dkon_s, {title:LANG.dv_dkon_l, modes:DRAG,  area:gcode})).button,
                (ui.gcodeKnifeUp  = newGCode(LANG.dv_dkof_s, {title:LANG.dv_dkof_l, modes:DRAG,  area:gcode})).button,
                (ui.gcodeChange   = newGCode(LANG.dv_tool_s, {title:LANG.dv_tool_l, modes:FDM_CAM,   area:gcode})).button,
                (ui.gcodeDwell    = newGCode(LANG.dv_dwll_s, {title:LANG.dv_dwll_l, modes:CAM,   area:gcode})).button,
                (ui.gcodeSpindle  = newGCode(LANG.dv_sspd_s, {title:LANG.dv_sspd_l, modes:CAM,   area:gcode, show:() => ui.spindleMax.value > 0})).button
            ], {class:"ext-buttons f-row gcode-macros"}),

            /** Preferences Menu */

            _____:            newGroup(LANG.op_menu, $('prefs-gen1'), {inline}),
            antiAlias:        newBoolean(LANG.op_anta_s, booleanSave, {title:LANG.op_anta_l}),
            reverseZoom:      newBoolean(LANG.op_invr_s, booleanSave, {title:LANG.op_invr_l}),
            ortho:            newBoolean(LANG.op_orth_s, booleanSave, {title:LANG.op_orth_l}),
            dark:             newBoolean(LANG.op_dark_s, booleanSave, {title:LANG.op_dark_l}),
            drawer:           newBoolean('slide out', booleanSave, {title:'slide out settings drawer'}),
            scrolls:          newBoolean('scrollbars', booleanSave, {title:'show scrollbars'}),
            devel:            newBoolean(LANG.op_devl_s, booleanSave, {title:LANG.op_devl_l}),
            _____:            newGroup(LANG.op_disp, $('prefs-gen2'), {inline}),
            showOrigin:       newBoolean(LANG.op_shor_s, booleanSave, {title:LANG.op_shor_l}),
            showRulers:       newBoolean(LANG.op_shru_s, booleanSave, {title:LANG.op_shru_l}),
            showSpeeds:       newBoolean(LANG.op_sped_s, speedSave, {title:LANG.op_sped_l}),
            shiny:            newBoolean(LANG.op_shny_s, booleanSave, {title:LANG.op_shny_l, modes:FDM}),
            lineType:         newSelect(LANG.op_line_s, {title: LANG.op_line_l, action: lineTypeSave, modes:FDM}, "linetype"),
            animesh:          newSelect(LANG.op_anim_s, {title: LANG.op_anim_l, action: aniMeshSave, modes:CAM}, "animesh"),
            units:            newSelect(LANG.op_unit_s, {title: LANG.op_unit_l, action: unitsSave, modes:CAM}, "units"),
            edgeangle:        newInput(LANG.op_spoa_s, {title:LANG.op_spoa_l, convert:toFloat, size:3}),
            _____:            newGroup(LANG.lo_menu, $('prefs-lay'), {inline}),
            autoSave:         newBoolean(LANG.op_save_s, booleanSave, {title:LANG.op_save_l}),
            autoLayout:       newBoolean(LANG.op_auto_s, booleanSave, {title:LANG.op_auto_l}),
            freeLayout:       newBoolean(LANG.op_free_s, booleanSave, {title:LANG.op_free_l}),
            spaceRandoX:      newBoolean(LANG.op_spcx_s, booleanSave, {title:LANG.op_spcx_l, show:isBelt}),
            spaceLayout:      newInput(LANG.op_spcr_s, {title:LANG.op_spcr_l, convert:toFloat, size:3, units}),
            _____:            newGroup(LANG.xp_menu, $('prefs-xpo'), {inline: true}),
            exportLocal:      newBoolean(`Grid:Local`, booleanSave, {title:LANG.op_exgl_l}),
            exportGhost:      newBoolean(`Grid:Host`, booleanSave, {title:LANG.op_exgh_l}),
            exportOcto:       newBoolean(`OctoPrint`, booleanSave, {title:LANG.op_exop_l}),
            exportThumb:      newBoolean(`Thumbnail`, booleanSave, {modes:FDM}),
            exportPreview:    newBoolean(`Code Preview`, booleanSave),
            _____:            newGroup(LANG.pt_menu, $('prefs-prt'), {inline}),
            detail:           newSelect(LANG.pt_qual_s, {title: LANG.pt_qual_l, action: detailSave}, "detail"),
            healMesh:         newBoolean(LANG.pt_heal_s, booleanSave, {title: LANG.pt_heal_l}),
            threaded:         newBoolean(LANG.pt_thrd_s, booleanSave, {title: LANG.pt_thrd_l, modes:THREED}),
            assembly:         newBoolean(LANG.pt_assy_s, booleanSave, {title: LANG.pt_assy_l, modes:THREED}),

            prefadd:          uc.checkpoint($('prefs-add')),

            /** FDM Settings */

            _____:               newGroup(LANG.sl_menu, $('fdm-layers'), { modes:FDM, driven, hideable, separator, group:"fdm-layers" }),
            sliceHeight:         newInput(LANG.sl_lahi_s, { title:LANG.sl_lahi_l, convert:toFloat }),
            sliceMinHeight:      newInput(LANG.ad_minl_s, { title:LANG.ad_minl_l, convert:toFloat, bound:bound(0,3.0), show:() => ui.sliceAdaptive.checked }),
            sliceTopLayers:      newInput(LANG.sl_ltop_s, { title:LANG.sl_ltop_l, convert:toInt }),
            sliceBottomLayers:   newInput(LANG.sl_lbot_s, { title:LANG.sl_lbot_l, convert:toInt }),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceAdaptive:       newBoolean(LANG.ad_adap_s, onBooleanClick, { title: LANG.ad_adap_l }),
            _____:               newGroup(LANG.sw_menu, $('fdm-walls'), { modes:FDM, driven, hideable, separator, group:"fdm-walls" }),
            sliceShells:         newInput(LANG.sl_shel_s, { title:LANG.sl_shel_l, convert:toFloat }),
            sliceLineWidth:      newInput(LANG.sl_line_s, { title:LANG.sl_line_l, convert:toFloat, bound:bound(0,5) }),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceShellOrder:     newSelect(LANG.sl_ordr_s, { title:LANG.sl_ordr_l}, "shell"),
            sliceDetectThin:     newSelect(LANG.ad_thin_s, { title: LANG.ad_thin_l, action: thinWallSave }, "thin"),
            outputAlternating:   newBoolean(LANG.ad_altr_s, onBooleanClick, {title:LANG.ad_altr_l}),
            sliceZInterleave:    newBoolean(LANG.ad_zint_s, onBooleanClick, {title:LANG.ad_zint_l, show:zIntShow}),
            _____:               newGroup(LANG.fi_menu, $('fdm-fill'), { modes:FDM, driven, hideable, separator, group:"fdm-fill" }),
            sliceFillType:       newSelect(LANG.fi_type, {trigger}, "infill"),
            sliceFillSparse:     newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:toFloat, bound:bound(0.0,1.0), show:hasInfill}),
            sliceFillRepeat:     newInput(LANG.fi_rept_s, {title:LANG.fi_rept_l, convert:toInt,   bound:bound(1,10),    show:fillIsLinear}),
            sliceFillOverlap:    newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:toFloat, bound:bound(0.0,2.0), show:hasInfill}),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceFillRate:       newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:toInt,   bound:bound(0,500)}),
            sliceSolidRate:      newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:toInt,   bound:bound(0,500)}),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceFillGrow:       newInput(LANG.fi_grow_s, {title:LANG.fi_grow_l, convert:toFloat}),
            sliceFillAngle:      newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:toFloat}),
            _____:               newGroup(LANG.fh_menu, $('fdm-heat'), { modes:FDM, driven, hideable, separator, group:"fdm-heat" }),
            outputTemp:          newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:toInt}),
            outputBedTemp:       newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:toInt}),
            _____:               newGroup(LANG.fc_menu, $('fdm-cool'), { modes:FDM, driven, hideable, separator, group:"fdm-cool" }),
            outputFanLayer:      newInput(LANG.ou_fanl_s, { title:LANG.ou_fanl_l, convert:toInt,   bound:bound(0,255) }),
            outputFanSpeed:      newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt, bound:bound(0,255)}),
            _____:               newGroup(LANG.sp_menu, $('fdm-support'), { modes:FDM, driven, hideable, separator, group:"fdm-supp" }),
            sliceSupportNozzle:  newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, show:isMultiHead}, "extruders"),
            sliceSupportDensity: newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:toFloat, bound:bound(0.0,1.0)}),
            sliceSupportSize:    newInput(LANG.sp_size_s, {title:LANG.sp_size_l, convert:toFloat, bound:bound(1.0,200.0)}),
            sliceSupportOffset:  newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, convert:toFloat, bound:bound(0.0,200.0)}),
            sliceSupportGap:     newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, convert:toInt,   bound:bound(0,5)}),
            sliceSupportArea:    newInput(LANG.sp_area_s, {title:LANG.sp_area_l, convert:toFloat, bound:bound(0.0,200.0)}),
            sliceSupportExtra:   newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, convert:toFloat, bound:bound(0.0,10.0)}),
            sliceSupportGrow:    newInput(LANG.sp_grow_s, {title:LANG.sp_grow_l, convert:toFloat, bound:bound(0.0,10.0)}),
            sliceSupportAngle:   newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, convert:toFloat, bound:bound(0.0,90.0)}),
            sliceSupportSpan:    newInput(LANG.sp_span_s, {title:LANG.sp_span_l, convert:toFloat, bound:bound(0.0,200.0), show:() => ui.sliceSupportEnable.checked }),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceSupportEnable:  newBoolean(LANG.sp_auto_s, onBooleanClick, {title:LANG.sp_auto_l, show:isNotBelt}),
            sliceSupportOutline: newBoolean(LANG.sp_outl_s, onBooleanClick, {title:LANG.sp_outl_l}),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceSupportGen:     newRow([
                ui.ssaGen = newButton(LANG.sp_detect, onButtonClick, {class: "f-col grow a-center"})
            ], { modes: FDM, class: "ext-buttons f-row grow" }),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceSupportManual: newRow([
                (ui.ssmAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (ui.ssmDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (ui.ssmClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {class:"ext-buttons f-row"}),
            _____:               newGroup(LANG.fl_menu, $('fdm-base'), { modes:FDM, driven, hideable, separator, group:"fdm-base" }),
            firstSliceHeight:    newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:toFloat, show:isNotBelt}),
            firstLayerNozzleTemp:newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:toInt,   show:isNotBelt}),
            firstLayerBedTemp:   newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:toInt,   show:isNotBelt}),
            separator:           newBlank({ class:"set-sep", driven }),
            firstLayerFanSpeed:  newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt,   bound:bound(0,255), show:isBelt}),
            firstLayerYOffset:   newInput(LANG.fl_zoff_s, {title:LANG.fl_zoff_l, convert:toFloat, show:isBelt}),
            firstLayerFlatten:   newInput(LANG.fl_flat_s, {title:LANG.fl_flat_l, convert:toFloat, show:isBelt}),
            firstLayerRate:      newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:toFloat}),
            firstLayerFillRate:  newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:toFloat, show:isNotBelt}),
            separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
            firstLayerLineMult:  newInput(LANG.fl_sfac_s, {title:LANG.fl_sfac_l, convert:toFloat, bound:bound(0.5,2), show:isNotBelt}),
            firstLayerPrintMult: newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:toFloat}),
            separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
            firstLayerBrim:      newInput(LANG.fl_brim_s, {title:LANG.fl_brim_l, convert:toInt,   show:isBelt}),
            firstLayerBrimIn:    newInput(LANG.fl_brin_s, {title:LANG.fl_brin_l, convert:toInt,   show:isBelt}),
            firstLayerBrimTrig:  newInput(LANG.fl_brmn_s, {title:LANG.fl_brmn_l, convert:toInt,   show:isBelt}),
            firstLayerBrimGap:   newInput(LANG.fl_brgp_s, {title:LANG.fl_brgp_l, convert:toFloat, show:isBelt}),
            separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
            firstLayerBeltLead:  newInput(LANG.fl_bled_s, {title:LANG.fl_bled_l, convert:toFloat, show:isBelt}),
            firstLayerBeltBump:  newInput(LANG.fl_blmp_s, {title:LANG.fl_blmp_l, convert:toFloat, bound:bound(0, 10), show:isBelt}),
            separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
            outputBrimCount:     newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:toInt,   show:isNotBelt}),
            outputBrimOffset:    newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:toFloat, show:isNotBelt}),
            outputRaftSpacing:   newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:toFloat, bound:bound(0.0,3.0), show: () => ui.outputRaft.checked && isNotBelt() }),
            separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
            outputRaft:          newBoolean(LANG.fr_nabl_s, onBooleanClick, {title:LANG.fr_nabl_l, trigger, show:() => isNotBelt()}),
            outputDraftShield:   newBoolean(LANG.fr_draf_s, onBooleanClick, {title:LANG.fr_draf_l, trigger, show:() => isNotBelt()}),
            _____:               newGroup(LANG.ou_menu, $('fdm-output'), { modes:FDM, driven, hideable, separator, group:"fdm-out" }),
            outputFeedrate:      newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:toInt}),
            outputFinishrate:    newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:toInt}),
            outputSeekrate:      newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:toInt}),
            separator:           newBlank({ class:"set-sep", driven }),
            outputShellMult:     newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
            outputFillMult:      newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
            outputSparseMult:    newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
            separator:           newBlank({ class:"set-sep", driven }),
            outputRetractDist:   newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:toFloat}),
            outputRetractSpeed:  newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:toInt}),
            outputRetractWipe:   newInput(LANG.ad_wpln_s, {title:LANG.ad_wpln_l, convert:toFloat, bound:bound(0.0,10)}),
            separator:           newBlank({ class:"set-sep", driven }),
            sliceLayerStart:     newSelect(LANG.sl_strt_s, {title:LANG.sl_strt_l}, "start"),
            outputLayerRetract:  newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l}),
            outputAvoidGaps:     newBoolean(LANG.ad_agap_s, onBooleanClick, {title:LANG.ad_agap_l}),
            separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
            outputBeltFirst:     newBoolean(LANG.ad_lbir_s, onBooleanClick, {title:LANG.ad_lbir_l, show:isBelt}),
            _____:               newGroup(LANG.ad_menu, $('fdm-expert'), { modes:FDM, driven, hideable, separator, group:"fdm-xprt" }),
            sliceAngle:          newInput(LANG.sl_angl_s, {title:LANG.sl_angl_l, convert:toFloat, show:isBelt}),
            outputRetractDwell:  newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:toInt}),
            sliceSolidMinArea:   newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:toFloat}),
            outputMinSpeed:      newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, convert:toFloat, bound:bound(1,200)}),
            outputShortPoly:     newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, convert:toFloat, bound:bound(0,10000)}),
            outputCoastDist:     newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, convert:toFloat, bound:bound(0.0,10)}),
            zHopDistance:        newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, convert:toFloat, bound:bound(0,3.0)}),
            arcTolerance:        newInput(LANG.ad_arct_s, {title:LANG.ad_arct_l, convert:toFloat, bound:bound(0,1.0), show:() => { return isNotBelt() }}),
            antiBacklash:        newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, convert:toInt,   bound:bound(0,3)}),
            outputLoops:         newInput(LANG.ag_loop_s, {title:LANG.ag_loop_l, convert:toInt,   bound:bound(-1,1000), show:isBelt}),
            outputPurgeTower:    newInput(LANG.ad_purg_s, {title:LANG.ad_purg_l, convert:toInt,   bound:bound(0,1000)}),

            fdmRanges:    $('fdm-ranges'),

            /** CAM Settings */

            _____:               newGroup(LANG.ct_menu, $('cam-tabs'), { modes:CAM, marker:true, driven, separator }),
            camTabsWidth:        newInput(LANG.ct_wdth_s, {title:LANG.ct_wdth_l, convert:toFloat, bound:bound(0.005,100), units}),
            camTabsHeight:       newInput(LANG.ct_hght_s, {title:LANG.ct_hght_l, convert:toFloat, bound:bound(0.005,100), units}),
            camTabsDepth:        newInput(LANG.ct_dpth_s, {title:LANG.ct_dpth_l, convert:toFloat, bound:bound(0.005,100), units}),
            separator:           newBlank({ class:"set-sep", driven }),
            camTabsMidline:      newBoolean(LANG.ct_midl_s, onBooleanClick, {title:LANG.ct_midl_l}),
            separator:           newBlank({ class:"set-sep", driven }),
            camTabsManual: newRow([
                (ui.tabAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (ui.tabDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (ui.tabClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {class:"ext-buttons f-row"}),
            _____:               newGroup(LANG.cs_menu, $('cam-stock'), { modes:CAM, driven, separator }),
            camStockX:           newInput(LANG.cs_wdth_s, {title:LANG.cs_wdth_l, convert:toFloat, bound:bound(0,9999), units}),
            camStockY:           newInput(LANG.cs_dpth_s, {title:LANG.cs_dpth_l, convert:toFloat, bound:bound(0,9999), units}),
            camStockZ:           newInput(LANG.cs_hght_s, {title:LANG.cs_hght_l, convert:toFloat, bound:bound(0,9999), units}),
            separator:           newBlank({ class:"set-sep", driven }),
            camStockOffset:      newBoolean(LANG.cs_offs_s, onBooleanClick, {title:LANG.cs_offs_l}),
            camStockClipTo:      newBoolean(LANG.cs_clip_s, onBooleanClick, {title:LANG.cs_clip_l}),
            camStockIndexed:     newBoolean(LANG.cs_indx_s, onBooleanClick, {title:LANG.cs_indx_l}),
            camStockIndexGrid:   newBoolean(LANG.cs_ishg_s, onBooleanClick, {title:LANG.cs_ishg_l, show:() => ui.camStockIndexed.checked}),
            _____:               newGroup(LANG.cc_menu, $('cam-limits'), { modes:CAM, driven, separator }),
            camZAnchor:          newSelect(LANG.ou_zanc_s, {title: LANG.ou_zanc_l, action:zAnchorSave, show:() => !ui.camStockIndexed.checked}, "zanchor"),
            camZOffset:          newInput(LANG.ou_ztof_s, {title:LANG.ou_ztof_l, convert:toFloat, units}),
            camZTop:             newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:toFloat, units, trigger}),
            camZBottom:          newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:toFloat, units, trigger}),
            camZThru:            newInput(LANG.ou_ztru_s, {title:LANG.ou_ztru_l, convert:toFloat, bound:bound(0.0,100), units }),
            camZClearance:       newInput(LANG.ou_zclr_s, {title:LANG.ou_zclr_l, convert:toFloat, bound:bound(0.01,100), units }),
            camFastFeedZ:        newInput(LANG.cc_rzpd_s, {title:LANG.cc_rzpd_l, convert:toFloat, units}),
            camFastFeed:         newInput(LANG.cc_rapd_s, {title:LANG.cc_rapd_l, convert:toFloat, units}),
            _____:               newGroup(LANG.ou_menu, $('cam-output'), { modes:CAM, driven, separator, group:"cam-output" }),
            camConventional:     newBoolean(LANG.ou_conv_s, onBooleanClick, {title:LANG.ou_conv_l}),
            camEaseDown:         newBoolean(LANG.cr_ease_s, onBooleanClick, {title:LANG.cr_ease_l}),
            camDepthFirst:       newBoolean(LANG.ou_depf_s, onBooleanClick, {title:LANG.ou_depf_l}),
            camToolInit:         newBoolean(LANG.ou_toin_s, onBooleanClick, {title:LANG.ou_toin_l}),
            separator:           newBlank({ class:"set-sep", driven }),
            camFirstZMax:        newBoolean(LANG.ou_z1st_s, onBooleanClick, {title:LANG.ou_z1st_l}),
            camForceZMax:        newBoolean(LANG.ou_forz_s, onBooleanClick, {title:LANG.ou_forz_l}),
            separator:           newBlank({ class:"set-sep", driven }),
            camEaseAngle:        newInput(LANG.ou_eang_s, {title:LANG.ou_eang_l, convert:toFloat, bound:bound(0.1,85), show:() => ui.camEaseDown.checked}),
            camFullEngage:       newInput(LANG.ou_feng_s, {title:LANG.ou_feng_l, convert:toFloat, bound:bound(0.1,1.0)}),
            _____:               newGroup(LANG.co_menu, $('cam-origin'), { modes:CAM, driven, separator }),
            camOriginTop:        newBoolean(LANG.or_topp_s, onBooleanClick, {title:LANG.or_topp_l}),
            camOriginCenter:     newBoolean(LANG.or_cntr_s, onBooleanClick, {title:LANG.or_cntr_l}),
            separator:           newBlank({ class:"set-sep", driven }),
            camOriginOffX:       newInput(LANG.co_offx_s, {title:LANG.co_offx_l, convert:toFloat, units}),
            camOriginOffY:       newInput(LANG.co_offy_s, {title:LANG.co_offy_l, convert:toFloat, units}),
            camOriginOffZ:       newInput(LANG.co_offz_s, {title:LANG.co_offz_l, convert:toFloat, units}),
            _____:               newGroup(LANG.op_xprt_s, $('cam-expert'), { group:"cam_expert", modes:CAM, marker: false, driven, separator }),
            camExpertFast:       newBoolean(LANG.cx_fast_s, onBooleanClick, {title:LANG.cx_fast_l, show: () => !ui.camTrueShadow.checked }),
            camTrueShadow:       newBoolean(LANG.cx_true_s, onBooleanClick, {title:LANG.cx_true_l, show: () => !ui.camExpertFast.checked }),

            /** LASER/DRAG/WJET/WEDM cut tool Settings */

            _____:               newGroup(LANG.sl_menu, $('lzr-slice'), { modes:TWOD, driven, separator }),
            ctSliceKerf:         newInput(LANG.ls_offs_s, {title:LANG.ls_offs_l, convert:toFloat}),
            ctSliceHeight:       newInput(LANG.ls_lahi_s, {title:LANG.ls_lahi_l, convert:toFloat, trigger}),
            ctSliceHeightMin:    newInput(LANG.ls_lahm_s, {title:LANG.ls_lahm_l, convert:toFloat, show:() => ui.ctSliceHeight.value == 0 && !ui.ctSliceSingle.checked }),
            separator:           newBlank({ class:"set-sep", driven }),
            ctSliceSingle:       newBoolean(LANG.ls_sngl_s, onBooleanClick, {title:LANG.ls_sngl_l}),
            ctOmitInner:         newBoolean(LANG.we_omit_s, onBooleanClick, {title:LANG.we_omit_l, modes:WEDM}),
            _____:               newGroup('surfaces', $('lzr-surface'), { modes:[-1], driven, separator }),
            ctSurfaces: newRow([
                (ui.faceAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (ui.faceDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (ui.faceClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {class:"ext-buttons f-row", modes:WEDM}),
            _____:               newGroup(LANG.dk_menu, $('lzr-knife'), { modes:DRAG, marker:true, driven, separator }),
            ctOutKnifeDepth:     newInput(LANG.dk_dpth_s, { title:LANG.dk_dpth_l, convert:toFloat, bound:bound(0.0,5.0) }),
            ctOutKnifePasses:    newInput(LANG.dk_pass_s, { title:LANG.dk_pass_l, convert:toInt,   bound:bound(0,5) }),
            ctOutKnifeTip:       newInput(LANG.dk_offs_s, { title:LANG.dk_offs_l, convert:toFloat, bound:bound(0.0,10.0) }),
            _____:               newGroup(LANG.lo_menu, $('lzr-layout'), { modes:TWOD, driven, separator }),
            ctOutTileSpacing:    newInput(LANG.ou_spac_s, { title:LANG.ou_spac_l, convert:toInt }),
            ctOutMerged:         newBoolean(LANG.ou_mrgd_s, onBooleanClick, {title:LANG.ou_mrgd_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
            ctOutGroup:          newBoolean(LANG.ou_grpd_s, onBooleanClick, {title:LANG.ou_grpd_l, show:() => !(ui.ctOutMark.checked || ui.ctOutStack.checked) }),
            _____:               newGroup(LANG.ou_menu, $('lzr-output'), { modes:TWOD, driven, separator, group:"lzr-output" }),
            ctOutPower:          newInput(LANG.ou_powr_s, {title:LANG.ou_powr_l, convert:toInt, bound:bound(1,100), modes:TWONED }),
            ctOutSpeed:          newInput(LANG.ou_sped_s, {title:LANG.ou_sped_l, convert:toInt }),
            ctAdaptive:          newBoolean('adaptive speed', onBooleanClick, {modes:WEDM, title:'controller determines best cutting speed based on material feedback at runtime'}),
            separator:           newBlank({ class:"set-sep", driven }),
            ctOriginBounds:      newBoolean(LANG.or_bnds_s, onBooleanClick, { title:LANG.or_bnds_l, show:() => !ui.ctOriginCenter.checked }),
            ctOriginCenter:      newBoolean(LANG.or_cntr_s, onBooleanClick, { title:LANG.or_cntr_l, show:() => !ui.ctOriginBounds.checked }),
            separator:           newBlank({ class:"set-sep", driven, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
            ctOriginOffX:        newInput(LANG.or_offx_s, { title:LANG.or_offx_l, convert:toFloat, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
            ctOriginOffY:        newInput(LANG.or_offy_s, { title:LANG.or_offy_l, convert:toFloat, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
            separator:           newBlank({ class:"set-sep", driven, modes:TWONED }),
            ctOutZColor:         newBoolean(LANG.ou_layo_s, onBooleanClick, { title:LANG.ou_layo_l, modes:TWONED, show:() => !ui.ctOutMerged.checked }),
            ctOutLayer:          newBoolean(LANG.ou_layr_s, onBooleanClick, { title:LANG.ou_layr_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
            ctOutMark:           newBoolean(LANG.ou_lays_s, onBooleanClick, { title:LANG.ou_lays_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
            separator:           newBlank({ class:"set-sep", driven, modes:LASER }),
            ctOutInches:         newBoolean(LANG.ou_inch_s, onBooleanClick, { title:LANG.ou_inch_l, modes:LASER }),
            ctOutStack:          newBoolean(LANG.ou_stak_s, onBooleanClick, { title:LANG.ou_stak_l, modes:LASER }),
            ctOutShaper:         newBoolean(LANG.ou_shap_s, onBooleanClick, { title:LANG.ou_shap_l, modes:LASER, show:() => ui.ctOutStack.checked }),

            /** SLA SETTINGS */

            slaProc:             newGroup(LANG.sa_menu, $('sla-slice'), { modes:SLA, group:"sla-slice", driven, separator }),
            slaSlice:            newInput(LANG.sa_lahe_s, {title:LANG.sa_lahe_l, convert:toFloat}),
            slaShell:            newInput(LANG.sa_shel_s, {title:LANG.sa_shel_l, convert:toFloat}),
            slaOpenTop:          newBoolean(LANG.sa_otop_s, onBooleanClick, {title:LANG.sa_otop_l}),
            slaOpenBase:         newBoolean(LANG.sa_obas_s, onBooleanClick, {title:LANG.sa_obas_l}),
            slaLayers:           newGroup(LANG.sa_layr_m, $('sla-layers'), { modes:SLA, group:"sla-layers", driven, separator }),
            slaLayerOn:          newInput(LANG.sa_lton_s, {title:LANG.sa_lton_l, convert:toFloat}),
            slaLayerOff:         newInput(LANG.sa_ltof_s, {title:LANG.sa_ltof_l, convert:toFloat}),
            slaPeelDist:         newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:toFloat}),
            slaPeelLiftRate:     newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:toFloat}),
            slaPeelDropRate:     newInput(LANG.sa_pldr_s, {title:LANG.sa_pldr_l, convert:toFloat}),
            slaBase:             newGroup(LANG.sa_base_m, $('sla-base'), { modes:SLA, group:"sla-base", driven, separator }),
            slaBaseLayers:       newInput(LANG.sa_balc_s, {title:LANG.sa_balc_l, convert:toInt}),
            slaBaseOn:           newInput(LANG.sa_lton_s, {title:LANG.sa_bltn_l, convert:toFloat}),
            slaBaseOff:          newInput(LANG.sa_ltof_s, {title:LANG.sa_bltf_l, convert:toFloat}),
            slaBasePeelDist:     newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:toFloat}),
            slaBasePeelLiftRate: newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:toFloat}),
            slaFill:             newGroup(LANG.sa_infl_m, $('sla-fill'), { modes:SLA, group:"sla-infill", driven, separator }),
            slaFillDensity:      newInput(LANG.sa_ifdn_s, {title:LANG.sa_ifdn_l, convert:toFloat, bound:bound(0,1)}),
            slaFillLine:         newInput(LANG.sa_iflw_s, {title:LANG.sa_iflw_l, convert:toFloat, bound:bound(0,5)}),
            slaSupport:          newGroup(LANG.sa_supp_m, $('sla-support'), { modes:SLA, group:"sla-support", driven, separator }),
            slaSupportLayers:    newInput(LANG.sa_slyr_s, {title:LANG.sa_slyr_l, convert:toInt,   bound:bound(5,100)}),
            slaSupportGap:       newInput(LANG.sa_slgp_s, {title:LANG.sa_slgp_l, convert:toInt,   bound:bound(3,30)}),
            slaSupportDensity:   newInput(LANG.sa_sldn_s, {title:LANG.sa_sldn_l, convert:toFloat, bound:bound(0.01,0.9)}),
            slaSupportSize:      newInput(LANG.sa_slsz_s, {title:LANG.sa_slsz_l, convert:toFloat, bound:bound(0.1,1)}),
            slaSupportPoints:    newInput(LANG.sa_slpt_s, {title:LANG.sa_slpt_l, convert:toInt,   bound:bound(3,10)}),
            slaSupportEnable:    newBoolean(LANG.enable, onBooleanClick, {title:LANG.sl_slen_l}),
            slaOutput:           newGroup(LANG.sa_outp_m, $('sla-output'), { modes:SLA, driven, separator, group:"sla-output" }),
            slaFirstOffset:      newInput(LANG.sa_opzo_s, {title:LANG.sa_opzo_l, convert:toFloat, bound:bound(0,1)}),
            slaAntiAlias:        newSelect(LANG.sa_opaa_s, {title:LANG.sa_opaa_l}, "antialias"),

            layers:             uc.setGroup($("layers")),

            settingsName:       $('settingsName'),
            settingsSave:       $('settingsSave'),
        });

        // override old style settings two-button menu
        ui.settingsSave.onclick = () => {
            settingsSave(undefined, ui.settingsName.value);
        };

        function optSelected(sel) {
            let opt = sel.options[sel.selectedIndex];
            return opt ? opt.value : undefined;
        }

        function hasInfill() {
            return optSelected(ui.sliceFillType) !== 'none'
        }

        function fillIsLinear() {
            return hasInfill() && optSelected(ui.sliceFillType) === 'linear';
        }

        function spindleShow() {
            return settings().device.spindleMax > 0;
        }

        function zIntShow() {
            return settings().controller.devel;
        }

        // slider setup
        const mobile = moto.space.info.mob;
        const slbar = mobile ? 80 : 30;
        const slbar2 = slbar * 2;
        const slider = ui.sliderRange;
        const drag = { };

        if (mobile) {
            ui.slider.classList.add('slider-mobile');
            ui.sliderLo.classList.add('slider-mobile');
            ui.sliderHi.classList.add('slider-mobile');
            // add css style for mobile devices
            DOC.body.classList.add('mobile');
        }

        function pxToInt(txt) {
            return txt ? parseInt(txt.substring(0,txt.length-2)) : 0;
        }

        function sliderUpdate() {
            let start = drag.low / drag.maxval;
            let end = (drag.low + drag.mid - slbar) / drag.maxval;
            api.event.emit('slider.pos', { start, end });
            api.var.layer_lo = Math.round(start * api.var.layer_max);
            api.var.layer_hi = Math.round(end * api.var.layer_max);
            api.show.layer();
            space.scene.active();
        }

        function dragit(el, delta) {
            el.ontouchstart = el.onmousedown = (ev) => {
                // el.classList.add('sli-drag-el');
                tracker.style.display = 'block';
                ev.stopPropagation();
                let obj = (ev.touches ? ev.touches[0] : ev);
                drag.width = slider.clientWidth;
                drag.maxval = drag.width - slbar2;
                drag.start = obj.screenX;
                drag.loat = drag.low = pxToInt(ui.sliderHold.style.marginLeft);
                drag.mdat = drag.mid = ui.sliderMid.clientWidth;
                drag.hiat = pxToInt(ui.sliderHold.style.marginRight);
                drag.mdmax = drag.width - slbar - drag.loat;
                drag.himax = drag.width - slbar - drag.mdat;
                let cancel_drag = tracker.ontouchend = tracker.onmouseup = (ev) => {
                    // el.classList.remove('sli-drag-el');
                    if (ev) {
                        ev.stopPropagation();
                        ev.preventDefault();
                    }
                    slider.onmousemove = undefined;
                    tracker.style.display = 'none';
                };
                el.ontouchend = cancel_drag;
                el.ontouchmove = tracker.ontouchmove = tracker.onmousemove = (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    if (ev.buttons === 0) {
                        return cancel_drag();
                    }
                    if (delta) {
                        let obj = (ev.touches ? ev.touches[0] : ev);
                        delta(obj.screenX - drag.start);
                    }
                };
            };
        }

        dragit(ui.sliderLo, (delta) => {
            let midval = drag.mdat - delta;
            let lowval = drag.loat + delta;
            if (midval < slbar || lowval < 0) {
                return;
            }
            ui.sliderHold.style.marginLeft = `${lowval}px`;
            ui.sliderMid.style.width = `${midval}px`;
            drag.low = lowval;
            drag.mid = midval;
            sliderUpdate();
        });
        dragit(ui.sliderMid, (delta) => {
            let loval = drag.loat + delta;
            let hival = drag.hiat - delta;
            if (loval < 0 || hival < 0) return;
            ui.sliderHold.style.marginLeft = `${loval}px`;
            ui.sliderHold.style.marginRight = `${hival}px`;
            drag.low = loval;
            sliderUpdate();
        });
        dragit(ui.sliderHi, (delta) => {
            let midval = drag.mdat + delta;
            let hival = drag.hiat - delta;
            if (midval < slbar || midval > drag.mdmax || hival < 0) return;
            ui.sliderMid.style.width = `${midval}px`;
            ui.sliderHold.style.marginRight = `${hival}px`;
            drag.mid = midval;
            sliderUpdate();
        });

        ui.load.onchange = function(event) {
            api.platform.load_files(event.target.files);
            ui.load.value = ''; // reset so you can re-import the same filee
        };

        ui.sliderMin.onclick = () => {
            api.show.layer(0,0);
        }

        ui.sliderMax.onclick = () => {
            api.show.layer(api.var.layer_max,0);
        }

        ui.slider.onmouseover = (ev) => {
            api.event.emit('slider.label');
        };

        ui.slider.onmouseleave = (ev) => {
            if (!ev.buttons) api.event.emit('slider.unlabel');
        };

        api.event.on('slider.unlabel', (values) => {
        });

        api.event.on('slider.label', (values) => {
            let digits = api.var.layer_max.toString().length;
            $('slider-zero').style.width = `${digits}em`;
            $('slider-max').style.width = `${digits}em`;
            $('slider-zero').innerText = api.var.layer_lo;
            $('slider-max').innerText = api.var.layer_hi;
        });

        api.event.on('slider.set', (values) => {
            let width = slider.clientWidth;
            let maxval = width - slbar2;
            let start = Math.max(0, Math.min(1, values.start));
            let end = Math.max(start, Math.min(1, values.end));
            let lowval = start * maxval;
            let midval = ((end - start) * maxval) + slbar;
            let hival = maxval - end * maxval;
            ui.sliderHold.style.marginLeft = `${lowval}px`;
            ui.sliderMid.style.width = `${midval}px`;
            ui.sliderHold.style.marginRight = `${hival}px`;
        });

        // store layer preferences
        api.event.on('stack.show', label => {
            let mode = api.mode.get();
            let view = api.view.get();
            api.conf.get().labels[`${mode}-${view}-${label}`] = true;
        });

        api.event.on('stack.hide', label => {
            let mode = api.mode.get();
            let view = api.view.get();
            api.conf.get().labels[`${mode}-${view}-${label}`] = false;
        });

        // bind language choices
        $('lset-en').onclick = function() {
            sdb.setItem('kiri-lang', 'en-us');
            api.space.reload();
        };
        $('lset-da').onclick = function() {
            sdb.setItem('kiri-lang', 'da-dk');
            api.space.reload();
        };
        $('lset-de').onclick = function() {
            sdb.setItem('kiri-lang', 'de-de');
            api.space.reload();
        };
        $('lset-fr').onclick = function() {
            sdb.setItem('kiri-lang', 'fr-fr');
            api.space.reload();
        };
        $('lset-pl').onclick = function() {
            sdb.setItem('kiri-lang', 'pl-pl');
            api.space.reload();
        };
        $('lset-pt').onclick = function() {
            sdb.setItem('kiri-lang', 'pt-pt');
            api.space.reload();
        };
        $('lset-es').onclick = function() {
            sdb.setItem('kiri-lang', 'es-es');
            api.space.reload();
        };
        $('lset-zh').onclick = function() {
            sdb.setItem('kiri-lang', 'zh');
            api.space.reload();
        };

        space.event.addHandlers(self, [
            'keyup', keyUpHandler,
            'keydown', keyDownHandler,
            'keypress', keyHandler,
            'dragover', dragOverHandler,
            'dragleave', dragLeave,
            'drop', dropHandler
        ]);

        function selectionSize(e) {
            let dv = parseFloat(e.target.value || 1),
                pv = parseFloat(e.target.was || 1),
                ra = dv / pv,
                xv = parseFloat(ui.sizeX.was ?? ui.scaleX.value) || 1,
                yv = parseFloat(ui.sizeY.was ?? ui.scaleY.value) || 1,
                zv = parseFloat(ui.sizeZ.was ?? ui.scaleZ.value) || 1,
                ta = e.target,
                xc = ui.lockX.checked,
                yc = ui.lockY.checked,
                zc = ui.lockZ.checked,
                xt = ta === ui.sizeX,
                yt = ta === ui.sizeY,
                zt = ta === ui.sizeZ,
                tl = (xt && xc) || (yt && yc) || (zt && zc),
                xr = ((tl && xc) || (!tl && xt) ? ra : 1),
                yr = ((tl && yc) || (!tl && yt) ? ra : 1),
                zr = ((tl && zc) || (!tl && zt) ? ra : 1);
            // prevent null scale
            if (xr * yr * zr === 0) {
                return;
            }
            selection.scale(xr,yr,zr);
            ui.sizeX.was = ui.sizeX.value = xv * xr;
            ui.sizeY.was = ui.sizeY.value = yv * yr;
            ui.sizeZ.was = ui.sizeZ.value = zv * zr;
        }

        function selectionScale(e) {
            let dv = parseFloat(e.target.value || 1),
                pv = parseFloat(e.target.was || 1),
                ra = dv / pv,
                xv = parseFloat(ui.scaleX.was ?? ui.scaleX.value) || 1,
                yv = parseFloat(ui.scaleY.was ?? ui.scaleY.value) || 1,
                zv = parseFloat(ui.scaleZ.was ?? ui.scaleY.value) || 1,
                ta = e.target,
                xc = ui.lockX.checked,
                yc = ui.lockY.checked,
                zc = ui.lockZ.checked,
                xt = ta === ui.scaleX,
                yt = ta === ui.scaleY,
                zt = ta === ui.scaleZ,
                tl = (xt && xc) || (yt && yc) || (zt && zc),
                xr = ((tl && xc) || (!tl && xt) ? ra : 1),
                yr = ((tl && yc) || (!tl && yt) ? ra : 1),
                zr = ((tl && zc) || (!tl && zt) ? ra : 1);

            selection.scale(xr,yr,zr);
            ui.scaleX.was = ui.scaleX.value = xv * xr;
            ui.scaleY.was = ui.scaleY.value = yv * yr;
            ui.scaleZ.was = ui.scaleZ.value = zv * zr;
        }

        function selectionRotate(e) {
            let val = parseFloat(e.target.value) || 0;
            e.target.value = val;
        }

        space.event.onEnterKey([
            ui.scaleX,        selectionScale,
            ui.scaleY,        selectionScale,
            ui.scaleZ,        selectionScale,
            ui.sizeX,         selectionSize,
            ui.sizeY,         selectionSize,
            ui.sizeZ,         selectionSize,
            ui.toolName,      updateTool,
            ui.toolNum,       updateTool,
            ui.toolFluteDiam, updateTool,
            ui.toolFluteLen,  updateTool,
            ui.toolShaftDiam, updateTool,
            ui.toolShaftLen,  updateTool,
            ui.toolTaperTip,  updateTool,
            ui.toolTaperAngle, updateTool,
            $('rot_x'),       selectionRotate,
            $('rot_y'),       selectionRotate,
            $('rot_z'),       selectionRotate
        ], true);

        $('lab-axis').onclick = () => {
            ui.lockX.checked =
            ui.lockY.checked =
            ui.lockZ.checked = !(
                ui.lockX.checked ||
                ui.lockY.checked ||
                ui.lockZ.checked
            );
        };

        $('scale-reset').onclick = $('lab-scale').onclick = () => {
            selection.scale(1 / ui.scaleX.was, 1 / ui.scaleY.was, 1 / ui.scaleZ.was);
            ui.scaleX.value = ui.scaleY.value = ui.scaleZ.value =
            ui.scaleX.was = ui.scaleY.was = ui.scaleZ.was = 1;
        };

        $('app-xpnd').onclick = () => {
            try {
                DOC.body.requestFullscreen();
            } catch (e) {
                event.emit('resize');
                moto.space.event.onResize();
            }
        };

        if (!DOC.body.requestFullscreen) {
            $('app-xpnd').style.display = 'none';
        }

        uc.onBlur([
            ui.toolName,
            ui.toolNum,
            ui.toolFluteDiam,
            ui.toolFluteLen,
            ui.toolShaftDiam,
            ui.toolShaftLen,
            ui.toolTaperTip,
        ], updateTool);

        ui.toolMetric.onclick = updateTool;
        ui.toolType.onchange = updateTool;
        // default show gcode pre
        ui.gcodePre.button.click();

        function mksvg(src) {
            let svg = DOC.createElement('svg');
            svg.innerHTML = src;
            return svg;
        }

        function mklbl(src) {
            let lbl = DOC.createElement('label');
            lbl.innerText = src;
            return lbl;
        }

        api.platform.update_size();

        function mouseOnHover(int, event, ints) {
            if (!api.feature.hover) return;
            if (!int) return api.feature.hovers || api.widgets.meshes();
            api.event.emit('mouse.hover', {int, ints, event, point: int.point, type: 'widget'});
        }

        function platformOnHover(int, event) {
            if (!api.feature.hover) return;
            if (int) api.event.emit('mouse.hover', {point: int, event, type: 'platform'});
        }

        api.event.on("feature.hover", enable => {
            space.mouse.onHover(enable ? mouseOnHover : undefined);
            space.platform.onHover(enable ? platformOnHover : undefined);
        });

        // block standard browser context menu
        DOC.oncontextmenu = (event) => {
            let et = event.target;
            if (et.tagName === 'CANVAS' || et.id === 'context-menu' || et.classList.contains('draggable')) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        };

        space.mouse.downSelect((int, event) => {
            if (api.feature.on_mouse_down) {
                if (int) {
                    api.feature.on_mouse_down(int, event);
                    return;
                }
            }
            if (api.feature.hover) {
                if (int) {
                    return api.event.emit('mouse.hover.down', {int, point: int.point});
                } else {
                    return selection.meshes();
                }
            }
            // lay flat with meta or ctrl clicking a selected face
            if (int && (event.ctrlKey || event.metaKey || api.feature.on_face_select)) {
                let q = new THREE.Quaternion();
                // find intersecting point, look "up" on Z and rotate to face that
                q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                selection.rotate(q);
            }
            if (api.view.get() !== VIEWS.ARRANGE) {
                // return no selection in modes other than arrange
                return null;
            } else {
                // return selected meshes for further mouse processing
                return api.feature.hovers || selection.meshes();
            }
        });

        space.mouse.upSelect((object, event) => {
            if (api.feature.on_mouse_up) {
                if (event && object) {
                    return api.feature.on_mouse_up(object, event);
                } else {
                    return api.widgets.meshes();
                }
            }
            if (event && api.feature.hover) {
                api.event.emit('mouse.hover.up', { object, event });
                return;
            }
            if (event && event.target.nodeName === "CANVAS") {
                if (object && object.object) {
                    if (object.object.widget) {
                        platform.select(object.object.widget, event.shiftKey, false);
                    }
                } else {
                    platform.deselect();
                }
            } else {
                return api.feature.hovers || api.widgets.meshes();
            }
        });

        space.mouse.onDrag(function(delta, offset, up = false) {
            if (api.feature.hover) {
                return;
            }
            if (up) {
                api.event.emit('mouse.drag.done', offset);
            }
            if (delta && ui.freeLayout.checked) {
                let set = settings();
                let dev = set.device;
                let bound = set.bounds_sel;
                let width = dev.bedWidth/2;
                let depth = dev.bedDepth/2;
                let isout = (
                    bound.min.x <= -width ||
                    bound.min.y <= -depth ||
                    bound.max.x >= width ||
                    bound.max.y >= depth
                );
                if (!isout) {
                    if (bound.min.x + delta.x <= -width) return;
                    if (bound.min.y + delta.y <= -depth) return;
                    if (bound.max.x + delta.x >= width) return;
                    if (bound.max.y + delta.y >= depth) return;
                }
                selection.move(delta.x, delta.y, 0);
                api.event.emit('selection.drag', delta);
            } else {
                return selection.meshes().length > 0;
            }
        });

        api.space.restore(init_two) || checkSeed(init_two) || init_two();
    };

    // SECOND STAGE INIT AFTER UI RESTORED
    function init_two() {
        api.event.emit('init.two');

        // call driver initializations, if present
        Object.values(kiri.driver).forEach(driver => {
            if (driver.init) try {
                driver.init(kiri, api, driver);
            } catch (error) {
                console.log({driver_init_fail: driver, error})
            }
        });

        // load script extensions
        if (SETUP.s) SETUP.s.forEach(function(lib) {
            let scr = DOC.createElement('script');
            scr.setAttribute('defer',true);
            scr.setAttribute('src',`/code/${lib}.js?${kiri.version}`);
            DOC.body.appendChild(scr);
            stats.add('load_'+lib);
            api.event.emit('load.lib', lib);
        });

        // load CSS extensions
        if (SETUP.ss) SETUP.ss.forEach(function(style) {
            style = style.charAt(0) === '/' ? style : `/kiri/style-${style}`;
            let ss = DOC.createElement('link');
            ss.setAttribute("type", "text/css");
            ss.setAttribute("rel", "stylesheet");
            ss.setAttribute("href", `${style}.css?${kiri.version}`);
            DOC.body.appendChild(ss);
        });

        // override stored settings
        if (SETUP.v) SETUP.v.forEach(function(kv) {
            kv = kv.split('=');
            sdb.setItem(kv[0],kv[1]);
        });

        // import octoprint settings
        if (SETUP.ophost) {
            let ohost = api.const.OCTO = {
                host: SETUP.ophost[0],
                apik: SETUP.opkey ? SETUP.opkey[0] : ''
            };
            sdb['octo-host'] = ohost.host;
            sdb['octo-apik'] = ohost.apik;
            console.log({octoprint:ohost});
        }

        // load workspace from url
        if (SETUP.wrk) {
            api.settings.import_url(`${proto}//${SETUP.wrk[0]}`, false);
        }

        // bind this to UI so main can call it on settings import
        ui.sync = function() {
            const current = settings();
            const control = current.controller;

            if (!control.devel) {
                // TODO: hide thin type 3 during development
                kiri.consts.LISTS.thin.length = 3;
            }

            platform.deselect();
            catalog.addFileListener(updateCatalog);
            space.view.setZoom(control.reverseZoom, control.zoomSpeed);
            space.platform.setGridZOff(undefined);
            space.platform.setZOff(0.05);

            // restore UI state from settings
            ui.showOrigin.checked = control.showOrigin;
            ui.showRulers.checked = control.showRulers;
            ui.showSpeeds.checked = control.showSpeeds;
            ui.freeLayout.checked = control.freeLayout;
            ui.autoLayout.checked = control.autoLayout;
            ui.spaceRandoX.checked = control.spaceRandoX;
            ui.antiAlias.checked = control.antiAlias;
            ui.reverseZoom.checked = control.reverseZoom;
            ui.autoSave.checked = control.autoSave;
            ui.healMesh.checked = control.healMesh;
            ui.threaded.checked = setThreaded(control.threaded);
            ui.assembly.checked = control.assembly;
            ui.ortho.checked = control.ortho;
            ui.devel.checked = control.devel;
            lineTypeSave();
            detailSave();
            updateStats();

            // optional set-and-lock mode (hides mode menu)
            let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

            // optional set-and-lock device (hides device menu)
            let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

            // setup default mode and enable mode locking, if set
            api.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);

            // fill device list
            api.devices.refresh();

            // update ui fields from settings
            api.conf.update_fields();

            // default to ARRANGE view mode
            api.view.set(VIEWS.ARRANGE);

            // add ability to override
            api.show.controls(api.feature.controls);

            // update everything dependent on the platform size
            platform.update_size();

            // load wasm if indicated
            kiri.client.wasm(control.assembly === true);
        };

        ui.sync();

        // clear alerts as they build up
        setInterval(api.event.alerts, 1000);

        // add hide-alerts-on-alert-click
        ui.alert.dialog.onclick = function() {
            api.event.alerts(true);
        };

        // enable modal hiding
        $('mod-x').onclick = api.modal.hide;

        if (!SETUP.s) console.log(`kiri | init main | ${kiri.version}`);

        // send init-done event
        api.event.emit('init-done', stats);

        // show gdpr if it's never been seen and we're not iframed
        const isLocal = LOCAL || WIN.location.host.split(':')[0] === 'localhost';
        if (!sdb.gdpr && WIN.self === WIN.top && !SETUP.debug && !isLocal) {
            $('gdpr').style.display = 'flex';
        }

        // warn of degraded functionality when SharedArrayBuffers are missing
        if (api.feature.work_alerts && !window.SharedArrayBuffer) {
            api.alerts.show("The security context of this", 10);
            api.alerts.show("Window blocks important functionality.", 10);
            api.alerts.show("Try a Chromium-base Browser instead", 10);
        }

        // add keyboard focus handler (must use for iframes)
        WIN.addEventListener('load', function () {
            WIN.focus();
            DOC.body.addEventListener('click', function() {
                WIN.focus();
            },false);
        });

        // dismiss gdpr alert
        $('gotit').onclick = () => {
            $('gdpr').style.display = 'none';
            sdb.gdpr = Date.now();
        };

        // lift curtain
        $('curtain').style.display = 'none';

        // bind interface action elements
        $('mode-device').onclick = api.show.devices;
        $('mode-profile').onclick = settingsLoad;
        $('mode-fdm').onclick = () => api.mode.set('FDM');
        $('mode-cam').onclick = () => api.mode.set('CAM');
        $('mode-sla').onclick = () => api.mode.set('SLA');
        $('mode-laser').onclick = () => api.mode.set('LASER');
        $('mode-drag').onclick = () => api.mode.set('DRAG');
        $('mode-wjet').onclick = () => api.mode.set('WJET');
        $('mode-wedm').onclick = () => api.mode.set('WEDM');
        $('set-device').onclick = (ev) => { ev.stopPropagation(); api.show.devices() };
        $('set-profs').onclick = (ev) => { ev.stopPropagation(); api.conf.show() };
        $('set-tools').onclick = (ev) => { ev.stopPropagation(); api.show.tools() };
        $('set-prefs').onclick = (ev) => { ev.stopPropagation(); api.modal.show('prefs') };
        ui.acct.help.onclick = (ev) => { ev.stopPropagation(); api.help.show() };
        ui.acct.don8.onclick = (ev) => { ev.stopPropagation(); api.modal.show('don8') };
        ui.acct.mesh.onclick = (ev) => { ev.stopPropagation(); WIN.location = "/mesh" };
        ui.acct.export.onclick = (ev) => { ev.stopPropagation(); profileExport() };
        ui.acct.export.title = LANG.acct_xpo;
        $('file-new').onclick = (ev) => { ev.stopPropagation(); workspaceNew() };
        $('file-recent').onclick = () => { api.modal.show('files') };
        $('file-import').onclick = (ev) => { api.event.import(ev); };
        ui.func.slice.onclick = (ev) => { ev.stopPropagation(); api.function.slice() };
        ui.func.preview.onclick = (ev) => { ev.stopPropagation(); api.function.print() };
        ui.func.animate.onclick = (ev) => { ev.stopPropagation(); api.function.animate() };
        ui.func.export.onclick = (ev) => { ev.stopPropagation(); api.function.export() };
        $('view-arrange').onclick = api.platform.layout;
        $('view-top').onclick = space.view.top;
        $('view-home').onclick = space.view.home;
        $('view-front').onclick = space.view.front;
        $('view-back').onclick = space.view.back;
        $('view-left').onclick = space.view.left;
        $('view-right').onclick = space.view.right;
        $('unrotate').onclick = () => {
            api.widgets.for(w => w.unrotate());
            selection.update_info();
        };
        // attach button handlers to support targets
        for (let btn of ["don8pt","don8gh","don8pp"]) {
            $(btn).onclick = (ev) => {
                window.open(ev.target.children[0].href);
            }
        }
        // rotation buttons
        let d = (Math.PI / 180);
        $('rot_x_lt').onclick = () => { selection.rotate(-d * $('rot_x').value,0,0) };
        $('rot_x_gt').onclick = () => { selection.rotate( d * $('rot_x').value,0,0) };
        $('rot_y_lt').onclick = () => { selection.rotate(0,-d * $('rot_y').value,0) };
        $('rot_y_gt').onclick = () => { selection.rotate(0, d * $('rot_y').value,0) };
        $('rot_z_lt').onclick = () => { selection.rotate(0,0, d * $('rot_z').value) };
        $('rot_z_gt').onclick = () => { selection.rotate(0,0,-d * $('rot_z').value) };
        // rendering options
        $('render-edges').onclick = () => { api.view.edges({ toggle: true }); api.conf.save() };
        $('render-ghost').onclick = () => { api.view.wireframe(false, 0, api.view.is_arrange() ? 0.4 : 0.25); };
        $('render-wire').onclick = () => { api.view.wireframe(true, 0, api.space.is_dark() ? 0.25 : 0.5); };
        $('render-solid').onclick = () => { api.view.wireframe(false, 0, 1); };
        $('mesh-export-stl').onclick = () => { objectsExport('stl') };
        $('mesh-export-obj').onclick = () => { objectsExport('obj') };
        $('mesh-merge').onclick = selection.merge;
        $('context-duplicate').onclick = duplicateSelection;
        $('context-mirror').onclick = mirrorSelection;
        $('context-layflat').onclick = () => { api.event.emit("tool.mesh.lay-flat") };
        $('context-setfocus').onclick = () => {
            api.event.emit(
                "tool.camera.focus",
                ev => api.space.set_focus(undefined, ev.object.point)
            );
        };

        // ui.modal.onclick = api.modal.hide;
        ui.modalBox.onclick = (ev) => { ev.stopPropagation() };

        // add app name hover info
        $('app-info').innerText = kiri.version;

        // show topline separator when iframed
        try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { console.log(e) }

        // warn users they are running a beta release
        if (kiri.beta && kiri.beta > 0 && sdb.kiri_beta != kiri.beta) {
            api.show.alert("CAUTION");
            api.show.alert("this is a development release");
            api.show.alert("and may not function properly");
            sdb.kiri_beta = kiri.beta;
        }
    }

    // update static html elements with language overrides
    ui.lang = function() {
        // lk attribute causes inner text to be replaced with lang value
        for (let el of [...DOC.querySelectorAll("[lk]")]) {
            let key = el.getAttribute('lk');
            let val = LANG[key];
            if (val) {
                el.innerText = val;
            } else {
                console.log({missing_ln: key});
            }
        }
        // lkt attribute causes a title attribute to be set from lang value
        for (let el of [...DOC.querySelectorAll("[lkt]")]) {
            let key = el.getAttribute('lkt');
            let val = LANG[key];
            if (val) {
                el.setAttribute("title", val);
            } else {
                console.log({missing_ln: key});
            }
        }
    }

    // init lang must happen before all other init functions
    function init_lang() {
        // if a language needs to load, the script is injected and loaded
        // first.  once this loads, or doesn't, the initialization begins
        let lang = SETUP.ln ? SETUP.ln[0] : sdb.getItem('kiri-lang') || kiri.lang.get();
        // inject language script if not english
        if (lang && lang !== 'en' && lang !== 'en-us') {
            let map = kiri.lang.map(lang);
            let scr = DOC.createElement('script');
            // scr.setAttribute('defer',true);
            scr.setAttribute('src',`/kiri/lang/${map}.js?${kiri.version}`);
            (DOC.body || DOC.head).appendChild(scr);
            stats.set('ll',lang);
            scr.onload = function() {
                kiri.lang.set(map);
                ui.lang();
                init_one();
            };
            scr.onerror = function(err) {
                console.log({language_load_error: err, lang})
                kiri.lang.set();
                ui.lang();
                init_one();
            }
        } else {
            // set to browser default which will be overridden
            // by any future script loads (above)
            kiri.lang.set();
            ui.lang();
            init_one();
        }
    }

    // setup init() trigger when dom + scripts complete
    DOC.onreadystatechange = function() {
        if (DOC.readyState === 'complete') {
            init_lang();
        }
    }

});
