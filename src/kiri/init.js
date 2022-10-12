/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: kiri.api
// dep: kiri.main
// dep: kiri.lang
// dep: kiri.stats
// dep: kiri.consts
// dep: kiri.platform
// dep: kiri.selection
// use: kiri.tools
// use: kiri.pack
gapp.register("kiri.init", [], (root, exports) => {

    const { base, kiri } = root;
    const { api, catalog, conf, consts, space } = kiri;
    const { sdb, stats, js2o, o2js, platform, selection, ui, uc } = api;
    const { VIEWS, MODES, SEED } = consts;
    const { LANG, LOCAL, SETUP } = api.const;

    const WIN = self.window,
        DOC = self.document,
        DEFMODE = SETUP.dm && SETUP.dm.length === 1 ? SETUP.dm[0] : 'FDM',
        STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
        DEG2RAD = Math.PI/180,
        ALL = [MODES.FDM, MODES.LASER, MODES.CAM, MODES.SLA],
        CAM = [MODES.CAM],
        SLA = [MODES.SLA],
        FDM = [MODES.FDM],
        FDM_SLA = [MODES.FDM,MODES.SLA],
        FDM_CAM = [MODES.CAM,MODES.FDM],
        FDM_LZR = [MODES.LASER,MODES.FDM],
        FDM_LZR_SLA = [MODES.LASER,MODES.FDM,MODES.SLA],
        CAM_LZR = [MODES.LASER,MODES.CAM],
        GCODE = [MODES.FDM, MODES.LASER, MODES.CAM],
        LASER = [MODES.LASER],
        proto = location.protocol,
        ver = Date.now().toString(36);

    let currentDevice = null,
        deviceURL = null,
        deviceTexture = null,
        deviceFilter = null,
        deviceImage = null,
        selectedTool = null,
        editTools = null,
        maxTool = 0,
        platformColor,
        contextInt;

    // extend KIRI API with local functions
    api.show.devices = showDevices;
    api.device.set = selectDevice;
    api.device.clone = cloneDevice;

    function settings() {
        return api.conf.get();
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
                    platform.compute_max_z();
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

    function filamentSourceEditUpdate() {
        if (ui.filamentSource && ui.filamentSourceEdit) {
            api.event.emit("filament.source");
            const sel = ui.filamentSource.options[ui.filamentSource.selectedIndex];
            if (sel) {
                ui.filamentSourceEdit.style.display = sel.value === 'palette3' ? '' : 'none';
            }
        }
    }

    function filamentSourceSave() {
        const sel = ui.filamentSource.options[ui.filamentSource.selectedIndex];
        if (sel) {
            settings().device.filamentSource = sel.value;
            api.conf.save();
        }
        filamentSourceEditUpdate();
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
        api.platform.update_speeds();
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
        let isDark = control.dark;
        let doAlert = ui.ortho.checked !== control.ortho;
        if (control.assembly != ui.assembly.checked) {
            kiri.client.wasm(ui.assembly.checked);
        }
        if (control.antiAlias != ui.antiAlias.checked) {
            api.show.alert('Page Reload Required to Change Aliasing');
        }
        control.decals = ui.decals.checked;
        control.danger = ui.danger.checked;
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
        control.decimate = ui.decimate.checked;
        control.healMesh = ui.healMesh.checked;
        control.threaded = setThreaded(ui.threaded.checked);
        control.assembly = ui.assembly.checked;
        control.ortho = ui.ortho.checked;
        control.devel = ui.devel.checked;
        space.view.setZoom(control.reverseZoom, control.zoomSpeed);
        // platform.layout();
        api.conf.save();
        api.platform.update_size();
        api.catalog.setOptions({
            maxpass: control.decimate ? 10 : 0
        });
        uc.setHoverPop(false);
        updateStats();
        if (control.decals && !control.dark) {
            // disable decals in dark mode
            loadDeviceTexture(currentDevice, deviceTexture);
        } else {
            clearDeviceTexture();
        }
        api.event.emit('boolean.update');
        if (doAlert) {
            api.show.alert("change requires page refresh");
        }
    }

    function updateStats() {
        if (self.debug !== true) {
            return;
        }
        let { div, fps, rms, rnfo } = ui.stats;
        div.style.display = 'flex';
        setInterval(() => {
            const nfps = space.view.getFPS().toFixed(2);
            const nrms = space.view.getRMS().toFixed(2);
            const rend = space.renderInfo();
            const { memory, render } = rend;
            if (nfps !== fps.innerText) {
                fps.innerText = nfps;
            }
            if (nrms !== rms.innerText) {
                rms.innerText = nrms;
            }
            if (rnfo.offsetParent !== null) {
                rnfo.innerText = JSON.stringify({ ...memory, ...render }, null, 4);
            }
        }, 100);
    }

    function parentWithClass(el, classname) {
        while (el) {
            if (el.classList.contains(classname)) {
                return el;
            }
            el = el.parentNode;
        }
        return el;
    }

    // function onLayerToggle() {
    //     api.conf.update();
    //     api.show.slices();
    // }

    function onBooleanClick() {
        // prevent hiding elements in device editor on clicks
        // if (!api.modal.visible()) {
            uc.refresh();
        // }
        api.conf.update();
        DOC.activeElement.blur();
        api.event.emit("boolean.click");
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

    function inputTextOK() {
        return DOC.activeElement === ui.deviceName;
    }

    function textAreaHasFocus() {
        let active = DOC.activeElement;
        return active && active.nodeName === "TEXTAREA";
    }

    function inputSize() {
        return parseInt(DOC.activeElement.size);
    }

    function cca(c) {
        return c.charCodeAt(0);
    }

    function keyUpHandler(evt) {
        if (api.feature.on_key) {
            if (api.feature.on_key({up:evt})) return;
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
                // kill any poppers in compact mode
                uc.hidePoppers();
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
        let move = evt.altKey ? 5 : 0,
            deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);
        switch (evt.keyCode) {
            case 8: // apple: delete/backspace
            case 46: // others: delete
                if (inputHasFocus()) return false;
                platform.delete(api.selection.meshes());
                evt.preventDefault();
                break;
            case 37: // left arrow
                if (inputHasFocus()) return false;
                if (deg) api.selection.rotate(0, 0, -deg);
                if (move > 0) api.selection.move(-move, 0, 0);
                evt.preventDefault();
                break;
            case 39: // right arrow
                if (inputHasFocus()) return false;
                if (deg) api.selection.rotate(0, 0, deg);
                if (move > 0) api.selection.move(move, 0, 0);
                evt.preventDefault();
                break;
            case 38: // up arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return api.show.layer(api.var.layer_at+1);
                if (deg) api.selection.rotate(deg, 0, 0);
                if (move > 0) api.selection.move(0, move, 0);
                evt.preventDefault();
                break;
            case 40: // down arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return api.show.layer(api.var.layer_at-1);
                if (deg) api.selection.rotate(-deg, 0, 0);
                if (move > 0) api.selection.move(0, -move, 0);
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
                    if (yes) sdb.clear();
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
                if (evt.shiftKey) {
                    api.show.alert('CAPS lock on?');
                }
                api.function.slice();
                break;
            case cca('P'): // prepare
            case cca('p'): // prepare
                if (evt.shiftKey) {
                    api.show.alert('CAPS lock on?');
                }
                if (api.mode.get() !== 'SLA') {
                    // hidden in SLA mode
                    api.function.print();
                }
                break;
            case cca('X'): // export
            case cca('x'): // export
                if (evt.shiftKey) {
                    api.show.alert('CAPS lock on?');
                }
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
                showDevices();
                break;
            case cca('w'): // scale
                api.event.emit("tool.next");
                break;
            case cca('o'): // tools
                showTools();
                break;
            case cca('c'): // local devices
                api.show.local();
                break;
            case cca('v'): // toggle single slice view mode
                if (api.view.get() === VIEWS.ARRANGE) {
                    api.space.set_focus(api.selection.widgets());
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
            case cca('R'): // toggle slice render mode
                renderMode++;
                api.function.slice();
                break;
            case cca('a'):
                if (api.view.get() === VIEWS.ARRANGE) {
                    // auto arrange items on platform
                    platform.layout();
                    if (!api.conf.get().controller.spaceRandoX) {
                        api.space.set_focus(api.selection.widgets());
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

    function layFlat() {
        let int = contextInt[0];
        if (int && int.object && int.object.widget) {
            let q = new THREE.Quaternion();
            q.setFromUnitVectors(contextInt[0].face.normal, new THREE.Vector3(0,0,-1));
            api.selection.rotate(q);
        }
    }

    function setFocus() {
        let int = contextInt[0];
        if (int && int.object && int.object.widget) {
            api.space.set_focus(undefined, int.point);
        }
    }

    function duplicateSelection() {
        api.selection.duplicate();
    }

    function mirrorSelection() {
        api.selection.mirror();
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
        if (api.selection.meshes().length === 0) {
            api.show.alert("select object to rotate");
            return;
        }
        let coord = (prompt("Enter X,Y,Z degrees of rotation") || '').split(','),
            prod = Math.PI / 180,
            x = parseFloat(coord[0] || 0.0) * prod,
            y = parseFloat(coord[1] || 0.0) * prod,
            z = parseFloat(coord[2] || 0.0) * prod;

        api.selection.rotate(x, y, z);
    }

    function positionSelection() {
        if (api.selection.meshes().length === 0) {
            api.show.alert("select object to position");
            return;
        }
        let current = settings(),
            center = current.process.outputOriginCenter || current.device.bedRound,
            bounds = boundsSelection(),
            coord = prompt("Enter X,Y coordinates for selection").split(','),
            x = parseFloat(coord[0] || 0.0),
            y = parseFloat(coord[1] || 0.0),
            z = parseFloat(coord[2] || 0.0);

        if (!center) {
            x = x - current.device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
            y = y - current.device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
        }

        api.selection.move(x, y, z, true);
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
        // return api.selection.export();
        uc.confirm("Export Filename", {ok:true, cancel: false}, `selected.${format}`).then(name => {
            if (!name) return;
            if (name.toLowerCase().indexOf(`.${format}`) < 0) {
                name = `${name}.${format}`;
            }
            api.util.download(api.selection.export(format), name);
        });
    }

    function profileExport(workspace) {
        let checked = workspace ? ' checked' : '';
        const opt = {pre: [
            "<div class='f-col a-center'>",
            `  <h3>${workspace ? "Workspace" : "Profile"} Export</h3>`,
            "  <label>This will create a backup of</label>",
            workspace ?
            "  <label>your workspace and settings</label>" :
            "  <label>your device profiles and settings</label><br>",
            `  <div class='f-row' style="display:${workspace ? 'none' : ''}">`,
            `  <input id='incwork' type='checkbox'${checked}>&nbsp;include workspace`,
            "  </div>",
            "</div>"
        ]};
        uc.confirm("Export Filename", {ok:true, cancel: false}, "workspace", opt).then(name => {
            if (name) {
                let work = $('incwork').checked;
                let json = api.conf.export({work, clear:true});

                kiri.client.zip([
                    {name:"workspace.json", data:JSON.stringify(json)}
                ], progress => {
                    api.show.progress(progress.percent/100, "compressing workspace");
                }, output => {
                    api.show.progress(0);
                    api.util.download(output, `${name}.kmz`);
                });
            }
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
            };

        if (name) {
            saveAs(name);
        } else {
            uc.prompt("Save Settings As", cp ? lp || def : def).then(saveAs);
        }
    }

    function settingsLoad() {
        uc.hidePoppers();
        api.conf.show();
    }

    function putLocalDevice(devicename, obj) {
        settings().devices[devicename] = obj;
        api.conf.save();
    }

    function removeLocalDevice(devicename) {
        delete settings().devices[devicename];
        api.conf.save();
    }

    function isLocalDevice(devicename) {
        return settings().devices[devicename] ? true : false;
    }

    function getSelectedDevice() {
        return api.device.get();
    }

    function selectDevice(devicename) {
        if (isLocalDevice(devicename)) {
            setDeviceCode(settings().devices[devicename], devicename);
        } else {
            let code = devices[api.mode.get_lower()][devicename];
            if (code) {
                setDeviceCode(code, devicename);
            }
        }
    }

    // only for local filters
    function cloneDevice() {
        let name = `${getSelectedDevice().replace(/\./g,' ')}`;
        let code = api.clone(settings().device);
        code.mode = api.mode.get();
        if (name.toLowerCase().indexOf('my ') >= 0) {
            name = `${name} copy`;
        } else {
            name = `My ${name}`;
        }
        putLocalDevice(name, code);
        setDeviceCode(code, name);
    }

    function setDeviceCode(code, devicename) {
        api.event.emit('device.select', {devicename, code});
        try {
            if (typeof(code) === 'string') code = js2o(code) || {};

            api.event.emit('device.set', devicename);

            let mode = api.mode.get(),
                current = settings(),
                local = isLocalDevice(devicename),
                dev = current.device = conf.device_from_code(code,mode),
                dproc = current.devproc[devicename], // last process name for this device
                newdev = dproc === undefined,   // first time device is selected
                predev = current.filter[mode],  // previous device selection
                chgdev = predev !== devicename; // device is changing

            // first time device use, add any print profiles and set to default if present
            if (code.profiles) {
                for (let profile of code.profiles) {
                    let profname = profile.processName;
                    // if no saved profile by that name for this mode...
                    if (!current.sproc[mode][profname]) {
                        console.log('adding profile', profname, 'to', mode);
                        current.sproc[mode][profname] = profile;
                    }
                    // if it's a new device, seed the new profile name as last profile
                    if (newdev && !current.devproc[devicename]) {
                        console.log('setting default profile for new device', devicename, 'to', profname);
                        current.devproc[devicename] = dproc = profname;
                    }
                }
            }

            dev.new = false;
            dev.deviceName = devicename;

            ui.deviceName.value = devicename;
            ui.deviceBelt.checked = dev.bedBelt;
            ui.deviceRound.checked = dev.bedRound;
            ui.deviceOrigin.checked = dev.outputOriginCenter || dev.originCenter || dev.bedRound;
            ui.fwRetract.checked = dev.fwRetract;
            if (!dev.filamentSource) ui.filamentSource.selectedIndex = 0;

            // add extruder selection buttons
            if (dev.extruders) {
                for (let ext of dev.extruders) {
                    // add missing deselect field from legacy configs
                    if (!ext.extDeselect) {
                        ext.extDeselect = [];
                    }
                }
                let ext = api.lists.extruders = [];
                dev.internal = 0;
                let selext = $('pop-nozzle');
                selext.innerHTML = '';
                for (let i=0; i<dev.extruders.length; i++) {
                    let d = DOC.createElement('div');
                    d.appendChild(DOC.createTextNode(i));
                    d.setAttribute('id', `sel-ext-${i}`);
                    d.setAttribute('class', 'col j-center');
                    d.onclick = function() {
                        api.selection.for_widgets(w => {
                            api.widgets.annotate(w.id).extruder = i;
                        });
                        api.platform.update_selected();
                    };
                    selext.appendChild(d);
                    ext.push({id:i, name:i});
                }
            }

            // disable editing for non-local devices
            [
                ui.deviceName,
                ui.gcodePre,
                ui.gcodePost,
                ui.bedDepth,
                ui.bedWidth,
                ui.maxHeight,
                ui.resolutionX,
                ui.resolutionY,
                ui.deviceOrigin,
                ui.deviceRound,
                ui.deviceBelt,
                ui.fwRetract,
                ui.filamentSource,
                ui.deviceZMax,
                ui.gcodeFan,
                ui.gcodeTrack,
                ui.gcodeLayer,
                ui.extFilament,
                ui.extNozzle,
                ui.spindleMax,
                ui.gcodeSpindle,
                ui.gcodeDwell,
                ui.gcodeChange,
                ui.gcodeFExt,
                ui.gcodeSpace,
                ui.gcodeStrip,
                ui.gcodeLaserOn,
                ui.gcodeLaserOff,
                ui.extPrev,
                ui.extNext,
                ui.extAdd,
                ui.extDel,
                ui.extOffsetX,
                ui.extOffsetY,
                ui.extSelect,
                ui.extDeselect
            ].forEach(function(e) {
                e.disabled = !local;
            });

            ui.deviceSave.disabled = !local;
            ui.deviceDelete.disabled = !local;
            ui.deviceExport.disabled = !local;
            if (local) {
                ui.deviceAdd.innerText = "copy";
                ui.deviceDelete.style.display = '';
                ui.deviceExport.style.display = '';
            } else {
                ui.deviceAdd.innerText = "customize";
                ui.deviceDelete.style.display = 'none';
                ui.deviceExport.style.display = 'none';
            }
            ui.deviceAdd.disabled = dev.noclone;

            api.conf.update_fields();
            platform.update_size();
            platform.update_origin();
            platform.update();

            // store current device name for this mode
            current.filter[mode] = devicename;
            // cache device record for this mode (restored in setMode)
            current.cdev[mode] = currentDevice = dev;

            if (dproc) {
                // restore last process associated with this device
                api.conf.load(null, dproc);
            } else {
                api.conf.update();
            }

            api.conf.save();

            if (isBelt()) {
                // space.view.setHome(dev.bedBelt ? Math.PI/2 : 0, Math.PI / 2.5);
                space.view.setHome(0, Math.PI / 2.5);
            } else {
                space.view.setHome(0);
            }
            // when changing devices, update focus on widgets
            if (chgdev) {
                setTimeout(api.space.set_focus, 0);
            }

            uc.refresh();
            filamentSourceEditUpdate();

            if (dev.imageURL) {
                if (dev.imageURL !== deviceURL) {
                    deviceURL = dev.imageURL;
                    loadDeviceImage(dev);
                }
            } else {
                clearDeviceTexture();
            }
        } catch (e) {
            console.log({error:e, device:code, devicename});
            api.show.alert(`invalid or deprecated device: "${devicename}"`, 10);
            api.show.alert(`please select a new device`, 10);
            throw e;
            showDevices();
        }
        api.function.clear();
        api.event.settings();
    }

    function clearDeviceTexture() {
        if (deviceImage) {
            space.world.remove(deviceImage);
            deviceImage = null;
            deviceURL = null;
        }
    }

    function loadDeviceImage(dev, url) {
        let turl = url || dev.imageURL;
        if (!turl) return;
        new THREE.TextureLoader().load(turl, texture => {
            loadDeviceTexture(dev, texture);
        }, inc => {
            console.log({load_inc: inc});
        }, error => {
            console.log({load_error: error, turl});
            clearDeviceTexture();
        });
    }

    function loadDeviceTexture(dev, texture) {
        clearDeviceTexture();
        deviceTexture = texture;
        let { decals, dark } = api.conf.get().controller;
        // disable decals in dark mode
        if (!(texture && decals && !dark)) {
            return;
        }
        let { width, height } = texture.image;
        let { bedWidth, bedDepth, bedHeight } = dev;
        let scale = dev.imageScale || 0.75;
        let img_ratio = width / height;
        if (scale <= 1) {
            let dev_ratio = bedWidth / bedDepth;
            if (dev_ratio > img_ratio) {
                scale *= bedDepth / height;
            } else {
                scale *= bedWidth / width;
            }
        } else if (scale > 1) {
            scale = (scale / Math.max(width, height));
        }
        width *= scale;
        height *= scale;
        let pos = null;
        if (true) switch (dev.imageAnchor) {
            case 1: pos = { x: -(bedWidth - width)/2, y:  (bedDepth - height)/2 }; break;
            case 2: pos = { x: 0,                     y:  (bedDepth - height)/2 }; break;
            case 3: pos = { x:  (bedWidth - width)/2, y:  (bedDepth - height)/2 }; break;
            case 4: pos = { x: -(bedWidth - width)/2, y:  0                     }; break;
            case 5: pos = { x:  (bedWidth - width)/2, y:  0                     }; break;
            case 6: pos = { x: -(bedWidth - width)/2, y: -(bedDepth - height)/2 }; break;
            case 7: pos = { x: 0,                     y: -(bedDepth - height)/2 }; break;
            case 8: pos = { x:  (bedWidth - width)/2, y: -(bedDepth - height)/2 }; break;
        }
        let geometry = new THREE.PlaneBufferGeometry(width, height, 1),
            material = new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = -bedHeight;
        mesh.renderOrder = -1;
        if (pos) {
            mesh.position.x = pos.x;
            mesh.position.y = pos.y;
        }
        space.world.add(deviceImage = mesh);
    }

    function updateDeviceName() {
        let newname = ui.deviceName.value,
            selected = api.device.get(),
            devs = settings().devices;
        if (newname !== selected) {
            devs[newname] = devs[selected];
            delete devs[selected];
            selectDevice(newname);
            updateDeviceList();
        }
    }

    function updateDeviceSize() {
        api.conf.update();
        platform.update_size();
        platform.update_origin();
    }

    function renderDevices(devices) {
        let selectedIndex = -1,
            selected = api.device.get(),
            features = api.feature,
            devs = settings().devices,
            dfilter = typeof(features.device_filter) === 'function' ? features.device_filter : undefined;

        for (let local in devs) {
            if (!(devs.hasOwnProperty(local) && devs[local])) {
                continue;
            }
            let dev = devs[local],
                fdmCode = dev.cmd,
                fdmMode = (api.mode.get() === 'FDM');

            if (dev.mode ? (dev.mode === api.mode.get()) : (fdmCode ? fdmMode : !fdmMode)) {
                devices.push(local);
            }
        };

        devices = devices.sort();

        api.event.emit('devices.render', devices);

        ui.deviceSave.onclick = function() {
            api.event.emit('device.save');
            api.function.clear();
            api.conf.save();
            showDevices();
            api.modal.hide();
        };
        ui.deviceAdd.onclick = function() {
            api.function.clear();
            cloneDevice();
            showDevices();
        };
        ui.deviceDelete.onclick = function() {
            api.function.clear();
            removeLocalDevice(getSelectedDevice());
            showDevices();
        };
        ui.deviceExport.onclick = function(event) {
            const record = {
                version: kiri.version,
                device: selected,
                process: api.process.code(),
                code: devs[selected],
                time: Date.now()
            };
            let exp = api.util.b64enc(record);
            api.device.export(exp, selected, { event, record });
        };

        ui.deviceList.innerHTML = '';
        ui.deviceMy.innerHTML = '';
        let incr = 0;
        let found = null;
        let first = devices[0];
        let dedup = {};
        devices.forEach(function(device, index) {
            // prevent device from appearing twice
            // such as local name = standard device name
            if (dedup[device]) {
                return;
            }
            dedup[device] = device;
            let loc = isLocalDevice(device);
            // if filter set, use
            if (!loc && deviceFilter && device.toLowerCase().indexOf(deviceFilter) < 0) {
                return;
            }
            // allow for device filter feature
            if (dfilter && dfilter(device) === false) {
                return;
            }
            if (incr === 0) {
                first = device;
            }
            let opt = DOC.createElement('button');
            opt.appendChild(DOC.createTextNode(device.replace(/\./g,' ')));
            opt.onclick = function() {
                selectDevice(device);
                opt.classList.add("selected");
                if (found && found !== opt) {
                    found.classList.remove("selected");
                }
                found = opt;
                api.platform.layout();
            };
            if (loc) {
                ui.deviceMy.appendChild(opt);
            } else {
                ui.deviceList.appendChild(opt);
            }
            if (device === selected) {
                // scroll to highlighted selection
                setTimeout(() => ui.deviceList.scrollTop = opt.offsetTop, 0);
                opt.classList.add("selected");
                selectedIndex = incr;
                found = opt;
            }
            incr++;
        });

        if (selectedIndex >= 0) {
            selectDevice(selected);
        } else {
            selectDevice(first);
        }
    }

    function renderTools() {
        ui.toolSelect.innerHTML = '';
        maxTool = 0;
        editTools.forEach(function(tool, index) {
            maxTool = Math.max(maxTool, tool.number);
            tool.order = index;
            let opt = DOC.createElement('option');
            opt.appendChild(DOC.createTextNode(tool.name));
            opt.onclick = function() { selectTool(tool) };
            ui.toolSelect.appendChild(opt);
        });
    }

    function selectTool(tool) {
        selectedTool = tool;
        ui.toolName.value = tool.name;
        ui.toolNum.value = tool.number;
        ui.toolFluteDiam.value = tool.flute_diam;
        ui.toolFluteLen.value = tool.flute_len;
        ui.toolShaftDiam.value = tool.shaft_diam;
        ui.toolShaftLen.value = tool.shaft_len;
        // ui.toolTaperAngle.value = tool.taper_angle || 70;
        ui.toolTaperTip.value = tool.taper_tip || 0;
        ui.toolMetric.checked = tool.metric;
        ui.toolType.selectedIndex = ['endmill','ballmill','tapermill'].indexOf(tool.type);
        renderTool(tool);
    }

    function otag(o) {
        if (Array.isArray(o)) {
            let out = []
            o.forEach(oe => out.push(otag(oe)));
            return out.join('');
        }
        let tags = [];
        Object.keys(o).forEach(key => {
            let val = o[key];
            let att = [];
            Object.keys(val).forEach(tk => {
                let tv = val[tk];
                att.push(`${tk.replace(/_/g,'-')}="${tv}"`);
            });
            tags.push(`<${key} ${att.join(' ')}></${key}>`);
        });
        return tags.join('');
    }

    function renderTool(tool) {
        let type = selectedTool.type;
        let taper = type === 'tapermill';
        // ui.toolTaperAngle.disabled = taper ? undefined : 'true';
        ui.toolTaperTip.disabled = taper ? undefined : 'true';
        $('tool-view').innerHTML = '<svg id="tool-svg" width="100%" height="100%"></svg>';
        setTimeout(() => {
            let svg = $('tool-svg');
            let pad = 10;
            let dim = { w: svg.clientWidth, h: svg.clientHeight }
            let max = { w: dim.w - pad * 2, h: dim.h - pad * 2};
            let off = { x: pad, y: pad };
            let shaft_fill = "#cccccc";
            let flute_fill = "#dddddd";
            let stroke = "#777777";
            let stroke_width = 3;
            let stroke_thin = stroke_width / 2;
            let shaft = tool.shaft_len || 1;
            let flute = tool.flute_len || 1;
            let tip_len = type === "ballmill" ? tool.flute_diam / 2 : 0;
            let total_len = shaft + flute + tip_len;
            let units = dim.h / total_len;
            let shaft_len = (shaft / total_len) * max.h;
            let flute_len = (flute / total_len) * max.h;
            let total_wid = Math.max(tool.flute_diam, tool.shaft_diam);
            let shaft_off = (max.w - tool.shaft_diam * units) / 2;
            let flute_off = (max.w - tool.flute_diam * units) / 2;
            let taper_off = (max.w - (tool.taper_tip || 0) * units) / 2;
            let parts = [
                { rect: {
                    x:off.x + shaft_off, y:off.y,
                    width:max.w - shaft_off * 2, height:shaft_len,
                    stroke, fill: shaft_fill, stroke_width
                } }
            ];
            if (type === "tapermill") {
                let yoff = off.y + shaft_len;
                let mid = dim.w / 2;
                parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                    `M ${off.x + flute_off} ${yoff}`,
                    `L ${off.x + taper_off} ${yoff + flute_len}`,
                    `L ${dim.w - off.x - taper_off} ${yoff + flute_len}`,
                    `L ${dim.w - off.x - flute_off} ${yoff}`,
                    `z`
                ].join('\n')}});
            } else {
                let x1 = off.x + flute_off;
                let y1 = off.y + shaft_len;
                let x2 = x1 + max.w - flute_off * 2;
                let y2 = y1 + flute_len;
                parts.push({ rect: {
                    x:off.x + flute_off, y:off.y + shaft_len,
                    width:max.w - flute_off * 2, height:flute_len,
                    stroke, fill: flute_fill, stroke_width
                } });
                parts.push({ line: { x1, y1, x2, y2, stroke, stroke_width: stroke_thin } });
                parts.push({ line: {
                    x1: (x1 + x2) / 2, y1, x2, y2: (y1 + y2) / 2,
                    stroke, stroke_width: stroke_thin
                } });
                parts.push({ line: {
                    x1, y1: (y1 + y2) / 2, x2: (x1 + x2) / 2, y2,
                    stroke, stroke_width: stroke_thin
                } });
            }
            if (type === "ballmill") {
                let rad = (max.w - flute_off * 2) / 2;
                let xend = dim.w - off.x - flute_off;
                let yoff = off.y + shaft_len + flute_len + stroke_width/2;
                parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                    `M ${off.x + flute_off} ${yoff}`,
                    `A ${rad} ${rad} 0 0 0 ${xend} ${yoff}`,
                    // `L ${off.x + flute_off} ${yoff}`
                ].join('\n')}})
            }
            svg.innerHTML = otag(parts);
        }, 10);
    }

    function updateTool() {
        selectedTool.name = ui.toolName.value;
        selectedTool.number = parseInt(ui.toolNum.value);
        selectedTool.flute_diam = parseFloat(ui.toolFluteDiam.value);
        selectedTool.flute_len = parseFloat(ui.toolFluteLen.value);
        selectedTool.shaft_diam = parseFloat(ui.toolShaftDiam.value);
        selectedTool.shaft_len = parseFloat(ui.toolShaftLen.value);
        // selectedTool.taper_angle = parseFloat(ui.toolTaperAngle.value);
        selectedTool.taper_tip = parseFloat(ui.toolTaperTip.value);
        selectedTool.metric = ui.toolMetric.checked;
        selectedTool.type = ['endmill','ballmill','tapermill'][ui.toolType.selectedIndex];
        renderTools();
        ui.toolSelect.selectedIndex = selectedTool.order;
        setToolChanged(true);
        renderTool(selectedTool);
    }

    function setToolChanged(changed) {
        editTools.changed = changed;
        ui.toolsSave.disabled = !changed;
    }

    function showTools() {
        if (api.mode.get_id() !== MODES.CAM) return;

        let selectedIndex = null;

        editTools = settings().tools.slice().sort((a,b) => {
            return a.name > b.name ? 1 : -1;
        });

        setToolChanged(false);

        ui.toolsClose.onclick = function() {
            if (editTools.changed && !confirm("abandon changes?")) return;
            api.dialog.hide();
        };
        ui.toolAdd.onclick = function() {
            editTools.push({
                id: Date.now(),
                number: maxTool + 1,
                name: "new",
                type: "endmill",
                shaft_diam: 0.25,
                shaft_len: 1,
                flute_diam: 0.25,
                flute_len: 2,
                // taper_angle: 70,
                taper_tip: 0,
                metric: false
            });
            setToolChanged(true);
            renderTools();
            ui.toolSelect.selectedIndex = editTools.length-1;
            selectTool(editTools[editTools.length-1]);
        };
        ui.toolDelete.onclick = function() {
            editTools.remove(selectedTool);
            setToolChanged(true);
            renderTools();
        };
        ui.toolsSave.onclick = function() {
            if (selectedTool) updateTool();
            settings().tools = editTools.sort((a,b) => {
                return a.name < b.name ? -1 : 1;
            });
            setToolChanged(false);
            api.conf.save();
            api.conf.update_fields();
            api.event.settings();
        };

        renderTools();
        if (editTools.length > 0) {
            selectTool(editTools[0]);
            ui.toolSelect.selectedIndex = 0;
        } else {
            ui.toolAdd.onclick();
        }

        api.dialog.show('tools');
        ui.toolSelect.focus();
    }

    function updateDeviceList() {
        renderDevices(Object.keys(devices[api.mode.get_lower()]).sort());
    }

    function showDevices() {
        // disable device filter and show devices
        ui.dev.header.onclick(true);
        api.modal.show('setup');
        ui.deviceList.focus();
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
        } else {
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
                let newname = prompt(`rename file`, short);
                if (newname && newname !== short) {
                    catalog.rename(name, `${newname}${ext}`, then => {
                        catalog.refresh();
                    });
                }
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
        return ui.deviceBelt.checked;
    }

    function isNotBelt() {
        return !isBelt();
    }

    function isDanger() {
        return ui.danger.checked;
    }

    // MAIN INITIALIZATION FUNCTION

    function init_one() {
        let { event, conf, view, show } = api;

        event.emit('init.one');

        // ensure we have settings from last session
        conf.restore();

        let container = $('container'),
            welcome = $('welcome'),
            gcode = $('dev-gcode'),
            tracker = $('tracker'),
            controller = settings().controller;

        uc.setHoverPop(false);

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

        // api augmentation with local functions
        api.device.export = deviceExport;

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
                help:           $('acct-help'),
                export:         $('acct-export')
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

            options: {
                area:           $('lt-options'),
                trash:          $('lt-trash'),
                enable:         $('lt-w-enable'),
                disable:        $('lt-w-disable'),
            },

            back:               $('lt-back'),
            ltsetup:            $('lt-setup'),
            ltfile:             $('lt-file'),
            ltview:             $('lt-view'),
            ltact:              $('act-slice'),
            edit:               $('lt-tools'),
            nozzle:             $('lt-nozzle'),
            render:             $('lt-render'),

            modal:              $('modal'),
            modalBox:           $('modal-box'),
            help:               $('mod-help'),
            setup:              $('mod-setup'),
            prefs:              $('mod-prefs'),
            files:              $('mod-files'),
            saves:              $('mod-saves'),
            tools:              $('mod-tools'),
            print:              $('mod-print'),
            local:              $('mod-local'),
            any:                $('mod-any'),

            catalogBody:        $('catalogBody'),
            catalogList:        $('catalogList'),

            devices:            $('devices'),
            deviceList:         $('device-list'),
            deviceMy:           $('device-my'),
            deviceAdd:          $('device-add'),
            deviceDelete:       $('device-del'),
            deviceExport:       $('device-exp'),
            deviceSave:         $('device-save'),

            toolsSave:          $('tools-save'),
            toolsClose:         $('tools-close'),
            toolSelect:         $('tool-select'),
            toolAdd:            $('tool-add'),
            toolDelete:         $('tool-del'),
            toolType:           $('tool-type'),
            toolName:           $('tool-name'),
            toolNum:            $('tool-num'),
            toolFluteDiam:      $('tool-fdiam'),
            toolFluteLen:       $('tool-flen'),
            toolShaftDiam:      $('tool-sdiam'),
            toolShaftLen:       $('tool-slen'),
            // toolTaperAngle: $('tool-tangle'),
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

            device:           uc.newGroup(LANG.dv_gr_dev, $('device1'), {group:"ddev", inline:true, class:"noshow"}),
            deviceName:       uc.newInput(LANG.dv_name_s, {title:LANG.dv_name_l, size:"65%", text:true, action:updateDeviceName}),
            bedWidth:         uc.newInput(LANG.dv_bedw_s, {title:LANG.dv_bedw_l, convert:uc.toFloat, size:6, units:true, round:2, action:updateDeviceSize}),
            bedDepth:         uc.newInput(LANG.dv_bedd_s, {title:LANG.dv_bedd_l, convert:uc.toFloat, size:6, units:true, round:2, action:updateDeviceSize}),
            maxHeight:        uc.newInput(LANG.dv_bedh_s, {title:LANG.dv_bedh_l, convert:uc.toFloat, size:6, modes:FDM_SLA, action:updateDeviceSize}),
            resolutionX:      uc.newInput(LANG.dv_rezx_s, {title:LANG.dv_rezx_l, convert:uc.toInt, size:6, modes:SLA}),
            resolutionY:      uc.newInput(LANG.dv_rezy_s, {title:LANG.dv_rezy_l, convert:uc.toInt, size:6, modes:SLA}),
            spindleMax:       uc.newInput(LANG.dv_spmx_s, {title:LANG.dv_spmx_l, convert:uc.toInt, size: 6, modes:CAM}),
            deviceZMax:       uc.newInput(LANG.dv_zmax_s, {title:LANG.dv_zmax_l, convert:uc.toInt, size: 6, modes:FDM}),
            fdmSep:           uc.newBlank({class:"pop-sep", modes:FDM}),
            filamentSource:   uc.newSelect(LANG.dv_fsrc_s, {title: LANG.dv_fsrc_l, action: filamentSourceSave, modes:FDM}, "filasrc"),
            fwRetract:        uc.newBoolean(LANG.dv_retr_s, onBooleanClick, {title:LANG.dv_retr_l, modes:FDM}),
            deviceOrigin:     uc.newBoolean(LANG.dv_orgc_s, onBooleanClick, {title:LANG.dv_orgc_l, modes:FDM_LZR, show:() => !ui.deviceRound.checked}),
            deviceRound:      uc.newBoolean(LANG.dv_bedc_s, onBooleanClick, {title:LANG.dv_bedc_l, modes:FDM, trigger:true, show:isNotBelt}),
            deviceBelt:       uc.newBoolean(LANG.dv_belt_s, onBooleanClick, {title:LANG.dv_belt_l, modes:FDM, trigger:true, show:() => !ui.deviceRound.checked}),

            extruder:         uc.newGroup(LANG.dv_gr_ext, $('device2'), {group:"dext", inline:true, modes:FDM}),
            extFilament:      uc.newInput(LANG.dv_fila_s, {title:LANG.dv_fila_l, convert:uc.toFloat, modes:FDM}),
            extNozzle:        uc.newInput(LANG.dv_nozl_s, {title:LANG.dv_nozl_l, convert:uc.toFloat, modes:FDM}),
            extOffsetX:       uc.newInput(LANG.dv_exox_s, {title:LANG.dv_exox_l, convert:uc.toFloat, modes:FDM}),
            extOffsetY:       uc.newInput(LANG.dv_exoy_s, {title:LANG.dv_exoy_l, convert:uc.toFloat, modes:FDM}),
            extSelect:        uc.newText(LANG.dv_exts_s, {title:LANG.dv_exts_l, modes:FDM, size:14, height:3, modes:FDM, area:gcode}),
            extDeselect:      uc.newText(LANG.dv_dext_s, {title:LANG.dv_dext_l, modes:FDM, size:14, height:3, modes:FDM, area:gcode}),
            extPad:           uc.newBlank({class:"grow", modes:FDM}),
            extActions:       uc.newRow([
                ui.extPrev = uc.newButton(undefined, undefined, {icon:'<i class="fas fa-less-than"></i>'}),
                ui.extAdd = uc.newButton(undefined, undefined, {icon:'<i class="fas fa-plus"></i>'}),
                ui.extDel = uc.newButton(undefined, undefined, {icon:'<i class="fas fa-minus"></i>'}),
                ui.extNext = uc.newButton(undefined, undefined, {icon:'<i class="fas fa-greater-than"></i>'})
            ], {modes:FDM, class:"dev-buttons ext-buttons"}),

            palette:          uc.newGroup(LANG.dv_gr_pal, $('palette3'), {group:"dext2", inline:true, modes:FDM}),
            paletteId:        uc.newInput(LANG.dv_paid_s, {title:LANG.dv_paid_l, modes:FDM, size:15, text:true}),
            palettePing:      uc.newInput(LANG.dv_paps_s, {title:LANG.dv_paps_l, modes:FDM, convert:uc.toInt}),
            paletteFeed:      uc.newInput(LANG.dv_pafe_s, {title:LANG.dv_pafe_l, modes:FDM, convert:uc.toInt}),
            palettePush:      uc.newInput(LANG.dv_papl_s, {title:LANG.dv_papl_l, modes:FDM, convert:uc.toInt}),
            paletteOffset:    uc.newInput(LANG.dv_paof_s, {title:LANG.dv_paof_l, modes:FDM, convert:uc.toInt}),
            paletteSep:       uc.newBlank({class:"pop-sep", modes:FDM}),
            paletteHeat:      uc.newInput(LANG.dv_pahe_s, {title:LANG.dv_pahe_l, modes:FDM, convert:uc.toInt}),
            paletteCool:      uc.newInput(LANG.dv_paco_s, {title:LANG.dv_paco_l, modes:FDM, convert:uc.toInt}),
            palettePress:     uc.newInput(LANG.dv_pacm_s, {title:LANG.dv_pacm_l, modes:FDM, convert:uc.toInt}),

            gcode:            uc.newGroup(LANG.dv_gr_out, $('device2'), {group:"dgco", inline:true, modes:CAM_LZR}),
            gcodeSpace:       uc.newBoolean(LANG.dv_tksp_s, onBooleanClick, {title:LANG.dv_tksp_l, modes:CAM_LZR}),
            gcodeStrip:       uc.newBoolean(LANG.dv_strc_s, onBooleanClick, {title:LANG.dv_strc_l, modes:CAM}),
            gcodeFExt:        uc.newInput(LANG.dv_fext_s, {title:LANG.dv_fext_l, modes:CAM_LZR, size:7, text:true}),

            gcodeEd:          uc.newGroup(LANG.dv_gr_gco, $('dg'), {group:"dgcp", inline:true, modes:GCODE}),
            gcodeMacros:      uc.newRow([
                (ui.gcodePre = uc.newGCode(LANG.dv_head_s, {title:LANG.dv_head_l, modes:GCODE, area:gcode})).button,
                (ui.gcodePost = uc.newGCode(LANG.dv_foot_s, {title:LANG.dv_foot_l, modes:GCODE, area:gcode})).button,
                (ui.gcodeLayer = uc.newGCode(LANG.dv_layr_s, {title:LANG.dv_layr_l, modes:FDM, area:gcode})).button,
                (ui.gcodeTrack = uc.newGCode(LANG.dv_prog_s, {title:LANG.dv_prog_l, modes:FDM, area:gcode})).button,
                (ui.gcodeFan = uc.newGCode(LANG.dv_fanp_s, {title:LANG.dv_fanp_l, modes:FDM, area:gcode})).button,
                (ui.gcodeLaserOn = uc.newGCode(LANG.dv_lzon_s, {title:LANG.dv_lzon_l, modes:LASER, area:gcode})).button,
                (ui.gcodeLaserOff = uc.newGCode(LANG.dv_lzof_s, {title:LANG.dv_lzof_l, modes:LASER, area:gcode})).button,
                (ui.gcodeChange = uc.newGCode(LANG.dv_tool_s, {title:LANG.dv_tool_l, modes:CAM, area:gcode})).button,
                (ui.gcodeDwell = uc.newGCode(LANG.dv_dwll_s, {title:LANG.dv_dwll_l, modes:CAM, area:gcode})).button,
                (ui.gcodeSpindle = uc.newGCode(LANG.dv_sspd_s, {title:LANG.dv_sspd_l, modes:CAM, area:gcode})).button
            ], {class:"ext-buttons f-row gcode-macros"}),

            lprefs:           uc.newGroup(LANG.op_menu, $('prefs-gen1'), {inline: true}),
            antiAlias:        uc.newBoolean(LANG.op_anta_s, booleanSave, {title:LANG.op_anta_l}),
            reverseZoom:      uc.newBoolean(LANG.op_invr_s, booleanSave, {title:LANG.op_invr_l}),
            ortho:            uc.newBoolean(LANG.op_orth_s, booleanSave, {title:LANG.op_orth_l}),
            dark:             uc.newBoolean(LANG.op_dark_s, booleanSave, {title:LANG.op_dark_l}),
            devel:            uc.newBoolean(LANG.op_devl_s, booleanSave, {title:LANG.op_devl_l}),
            danger:           uc.newBoolean(LANG.op_dang_s, booleanSave, {title:LANG.op_dang_l}),

            lprefs:           uc.newGroup(LANG.op_disp, $('prefs-gen2'), {inline: true}),
            showOrigin:       uc.newBoolean(LANG.op_shor_s, booleanSave, {title:LANG.op_shor_l}),
            showRulers:       uc.newBoolean(LANG.op_shru_s, booleanSave, {title:LANG.op_shru_l}),
            showSpeeds:       uc.newBoolean(LANG.op_sped_s, speedSave, {title:LANG.op_sped_l}),
            decals:           uc.newBoolean(LANG.op_decl_s, booleanSave, {title:LANG.op_decl_s}),
            lineType:         uc.newSelect(LANG.op_line_s, {title: LANG.op_line_l, action: lineTypeSave, modes:FDM}, "linetype"),
            animesh:          uc.newSelect(LANG.op_anim_s, {title: LANG.op_anim_l, action: aniMeshSave, modes:CAM}, "animesh"),
            units:            uc.newSelect(LANG.op_unit_s, {title: LANG.op_unit_l, action: unitsSave, modes:CAM, trace:true}, "units"),

            layout:           uc.newGroup(LANG.lo_menu, $('prefs-lay'), {inline: true}),
            autoSave:         uc.newBoolean(LANG.op_save_s, booleanSave, {title:LANG.op_save_l}),
            autoLayout:       uc.newBoolean(LANG.op_auto_s, booleanSave, {title:LANG.op_auto_l}),
            freeLayout:       uc.newBoolean(LANG.op_free_s, booleanSave, {title:LANG.op_free_l}),
            spaceRandoX:      uc.newBoolean(LANG.op_spcx_s, booleanSave, {title:LANG.op_spcx_l, show:isBelt}),
            spaceLayout:      uc.newInput(LANG.op_spcr_s, {title:LANG.op_spcr_l, convert:uc.toFloat, size:3, units:true}),

            export:           uc.newGroup(LANG.xp_menu, $('prefs-xpo'), {inline: true}),
            exportLocal:      uc.newBoolean(`Grid:Local`, booleanSave, {title:LANG.op_exgl_l}),
            exportGhost:      uc.newBoolean(`Grid:Host`, booleanSave, {title:LANG.op_exgh_l}),
            exportOcto:       uc.newBoolean(`OctoPrint`, booleanSave, {title:LANG.op_exop_l}),
            exportThumb:      uc.newBoolean(`Thumbnail`, booleanSave, {modes:FDM}),
            exportPreview:    uc.newBoolean(`Code Preview`, booleanSave),

            parts:            uc.newGroup(LANG.pt_menu, $('prefs-prt'), {inline: true}),
            detail:           uc.newSelect(LANG.pt_qual_s, {title: LANG.pt_qual_l, action: detailSave}, "detail"),
            decimate:         uc.newBoolean(LANG.pt_deci_s, booleanSave, {title: LANG.pt_deci_l}),
            healMesh:         uc.newBoolean(LANG.pt_heal_s, booleanSave, {title: LANG.pt_heal_l}),
            threaded:         uc.newBoolean(LANG.pt_thrd_s, booleanSave, {title: LANG.pt_thrd_l, modes:FDM_SLA}),
            assembly:         uc.newBoolean(LANG.pt_assy_s, booleanSave, {title: LANG.pt_assy_l, modes:FDM_SLA}),

            prefadd:          uc.checkpoint($('prefs-add')),

            process:             uc.newGroup(LANG.sl_menu, $('settings'), {modes:FDM_LZR, class:"xdown"}),
            sliceHeight:         uc.newInput(LANG.sl_lahi_s, {title:LANG.sl_lahi_l, convert:uc.toFloat, modes:FDM}),
            sliceMinHeight:      uc.newInput(LANG.ad_minl_s, {title:LANG.ad_minl_l, bound:uc.bound(0,3.0), convert:uc.toFloat, modes:FDM, show: () => ui.sliceAdaptive.checked}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceShells:         uc.newInput(LANG.sl_shel_s, {title:LANG.sl_shel_l, convert:uc.toFloat, modes:FDM}),
            sliceLineWidth:      uc.newInput(LANG.sl_line_s, {title:LANG.sl_line_l, convert:uc.toFloat, bound:uc.bound(0,5), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceTopLayers:      uc.newInput(LANG.sl_ltop_s, {title:LANG.sl_ltop_l, convert:uc.toInt, modes:FDM}),
            sliceSolidLayers:    uc.newInput(LANG.sl_lsld_s, {title:LANG.sl_lsld_l, convert:uc.toInt, modes:FDM}),
            sliceBottomLayers:   uc.newInput(LANG.sl_lbot_s, {title:LANG.sl_lbot_l, convert:uc.toInt, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceDetectThin:     uc.newSelect(LANG.ad_thin_s, {title: LANG.ad_thin_l, action: thinWallSave, modes:FDM}, "thin"),
            sliceAdaptive:       uc.newBoolean(LANG.ad_adap_s, onBooleanClick, {title: LANG.ad_adap_l, modes:FDM, trigger: true}),

            laserOffset:         uc.newInput(LANG.ls_offs_s, {title:LANG.ls_offs_l, convert:uc.toFloat, modes:LASER}),
            laserSliceHeight:    uc.newInput(LANG.ls_lahi_s, {title:LANG.ls_lahi_l, convert:uc.toFloat, modes:LASER, trigger: true}),
            laserSliceHeightMin: uc.newInput(LANG.ls_lahm_s, {title:LANG.ls_lahm_l, convert:uc.toFloat, modes:LASER, show:() => { return ui.laserSliceHeight.value == 0 }}),
            laserSep:            uc.newBlank({class:"pop-sep", modes:LASER}),
            laserSliceSingle:    uc.newBoolean(LANG.ls_sngl_s, onBooleanClick, {title:LANG.ls_sngl_l, modes:LASER}),

            firstLayer:          uc.newGroup(LANG.fl_menu, null, {modes:FDM, class:"xdown"}),
            firstSliceHeight:    uc.newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:uc.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerNozzleTemp:uc.newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:uc.toInt, modes:FDM, show:isNotBelt}),
            firstLayerBedTemp:   uc.newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:uc.toInt, modes:FDM, show:isNotBelt}),
            firstLayerFanSpeed:  uc.newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:uc.toInt, bound:uc.bound(0,255), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerYOffset:   uc.newInput(LANG.fl_zoff_s, {title:LANG.fl_zoff_l, convert:uc.toFloat, modes:FDM, show:isBelt}),
            firstLayerFlatten:   uc.newInput(LANG.fl_flat_s, {title:LANG.fl_flat_l, convert:uc.toFloat, modes:FDM, show:isBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerRate:      uc.newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:uc.toFloat, modes:FDM}),
            firstLayerFillRate:  uc.newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:uc.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerLineMult:  uc.newInput(LANG.fl_sfac_s, {title:LANG.fl_sfac_l, convert:uc.toFloat, bound:uc.bound(0.5,2), modes:FDM, show:isNotBelt}),
            firstLayerPrintMult: uc.newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:uc.toFloat, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerBrim:      uc.newInput(LANG.fl_brim_s, {title:LANG.fl_brim_l, convert:uc.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimIn:    uc.newInput(LANG.fl_brin_s, {title:LANG.fl_brin_l, convert:uc.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimTrig:  uc.newInput(LANG.fl_brmn_s, {title:LANG.fl_brmn_l, convert:uc.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimGap:   uc.newInput(LANG.fl_brgp_s, {title:LANG.fl_brgp_l, convert:uc.toFloat, modes:FDM, show:isBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerBeltLead:  uc.newInput(LANG.fl_bled_s, {title:LANG.fl_bled_l, convert:uc.toFloat, modes:FDM, show:isBelt}),
            firstLayerBeltBump:  uc.newInput(LANG.fl_blmp_s, {title:LANG.fl_blmp_l, convert:uc.toFloat, bound:uc.bound(0, 10), modes:FDM, show:isBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            outputBrimCount:     uc.newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:uc.toInt, modes:FDM, show:isNotBelt}),
            outputBrimOffset:    uc.newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:uc.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            outputRaftSpacing:   uc.newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:uc.toFloat, bound:uc.bound(0.0,3.0), modes:FDM, show: () => ui.outputRaft.checked && isNotBelt() }),
            outputRaft:          uc.newBoolean(LANG.fr_nabl_s, onBooleanClick, {title:LANG.fr_nabl_l, modes:FDM, trigger: true, show:() => isNotBelt()}),
            outputDraftShield:   uc.newBoolean(LANG.fr_draf_s, onBooleanClick, {title:LANG.fr_draf_l, modes:FDM, trigger: true, show:() => isNotBelt()}),

            fdmInfill:           uc.newGroup(LANG.fi_menu, $('settings'), {modes:FDM}),
            sliceFillType:       uc.newSelect(LANG.fi_type, {modes:FDM, trigger:true}, "infill"),
            sliceFillSparse:     uc.newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:uc.toFloat, bound:uc.bound(0.0,1.0), modes:FDM}),
            sliceFillRepeat:     uc.newInput(LANG.fi_rept_s, {title:LANG.fi_rept_l, convert:uc.toInt, bound:uc.bound(1,10), show:fillShow, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceFillOverlap:    uc.newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:uc.toFloat, bound:uc.bound(0.0,2.0), modes:FDM}),
            sliceFillRate:       uc.newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:uc.toInt, bound:uc.bound(0,500), modes:FDM}),
            sliceSolidRate:      uc.newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:uc.toInt, bound:uc.bound(0,500), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceFillGrow:       uc.newInput(LANG.fi_grow_s, {title:LANG.fi_grow_l, convert:uc.toFloat, modes:FDM}),
            sliceFillAngle:      uc.newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:uc.toFloat, modes:FDM}),

            fdmSupport:          uc.newGroup(LANG.sp_menu, null, {modes:FDM, marker:false}),
            sliceSupportNozzle:  uc.newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, modes:FDM}, "extruders"),
            sliceSupportDensity: uc.newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:uc.toFloat, bound:uc.bound(0.0,1.0), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportSize:    uc.newInput(LANG.sp_size_s, {title:LANG.sp_size_l, bound:uc.bound(1.0,200.0), convert:uc.toFloat, modes:FDM}),
            sliceSupportOffset:  uc.newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, bound:uc.bound(0.0,200.0), convert:uc.toFloat, modes:FDM}),
            sliceSupportGap:     uc.newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, bound:uc.bound(0,5), convert:uc.toInt, modes:FDM, show:isNotBelt}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportArea:    uc.newInput(LANG.sp_area_s, {title:LANG.sp_area_l, bound:uc.bound(0.0,200.0), convert:uc.toFloat, modes:FDM}),
            sliceSupportExtra:   uc.newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, bound:uc.bound(0.0,200.0), convert:uc.toFloat, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportAngle:   uc.newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, bound:uc.bound(0.0,90.0), convert:uc.toFloat, modes:FDM, show:() => !ui.sliceSupportEnable.checked}),
            sliceSupportSpan:    uc.newInput(LANG.sp_span_s, {title:LANG.sp_span_l, bound:uc.bound(0.0,200.0), convert:uc.toFloat, modes:FDM, show:() => ui.sliceSupportEnable.checked}),
            sliceSupportEnable:  uc.newBoolean(LANG.sp_auto_s, onBooleanClick, {title:LANG.sp_auto_l, modes:FDM, show:isNotBelt}),
            sliceSupportOutline: uc.newBoolean(LANG.sp_outl_s, onBooleanClick, {title:LANG.sp_outl_l, modes:FDM, show:() => !ui.sliceSupportEnable.checked}),

            sliceSupportGen:     uc.newRow([
                ui.ssaGen = uc.newButton(LANG.sp_detect, onButtonClick, {class: "f-col grow a-center"})
            ], { modes: FDM, class: "ext-buttons f-row grow" }),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            sliceSupportManual: uc.newRow([
                (ui.ssmAdd = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (ui.ssmDun = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (ui.ssmClr = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {modes:FDM, class:"ext-buttons f-row"}),

            camTabs:             uc.newGroup(LANG.ct_menu, null, {modes:CAM, marker:true}),
            camTabsWidth:        uc.newInput(LANG.ct_wdth_s, {title:LANG.ct_wdth_l, convert:uc.toFloat, bound:uc.bound(0.005,100), modes:CAM, units:true}),
            camTabsHeight:       uc.newInput(LANG.ct_hght_s, {title:LANG.ct_hght_l, convert:uc.toFloat, bound:uc.bound(0.005,100), modes:CAM, units:true}),
            camTabsDepth:        uc.newInput(LANG.ct_dpth_s, {title:LANG.ct_dpth_l, convert:uc.toFloat, bound:uc.bound(0.005,100), modes:CAM, units:true}),
            camTabsMidline:      uc.newBoolean(LANG.ct_midl_s, onBooleanClick, {title:LANG.ct_midl_l, modes:CAM}),
            camSep:              uc.newBlank({class:"pop-sep"}),
            camTabsManual: uc.newRow([
                (ui.tabAdd = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (ui.tabDun = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (ui.tabClr = uc.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {modes:CAM, class:"ext-buttons f-row"}),

            camStock:            uc.newGroup(LANG.cs_menu, null, {modes:CAM, marker: true}),
            camStockX:           uc.newInput(LANG.cs_wdth_s, {title:LANG.cs_wdth_l, convert:uc.toFloat, bound:uc.bound(0,9999), modes:CAM, units:true}),
            camStockY:           uc.newInput(LANG.cs_dpth_s, {title:LANG.cs_dpth_l, convert:uc.toFloat, bound:uc.bound(0,9999), modes:CAM, units:true}),
            camStockZ:           uc.newInput(LANG.cs_hght_s, {title:LANG.cs_hght_l, convert:uc.toFloat, bound:uc.bound(0,9999), modes:CAM, units:true}),
            camStockOffset:      uc.newBoolean(LANG.cs_offs_s, onBooleanClick, {title:LANG.cs_offs_l, modes:CAM}),
            camStockClipTo:      uc.newBoolean(LANG.cs_clip_s, onBooleanClick, {title:LANG.cs_clip_l, modes:CAM}),
            camSep:              uc.newBlank({class:"pop-sep"}),
            camStockOn:          uc.newBoolean(LANG.cs_offe_s, onBooleanClick, {title:LANG.cs_offe_l, modes:CAM}),

            camCommon:           uc.newGroup(LANG.cc_menu, null, {modes:CAM}),
            camZAnchor:          uc.newSelect(LANG.ou_zanc_s, {title: LANG.ou_zanc_l, action:zAnchorSave, modes:CAM, trace:true}, "zanchor"),
            camZOffset:          uc.newInput(LANG.ou_ztof_s, {title:LANG.ou_ztof_l, convert:uc.toFloat, modes:CAM, units:true}),
            camZBottom:          uc.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:uc.toFloat, modes:CAM, units:true, trigger: true}),
            camZThru:            uc.newInput(LANG.ou_ztru_s, {title:LANG.ou_ztru_l, convert:uc.toFloat, bound:uc.bound(0.0,100), modes:CAM, units:true, show:() => { return ui.camZBottom.value == 0 }}),
            camSep:              uc.newBlank({class:"pop-sep"}),
            camZClearance:       uc.newInput(LANG.ou_zclr_s, {title:LANG.ou_zclr_l, convert:uc.toFloat, bound:uc.bound(0.01,100), modes:CAM, units:true}),
            camSep:              uc.newBlank({class:"pop-sep"}),
            camFastFeedZ:        uc.newInput(LANG.cc_rzpd_s, {title:LANG.cc_rzpd_l, convert:uc.toFloat, modes:CAM, units:true}),
            camFastFeed:         uc.newInput(LANG.cc_rapd_s, {title:LANG.cc_rapd_l, convert:uc.toFloat, modes:CAM, units:true}),

            laserLayout:         uc.newGroup(LANG.lo_menu, null, {modes:LASER, group:"lz-lo"}),
            outputTileSpacing:   uc.newInput(LANG.ou_spac_s, {title:LANG.ou_spac_l, convert:uc.toInt, modes:LASER}),
            outputLaserMerged:   uc.newBoolean(LANG.ou_mrgd_s, onBooleanClick, {title:LANG.ou_mrgd_l, modes:LASER}),
            outputLaserGroup:    uc.newBoolean(LANG.ou_grpd_s, onBooleanClick, {title:LANG.ou_grpd_l, modes:LASER}),

            knife:               uc.newGroup(LANG.dk_menu, null, {modes:LASER, marker:true}),
            outputKnifeDepth:    uc.newInput(LANG.dk_dpth_s, {title:LANG.dk_dpth_l, convert:uc.toFloat, bound:uc.bound(0.0,5.0), modes:LASER}),
            outputKnifePasses:   uc.newInput(LANG.dk_pass_s, {title:LANG.dk_pass_l, convert:uc.toInt, bound:uc.bound(0,5), modes:LASER}),
            outputKnifeTip:      uc.newInput(LANG.dk_offs_s, {title:LANG.dk_offs_l, convert:uc.toFloat, bound:uc.bound(0.0,10.0), modes:LASER}),
            knifeSep:            uc.newBlank({class:"pop-sep", modes:LASER}),
            knifeOn:             uc.newBoolean(LANG.enable, onBooleanClick, {title:LANG.ou_drkn_l, modes:LASER}),

            output:              uc.newGroup(LANG.ou_menu, null, {modes:GCODE}),
            outputLaserPower:    uc.newInput(LANG.ou_powr_s, {title:LANG.ou_powr_l, convert:uc.toInt, bound:uc.bound(1,100), modes:LASER}),
            outputLaserSpeed:    uc.newInput(LANG.ou_sped_s, {title:LANG.ou_sped_l, convert:uc.toInt, modes:LASER}),
            laserSep:            uc.newBlank({class:"pop-sep", modes:LASER}),
            outputLaserZColor:   uc.newBoolean(LANG.ou_layo_s, onBooleanClick, {title:LANG.ou_layo_l, modes:LASER, show:() => { return ui.outputLaserMerged.checked === false }}),
            outputLaserLayer:    uc.newBoolean(LANG.ou_layr_s, onBooleanClick, {title:LANG.ou_layr_l, modes:LASER}),
            outputLaserStack:    uc.newBoolean(LANG.ou_lays_s, onBooleanClick, {title:LANG.ou_lays_l, modes:LASER}),
            laserSep:            uc.newBlank({class:"pop-sep", modes:LASER}),

            outputTemp:          uc.newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:uc.toInt, modes:FDM}),
            outputBedTemp:       uc.newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:uc.toInt, modes:FDM}),
            outputFanSpeed:      uc.newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:uc.toInt, bound:uc.bound(0,255), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            outputFeedrate:      uc.newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:uc.toInt, modes:FDM}),
            outputFinishrate:    uc.newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:uc.toInt, modes:FDM}),
            outputSeekrate:      uc.newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:uc.toInt, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            outputShellMult:     uc.newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:uc.toFloat, bound:uc.bound(0.0,2.0), modes:FDM}),
            outputFillMult:      uc.newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:uc.toFloat, bound:uc.bound(0.0,2.0), modes:FDM}),
            outputSparseMult:    uc.newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:uc.toFloat, bound:uc.bound(0.0,2.0), modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceShellOrder:     uc.newSelect(LANG.sl_ordr_s, {title:LANG.sl_ordr_l, modes:FDM}, "shell"),
            sliceLayerStart:     uc.newSelect(LANG.sl_strt_s, {title:LANG.sl_strt_l, modes:FDM}, "start"),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            outputLayerRetract:  uc.newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l, modes:FDM}),
            outputAvoidGaps:     uc.newBoolean(LANG.ad_agap_s, onBooleanClick, {title:LANG.ad_agap_l, modes:FDM}),
            outputBeltFirst:     uc.newBoolean(LANG.ad_lbir_s, onBooleanClick, {title:LANG.ad_lbir_l, show: isBelt, modes:FDM}),
            camConventional:     uc.newBoolean(LANG.ou_conv_s, onBooleanClick, {title:LANG.ou_conv_l, modes:CAM}),
            camEaseDown:         uc.newBoolean(LANG.cr_ease_s, onBooleanClick, {title:LANG.cr_ease_l, modes:CAM}),
            camDepthFirst:       uc.newBoolean(LANG.ou_depf_s, onBooleanClick, {title:LANG.ou_depf_l, modes:CAM}),
            outputOriginBounds:  uc.newBoolean(LANG.or_bnds_s, onBooleanClick, {title:LANG.or_bnds_l, modes:LASER}),
            outputOriginCenter:  uc.newBoolean(LANG.or_cntr_s, onBooleanClick, {title:LANG.or_cntr_l, modes:CAM_LZR}),
            camOriginTop:        uc.newBoolean(LANG.or_topp_s, onBooleanClick, {title:LANG.or_topp_l, modes:CAM}),

            camExpert:           uc.newGroup(LANG.op_xprt_s, null, {group: "cam_expert", modes:CAM, marker: false}),
            camExpertFast:       uc.newBoolean(LANG.cx_fast_s, onBooleanClick, {title:LANG.cx_fast_l, modes:CAM, show: () => !ui.camTrueShadow.checked }),
            camTrueShadow:       uc.newBoolean(LANG.cx_true_s, onBooleanClick, {title:LANG.cx_true_l, modes:CAM, show: () => !ui.camExpertFast.checked }),

            advanced:            uc.newGroup(LANG.ad_menu, null, {modes:FDM, class:"fdmadv"}),
            outputRetractDist:   uc.newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:uc.toFloat, modes:FDM}),
            outputRetractSpeed:  uc.newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:uc.toInt, modes:FDM}),
            outputRetractWipe:   uc.newInput(LANG.ad_wpln_s, {title:LANG.ad_wpln_l, bound:uc.bound(0.0,10), convert:uc.toFloat, modes:FDM}),
            outputRetractDwell:  uc.newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:uc.toInt, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            sliceSolidMinArea:   uc.newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:uc.toFloat, modes:FDM}),
            outputMinSpeed:      uc.newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, bound:uc.bound(1,200), convert:uc.toFloat, modes:FDM}),
            outputShortPoly:     uc.newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, bound:uc.bound(0,10000), convert:uc.toFloat, modes:FDM}),
            outputCoastDist:     uc.newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, bound:uc.bound(0.0,10), convert:uc.toFloat, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            zHopDistance:        uc.newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, bound:uc.bound(0,3.0), convert:uc.toFloat, modes:FDM}),
            arcTolerance:        uc.newInput(LANG.ad_arct_s, {title:LANG.ad_arct_l, bound:uc.bound(0,1.0), convert:uc.toFloat, modes:FDM, show:() => { return isDanger() && isNotBelt() }}),
            antiBacklash:        uc.newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, bound:uc.bound(0,3), convert:uc.toInt, modes:FDM}),
            fdmSep:              uc.newBlank({class:"pop-sep", modes:FDM}),
            outputLoops:         uc.newInput(LANG.ag_loop_s, {title:LANG.ag_loop_l, convert:uc.toInt, bound:uc.bound(0,1000), modes:FDM, show:isBelt}),
            outputPurgeTower:    uc.newInput(LANG.ad_purg_s, {title:LANG.ad_purg_l, convert:uc.toInt, bound:uc.bound(0,1000), modes:FDM}),

            // SLA
            slaProc:             uc.newGroup(LANG.sa_menu, null, {modes:SLA, group:"sla-slice"}),
            slaSlice:            uc.newInput(LANG.sa_lahe_s, {title:LANG.sa_lahe_l, convert:uc.toFloat, modes:SLA}),
            slaShell:            uc.newInput(LANG.sa_shel_s, {title:LANG.sa_shel_l, convert:uc.toFloat, modes:SLA}),
            slaOpenTop:          uc.newBoolean(LANG.sa_otop_s, onBooleanClick, {title:LANG.sa_otop_l, modes:SLA}),
            slaOpenBase:         uc.newBoolean(LANG.sa_obas_s, onBooleanClick, {title:LANG.sa_obas_l, modes:SLA}),

            // SLA
            slaOutput:           uc.newGroup(LANG.sa_layr_m, null, {modes:SLA, group:"sla-layers"}),
            slaLayerOn:          uc.newInput(LANG.sa_lton_s, {title:LANG.sa_lton_l, convert:uc.toFloat, modes:SLA}),
            slaLayerOff:         uc.newInput(LANG.sa_ltof_s, {title:LANG.sa_ltof_l, convert:uc.toFloat, modes:SLA}),
            slaPeelDist:         uc.newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:uc.toFloat, modes:SLA}),
            slaPeelLiftRate:     uc.newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:uc.toFloat, modes:SLA}),
            slaPeelDropRate:     uc.newInput(LANG.sa_pldr_s, {title:LANG.sa_pldr_l, convert:uc.toFloat, modes:SLA}),

            slaOutput:           uc.newGroup(LANG.sa_base_m, null, {modes:SLA, group:"sla-base"}),
            slaBaseLayers:       uc.newInput(LANG.sa_balc_s, {title:LANG.sa_balc_l, convert:uc.toInt, modes:SLA}),
            slaBaseOn:           uc.newInput(LANG.sa_lton_s, {title:LANG.sa_bltn_l, convert:uc.toFloat, modes:SLA}),
            slaBaseOff:          uc.newInput(LANG.sa_ltof_s, {title:LANG.sa_bltf_l, convert:uc.toFloat, modes:SLA}),
            slaBasePeelDist:     uc.newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:uc.toFloat, modes:SLA}),
            slaBasePeelLiftRate: uc.newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:uc.toFloat, modes:SLA}),

            slaFill:             uc.newGroup(LANG.sa_infl_m, null, {modes:SLA, group:"sla-infill"}),
            slaFillDensity:      uc.newInput(LANG.sa_ifdn_s, {title:LANG.sa_ifdn_l, convert:uc.toFloat, bound:uc.bound(0,1), modes:SLA}),
            slaFillLine:         uc.newInput(LANG.sa_iflw_s, {title:LANG.sa_iflw_l, convert:uc.toFloat, bound:uc.bound(0,5), modes:SLA}),

            slaSupport:          uc.newGroup(LANG.sa_supp_m, null, {modes:SLA, group:"sla-support"}),
            slaSupportLayers:    uc.newInput(LANG.sa_slyr_s, {title:LANG.sa_slyr_l, convert:uc.toInt, bound:uc.bound(5,100), modes:SLA}),
            slaSupportGap:       uc.newInput(LANG.sa_slgp_s, {title:LANG.sa_slgp_l, convert:uc.toInt, bound:uc.bound(3,30), modes:SLA}),
            slaSupportDensity:   uc.newInput(LANG.sa_sldn_s, {title:LANG.sa_sldn_l, convert:uc.toFloat, bound:uc.bound(0.01,0.9), modes:SLA}),
            slaSupportSize:      uc.newInput(LANG.sa_slsz_s, {title:LANG.sa_slsz_l, convert:uc.toFloat, bound:uc.bound(0.1,1), modes:SLA}),
            slaSupportPoints:    uc.newInput(LANG.sa_slpt_s, {title:LANG.sa_slpt_l, convert:uc.toInt, bound:uc.bound(3,10), modes:SLA}),
            slaSupportEnable:    uc.newBoolean(LANG.enable, onBooleanClick, {title:LANG.sl_slen_l, modes:SLA}),

            slaOutput:           uc.newGroup(LANG.sa_outp_m, null, {modes:SLA, group:"sla-first"}),
            slaFirstOffset:      uc.newInput(LANG.sa_opzo_s, {title:LANG.sa_opzo_l, convert:uc.toFloat, bound:uc.bound(0,1), modes:SLA}),
            slaAntiAlias:        uc.newSelect(LANG.sa_opaa_s, {title:LANG.sa_opaa_l, modes:SLA}, "antialias"),

            rangeGroup:    uc.newGroup("ranges", null, {modes:FDM, group:"ranges"}),
            rangeList:     uc.newRow([], {}),

            settingsGroup: uc.newGroup(LANG.se_menu, $('settings')),
            settingsTable: uc.newRow([ ui.settingsLoad = uc.newButton(LANG.se_load, settingsLoad) ]),
            settingsTable: uc.newRow([ ui.settingsSave = uc.newButton(LANG.se_save, settingsSave) ]),
            settingsSave: $('settingsSave'),
            settingsName: $('settingsName'),

            layers:        uc.setGroup($("layers")),
        });

        // override old style settings two-button menu
        ui.settingsGroup.onclick = settingsLoad;
        ui.settingsSave.onclick = () => {
            settingsSave(undefined, ui.settingsName.value);
        };

        function optSelected(sel) {
            let opt = sel.options[sel.selectedIndex];
            return opt ? opt.value : undefined;
        }

        function fillShow() {
            return optSelected(ui.sliceFillType) === 'linear';
        }

        function spindleShow() {
            return settings().device.spindleMax > 0;
        }

        // slider setup
        const slbar = 30;
        const slbar2 = slbar * 2;
        const slider = ui.sliderRange;
        const drag = { };

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
            el.onmousedown = (ev) => {
                tracker.style.display = 'block';
                ev.stopPropagation();
                drag.width = slider.clientWidth;
                drag.maxval = drag.width - slbar2;
                drag.start = ev.screenX;
                drag.loat = drag.low = pxToInt(ui.sliderHold.style.marginLeft);
                drag.mdat = drag.mid = ui.sliderMid.clientWidth;
                drag.hiat = pxToInt(ui.sliderHold.style.marginRight);
                drag.mdmax = drag.width - slbar - drag.loat;
                drag.himax = drag.width - slbar - drag.mdat;
                let cancel_drag = tracker.onmouseup = (ev) => {
                    if (ev) {
                        ev.stopPropagation();
                        ev.preventDefault();
                    }
                    slider.onmousemove = undefined;
                    tracker.style.display = 'none';
                };
                tracker.onmousemove = (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    if (ev.buttons === 0) {
                        return cancel_drag();
                    }
                    if (delta) delta(ev.screenX - drag.start);
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

        ui.dev.header.onclick = (hide) => {
            let style = ui.dev.filter.style;
            if (style.display === 'flex' || hide === true) {
                style.display = '';
                deviceFilter = null;
                updateDeviceList();
            } else {
                style.display = 'flex';
                ui.dev.filter.focus();
                deviceFilter = ui.dev.filter.value.toLowerCase();
                updateDeviceList();
            }
        };

        ui.dev.filter.onkeyup = (ev) => {
            deviceFilter = ui.dev.filter.value.toLowerCase();
            updateDeviceList();
        };

        ui.dev.filter.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
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
                xv = parseFloat(ui.sizeX.was),
                yv = parseFloat(ui.sizeY.was),
                zv = parseFloat(ui.sizeZ.was),
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
            api.selection.scale(xr,yr,zr);
            ui.sizeX.was = ui.sizeX.value = xv * xr;
            ui.sizeY.was = ui.sizeY.value = yv * yr;
            ui.sizeZ.was = ui.sizeZ.value = zv * zr;
        }

        function selectionScale(e) {
            let dv = parseFloat(e.target.value || 1),
                pv = parseFloat(e.target.was || 1),
                ra = dv / pv,
                xv = parseFloat(ui.scaleX.was),
                yv = parseFloat(ui.scaleY.was),
                zv = parseFloat(ui.scaleZ.was),
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
            api.selection.scale(xr,yr,zr);
            ui.scaleX.was = ui.scaleX.value = xv * xr;
            ui.scaleY.was = ui.scaleY.value = yv * yr;
            ui.scaleZ.was = ui.scaleZ.value = zv * zr;
        }

        function selectionRotate(e) {
            let deg = parseFloat(e.target.value) * DEG2RAD;
            e.target.value = 0;
            switch (e.target.id.split('').pop()) {
                case 'x': return api.selection.rotate(deg,0,0);
                case 'y': return api.selection.rotate(0,deg,0);
                case 'z': return api.selection.rotate(0,0,deg);
            }
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
            api.selection.scale(1 / ui.scaleX.was, 1 / ui.scaleY.was, 1 / ui.scaleZ.was);
            ui.scaleX.value = ui.scaleY.value = ui.scaleZ.value =
            ui.scaleX.was = ui.scaleY.was = ui.scaleZ.was = 1;
        };

        let hpops = [];
        uc.hoverPop(ui.ltsetup, { group: hpops, target: $('set-pop') });
        uc.hoverPop(ui.ltfile,  { group: hpops, target: $('file-pop') });
        uc.hoverPop(ui.ltview,  { group: hpops, target: $('pop-view') });
        uc.hoverPop(ui.ltact,   { group: hpops, target: $('pop-slice') });
        uc.hoverPop(ui.render,  { group: hpops, target: $('pop-render'), sticky: false });
        uc.hoverPop(ui.edit,    { group: hpops, target: $('pop-tools'), sticky: false });
        uc.hoverPop(ui.nozzle,  { group: hpops, target: $('pop-nozzle'), sticky: true });
        uc.hoverPop($('app-acct'), { group: hpops, target: $('acct-pop') } );
        // uc.hoverPop($('app-mode'), { group: hpops, target: $('mode-info') } );
        uc.hoverPop($('app-name'), { group: hpops, target: $('app-info') } );

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

        for (let mode of ["fdm","sla","cam","laser"]) {
            if (api.feature.modes.indexOf(mode) >= 0) {
                $(`mode-${mode}`).appendChild(mksvg(icons[mode]));
            } else {
                $(`mode-${mode}`).style.display = 'none';
            }
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

        space.mouse.up((event, int) => {
            // context menu
            if (event.button === 2) {
                let et = event.target;
                if (et.tagName != 'CANVAS' && et.id != 'context-menu') {
                    return;
                }
                let full = api.view.is_arrange();
                for (let key of ["layflat","mirror","duplicate"]) {
                    $(`context-${key}`).disabled = !full;
                }
                let style = ui.context.style;
                style.display = 'flex';
                style.left = `${event.clientX-3}px`;
                style.top = `${event.clientY-3}px`;
                ui.context.onmouseleave = () => {
                    style.display = '';
                };
                event.preventDefault();
                event.stopPropagation();
                contextInt = int;
            }
        });

        space.mouse.downSelect((int,event) => {
            if (api.feature.hover) {
                if (int) {
                    api.event.emit('mouse.hover.down', {int, point: int.point});
                    return;
                }
                return;
            }
            // lay flat with meta or ctrl clicking a selected face
            if (int && (event.ctrlKey || event.metaKey || api.feature.on_face_select)) {
                let q = new THREE.Quaternion();
                // find intersecting point, look "up" on Z and rotate to face that
                q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                api.selection.rotate(q);
            }
            if (api.view.get() !== VIEWS.ARRANGE) {
                // return no selection in modes other than arrange
                return null;
            } else {
                // return selected meshes for further mouse processing
                return api.feature.hovers || api.selection.meshes();
            }
        });

        space.mouse.upSelect(function(object, event) {
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
                api.selection.move(delta.x, delta.y, 0);
                api.event.emit('selection.drag', delta);
            } else {
                return api.selection.meshes().length > 0;
            }
        });

        api.space.restore(init_two) || checkSeed(init_two) || init_two();

    };

    // SECOND STAGE INIT AFTER UI RESTORED

    function init_two() {
        api.event.emit('init.two');

        // api.space.set_focus();

        // call driver initializations, if present
        Object.values(kiri.driver).forEach(driver => {
            if (driver.init) try {
                driver.init(kiri, api);
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
            api.settings.import_url(`${proto}//${SETUP.wrk[0]}`, true);
        }

        // bind this to UI so main can call it on settings import
        ui.sync = function() {
            const current = settings();
            const control = current.controller;
            const process = settings.process;

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
            ui.decimate.checked = control.decimate;
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
            updateDeviceList();

            // ensure settings has gcode
            selectDevice(DEVNAME || api.device.get());

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
        if (!sdb.gdpr && WIN.self === WIN.top && !SETUP.debug) {
            $('gdpr').style.display = 'flex';
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
        $('app-name').onclick = api.help.show;
        $('app-mode').onclick = (ev) => { ev.stopPropagation(); showDevices() };
        $('set-device').onclick = (ev) => { ev.stopPropagation(); showDevices() };
        $('set-tools').onclick = (ev) => { ev.stopPropagation(); showTools() };
        $('set-prefs').onclick = (ev) => { ev.stopPropagation(); api.modal.show('prefs') };
        ui.acct.help.onclick = (ev) => { ev.stopPropagation(); api.help.show() };
        ui.acct.export.onclick = (ev) => { ev.stopPropagation(); profileExport() };
        ui.acct.export.title = LANG.acct_xpo;
        $('file-recent').onclick = () => { api.modal.show('files') };
        $('file-import').onclick = (ev) => { api.event.import(ev) };
        ui.back.onclick = api.platform.layout;
        ui.options.trash.onclick = api.selection.delete;
        ui.options.enable.onclick = api.selection.enable;
        ui.options.disable.onclick = api.selection.disable;
        ui.func.slice.onclick = (ev) => { ev.stopPropagation(); api.function.slice() };
        ui.func.preview.onclick = (ev) => { ev.stopPropagation(); api.function.print() };
        ui.func.animate.onclick = (ev) => { ev.stopPropagation(); api.function.animate() };
        ui.func.export.onclick = (ev) => { ev.stopPropagation(); api.function.export() };
        $('view-arrange').onclick = api.platform.layout;
        $('view-top').onclick = space.view.top;
        $('view-home').onclick = space.view.home;
        $('view-clear').onclick = api.platform.clear;
        $('mode-fdm').onclick = () => { api.mode.set('FDM') };
        $('mode-sla').onclick = () => { api.mode.set('SLA') };
        $('mode-cam').onclick = () => { api.mode.set('CAM') };
        $('mode-laser').onclick = () => { api.mode.set('LASER') };
        $('unrotate').onclick = () => {
            api.widgets.for(w => w.unrotate());
            api.selection.update_info();
        };
        $('lay-flat').onclick = () => { api.event.emit("tool.mesh.lay-flat") };
        // rotation buttons
        let d = (Math.PI / 180) * 5;
        $('rot_x_lt').onclick = () => { api.selection.rotate(-d,0,0) };
        $('rot_x_gt').onclick = () => { api.selection.rotate( d,0,0) };
        $('rot_y_lt').onclick = () => { api.selection.rotate(0,-d,0) };
        $('rot_y_gt').onclick = () => { api.selection.rotate(0, d,0) };
        $('rot_z_lt').onclick = () => { api.selection.rotate(0,0, d) };
        $('rot_z_gt').onclick = () => { api.selection.rotate(0,0,-d) };
        // rendering options
        $('render-hide').onclick = () => { api.view.wireframe(false, 0, 0); };
        $('render-ghost').onclick = () => { api.view.wireframe(false, 0, api.view.is_arrange() ? 0.4 : 0.25); };
        $('render-wire').onclick = () => { api.view.wireframe(true, 0, api.space.is_dark() ? 0.25 : 0.5); };
        $('render-solid').onclick = () => { api.view.wireframe(false, 0, 1); };
        // mesh buttons
        $('mesh-heal').onclick = () => { api.widgets.heal() };
        $('mesh-swap').onclick = () => { api.widgets.replace() };
        $('mesh-export-stl').onclick = () => { objectsExport('stl') };
        $('mesh-export-obj').onclick = () => { objectsExport('obj') };
        // context menu
        $('context-export-workspace').onclick = () => { profileExport(true) };
        $('context-clear-workspace').onclick = () => {
            api.view.set(VIEWS.ARRANGE);
            api.platform.clear();
            ui.context.onmouseleave();
        };
        $('context-duplicate').onclick = duplicateSelection;
        $('context-mirror').onclick = mirrorSelection;
        $('context-layflat').onclick = layFlat;
        $('context-setfocus').onclick = setFocus;

        ui.modal.onclick = api.modal.hide;
        ui.modalBox.onclick = (ev) => { ev.stopPropagation() };

        // add app name hover info
        $('app-info').innerText = kiri.version;
        // show topline separator when iframed
        // try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { }

        // bind tictac buttons to panel show/hide
        let groups = {};
        for (let tt of [...document.getElementsByClassName('tictac')]) {
            let sid = tt.getAttribute('select');
            let gid = tt.getAttribute('group') || 'default';
            let grp = groups[gid] = groups[gid] || [];
            let target = $(sid);
            target.style.display = 'none';
            target.control = tt;
            grp.push({button: tt, div: target});
            tt.onclick = () => {
                for (let rec of grp) {
                    let {button, div} = rec;
                    if (div === target) {
                        div.style.display = '';
                        button.classList.add('selected');
                    } else {
                        div.style.display = 'none';
                        button.classList.remove('selected');
                    }
                }
                let lid = tt.getAttribute('label');
                if (lid) {
                    $(lid).innerText = tt.getAttribute('title');
                }
            };
        }
        // bind closer X to hiding parent action
        for (let tt of [...document.getElementsByClassName('closer')]) {
            let tid = tt.getAttribute('target');
            let target = tid ? $(tid) : parentWithClass(tt, 'movable');
            target.style.display = 'none';
            let close = tt.onmousedown = (ev) => {
                target.style.display = 'none';
                if (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            };
            api.event.on('key.esc', close);
        }
        // add drag behavior to movers
        [...document.getElementsByClassName('mover')].forEach(mover => {
            mover.onmousedown = (ev) => {
                let moving = parentWithClass(mover, 'movable');
                let mpos = {
                    x: moving.offsetLeft,
                    y: moving.offsetTop
                };
                ev.preventDefault();
                ev.stopPropagation();
                let origin = {
                    x: ev.screenX,
                    y: ev.screenY
                };
                let tracker = ui.tracker;
                tracker.style.display = 'block';
                tracker.onmousemove = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    let pos = {
                        x: ev.screenX,
                        y: ev.screenY
                    };
                    let delta = {
                        x: pos.x - origin.x,
                        y: pos.y - origin.y
                    };
                    moving.style.left = `${mpos.x + delta.x}px`;
                    moving.style.top = `${mpos.y + delta.y}px`;
                };
                tracker.onmouseup = (ev) => {
                    ui.tracker.style.display = 'none';
                    ev.preventDefault();
                    ev.stopPropagation();
                    tracker.onmouseup = null;
                    tracker.onmouseout = null;
                    tracker.onmousemove = null;
                };
            };
        });

        // bind tool buttons
        {
            let { event } = api;
            let next = 0;
            let list = ['rotate','scale','mesh','select'];
            event.on("tool.next", () => {
                event.emit("tool.show", list[next++ % 4]);
            });
            event.on("tool.show", tictac => {
                if (typeof(tictac) === 'string') {
                    next = list.indexOf(tictac)+1;
                    tictac = $(`ft-${tictac}`);
                }
                let mover = parentWithClass(tictac.control, 'movable');
                mover.style.display = 'flex';
                tictac.control.onclick();
            });
            $('tool-rotate').onclick = event.bind("tool.show", "rotate");
            $('tool-scale').onclick = event.bind("tool.show", "scale");
            $('tool-mesh').onclick = event.bind("tool.show", "mesh");
            $('tool-selector').onclick = event.bind("tool.show", "select");
        }

        // warn users they are running a beta release
        if (kiri.beta && kiri.beta > 0 && sdb.kiri_beta != kiri.beta) {
            api.show.alert("this is a beta / development release");
            sdb.kiri_beta = kiri.beta;
        }

        // add palette3 edit button after filament source selector
        {
            let randomId = Math.round(Math.random() * 0xffffffffffff).toString(16);
            let fsp = ui.filamentSource.parentNode;
            let btn = ui.filamentSourceEdit = DOC.createElement('button');
            btn.setAttribute('id', 'fs-edit');
            btn.appendChild(DOC.createTextNode('edit'));
            fsp.insertBefore(btn, ui.filamentSource);
            let editDone = () => {
                let device = api.conf.get().device;
                let extra = device.extras = device.extras || {};
                btn.onclick = edit;
                btn.innerText = 'edit';
                ui.extruder.parentNode.style.display = 'flex';
                ui.palette.parentNode.style.display = 'none';
                // save settings
                extra.palette = {
                    printer: ui.paletteId.value || randomId,
                    ping: ui.palettePing.convert(),
                    feed: ui.paletteFeed.convert(),
                    push: ui.palettePush.convert(),
                    offset: ui.paletteOffset.convert(),
                    heat: ui.paletteHeat.convert(),
                    cool: ui.paletteCool.convert(),
                    press: ui.palettePress.convert()
                };
            };
            let edit = btn.onclick = () => {
                let device = api.conf.get().device;
                let extra = device.extras = device.extras || {};
                let pinfo = extra.palette;
                if (!pinfo) {
                    pinfo = extra.palette = {
                        printer: randomId,
                        feed: 570,
                        push: 600,
                        heat: 0,
                        cool: 0,
                        press: 0
                    };
                }
                ui.paletteId.value = pinfo.printer;
                ui.palettePing.value = pinfo.ping || 0;
                ui.paletteFeed.value = pinfo.feed || 0;
                ui.palettePush.value = pinfo.push || 0;
                ui.paletteOffset.value = pinfo.offset || 0;
                ui.paletteHeat.value = pinfo.heat || 0;
                ui.paletteCool.value = pinfo.cool || 0;
                ui.palettePress.value = pinfo.press || 0;
                ui.extruder.parentNode.style.display = 'none';
                ui.palette.parentNode.style.display = 'flex';
                btn.innerText = 'done';
                btn.onclick = editDone;
            };
            api.event.on(["device.select", "filament.source"], () => {
                ui.extruder.parentNode.style.display = 'flex';
                ui.palette.parentNode.style.display = 'none';
                btn.innerText = 'edit';
                btn.onclick = edit;
            });
            api.event.on("device.save", editDone);
        }

        api.show.alert("<a href='/choose'>this version is out of date</a>");
        api.show.alert("<a href='/choose'>click here to update</a>");
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
