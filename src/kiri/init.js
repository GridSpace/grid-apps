
/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.init) return;

    const KIRI = self.kiri,
        BASE = self.base,
        MOTO = self.moto,
        CONF = KIRI.conf,
        WIN = self.window,
        DOC = self.document,
        LOC = self.location,
        API = KIRI.api,
        SDB = API.sdb,
        UI = API.ui,
        UC = API.uc,
        SEED = API.const.SEED,
        LANG = API.const.LANG,
        VIEWS = API.const.VIEWS,
        MODES = API.const.MODES,
        LOCAL = API.const.LOCAL,
        SETUP = API.const.SETUP,
        DEFMODE = SETUP.dm && SETUP.dm.length === 1 ? SETUP.dm[0] : 'FDM',
        STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
        SPACE = KIRI.space,
        STATS = API.stats,
        DEG = Math.PI/180,
        ALL = [MODES.FDM, MODES.LASER, MODES.CAM, MODES.SLA],
        CAM = [MODES.CAM],
        SLA = [MODES.SLA],
        FDM = [MODES.FDM],
        FDM_SLA = [MODES.FDM,MODES.SLA],
        FDM_CAM = [MODES.CAM,MODES.FDM],
        FDM_LASER = [MODES.LASER,MODES.FDM],
        FDM_LASER_SLA = [MODES.LASER,MODES.FDM,MODES.SLA],
        CAM_LASER = [MODES.LASER,MODES.CAM],
        GCODE = [MODES.FDM, MODES.LASER, MODES.CAM],
        LASER = [MODES.LASER],
        CATALOG = API.catalog,
        js2o = API.js2o,
        o2js = API.o2js,
        platform = API.platform,
        selection = API.selection,
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
        fpsTimer = null,
        platformColor,
        contextInt;

    // extend KIRI API with local functions
    API.show.devices = showDevices;
    API.device.set = selectDevice;
    API.device.clone = cloneDevice;

    function settings() {
        return API.conf.get();
    }

    function checkSeed(then) {
        // skip sample object load in onshape (or any script postload)
        if (!SDB[SEED]) {
            SDB[SEED] = new Date().getTime();
            if (!SETUP.s && API.feature.seed) {
                if (SETUP.debug) {
                    return then();
                }
                platform.load_stl("/obj/cube.stl", function(vert) {
                    CATALOG.putFile("sample cube.stl", vert);
                    platform.compute_max_z();
                    SPACE.view.home();
                    setTimeout(() => { API.space.save(true) },500);
                    then();
                    API.help.show();
                });
                return true;
            }
        }
        return false;
    }

    function unitsSave() {
        API.conf.update({controller:true});
        platform.update_size();
    }

    function aniMeshSave() {
        API.conf.update({controller:true});
        API.conf.save();
    }

    function lineTypeSave() {
        const sel = UI.lineType.options[UI.lineType.selectedIndex];
        if (sel) {
            settings().controller.lineType = sel.value;
            API.conf.save();
        }
    }

    function detailSave() {
        let level = UI.detail.options[UI.detail.selectedIndex];
        if (level) {
            level = level.value;
            let rez = BASE.config.clipperClean;
            switch (level) {
                case 'best': rez = 50; break;
                case 'good': rez = BASE.config.clipperClean; break;
                case 'fair': rez = 500; break;
                case 'poor': rez = 1000; break;
            }
            KIRI.client.config({
                base: { clipperClean: rez }
            });
            settings().controller.detail = level;
            API.conf.save();
        }
    }

    function speedSave() {
        settings().controller.showSpeeds = UI.showSpeeds.checked;
        API.platform.update_speeds();
    }

    function zAnchorSave() {
        API.conf.update();
        API.platform.update_top_z();
    }

    function booleanSave() {
        let control = settings().controller;
        let isDark = control.dark;
        let doAlert = UI.ortho.checked !== control.ortho;
        control.decals = UI.decals.checked;
        control.danger = UI.danger.checked;
        control.showOrigin = UI.showOrigin.checked;
        control.showRulers = UI.showRulers.checked;
        control.autoLayout = UI.autoLayout.checked;
        control.freeLayout = UI.freeLayout.checked;
        control.autoSave = UI.autoSave.checked;
        control.reverseZoom = UI.reverseZoom.checked;
        control.dark = UI.dark.checked;
        control.exportOcto = UI.exportOcto.checked;
        control.exportGhost = UI.exportGhost.checked;
        control.exportLocal = UI.exportLocal.checked;
        control.exportPreview = UI.exportPreview.checked;
        control.decimate = UI.decimate.checked;
        control.healMesh = UI.healMesh.checked;
        control.ortho = UI.ortho.checked;
        control.devel = UI.devel.checked;
        SPACE.view.setZoom(control.reverseZoom, control.zoomSpeed);
        // platform.layout();
        API.conf.save();
        API.platform.update_size();
        API.catalog.setOptions({
            maxpass: control.decimate ? 10 : 0
        });
        UC.setHoverPop(false);
        updateFPS();
        if (control.decals) {
            loadDeviceTexture(currentDevice, deviceTexture);
        } else {
            clearDeviceTexture();
        }
        API.event.emit('boolean.update');
        if (doAlert) {
            API.show.alert("change requires page refresh");
        }
    }

    function updateFPS() {
        clearTimeout(fpsTimer);
        UI.fps.style.display = 'block';
        setInterval(() => {
            const nv = SPACE.view.getFPS().toFixed(2);
            if (nv !== UI.fps.innerText) {
                UI.fps.innerText = nv;
            }
        }, 100);
    }

    function onLayerToggle() {
        API.conf.update();
        API.show.slices();
    }

    function onBooleanClick() {
        // prevent hiding elements in device editor on clicks
        // if (!API.modal.visible()) {
            UC.refresh();
        // }
        API.conf.update();
        DOC.activeElement.blur();
        API.event.emit("boolean.click");
    }

    function onButtonClick(ev) {
        let target = ev.target;
        while (target && target.tagName !== 'BUTTON') {
            target = target.parentNode;
        }
        API.event.emit("button.click", target);
    }

    function inputHasFocus() {
        let active = DOC.activeElement;
        return active && (active.nodeName === "INPUT" || active.nodeName === "TEXTAREA");
    }

    function inputTextOK() {
        return DOC.activeElement === UI.deviceName;
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
        if (API.feature.on_key) {
            if (API.feature.on_key({up:evt})) return;
        }
        switch (evt.keyCode) {
            // escape
            case 27:
                // blur text input focus
                DOC.activeElement.blur();
                // dismiss modals
                API.modal.hide();
                // deselect widgets
                platform.deselect();
                // hide all dialogs
                API.dialog.hide();
                // cancel slicing
                API.function.cancel();
                // kill any poppers in compact mode
                UC.hidePoppers();
                // and send an event (used by FDM client)
                API.event.emit("key.esc");
                break;
        }
        return false;
    }

    function keyDownHandler(evt) {
        if (API.modal.visible()) {
            return false;
        }
        if (API.feature.on_key) {
            if (API.feature.on_key({down:evt})) return;
        }
        let move = evt.altKey ? 5 : 0,
            deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);
        switch (evt.keyCode) {
            case 8: // apple: delete/backspace
            case 46: // others: delete
                if (inputHasFocus()) return false;
                platform.delete(API.selection.meshes());
                evt.preventDefault();
                break;
            case 37: // left arrow
                if (inputHasFocus()) return false;
                if (deg) API.selection.rotate(0, 0, -deg);
                if (move > 0) API.selection.move(-move, 0, 0);
                evt.preventDefault();
                break;
            case 39: // right arrow
                if (inputHasFocus()) return false;
                if (deg) API.selection.rotate(0, 0, deg);
                if (move > 0) API.selection.move(move, 0, 0);
                evt.preventDefault();
                break;
            case 38: // up arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return API.show.layer(API.var.layer_at+1);
                if (deg) API.selection.rotate(deg, 0, 0);
                if (move > 0) API.selection.move(0, move, 0);
                evt.preventDefault();
                break;
            case 40: // down arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return API.show.layer(API.var.layer_at-1);
                if (deg) API.selection.rotate(-deg, 0, 0);
                if (move > 0) API.selection.move(0, -move, 0);
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
                    API.conf.save();
                    console.log("settings saved");
                } else
                if (evt.metaKey) {
                    evt.preventDefault();
                    API.space.save();
                }
                break;
            case 76: // 'l' for restore workspace
                if (evt.metaKey) {
                    evt.preventDefault();
                    API.space.restore();
                }
                break;
        }
    }

    function keyHandler(evt) {
        let handled = true;
        if (API.modal.visible() || inputHasFocus()) {
            return false;
        }
        if (API.feature.on_key) {
            if (API.feature.on_key({key:evt})) return;
        }
        if (evt.ctrlKey) {
            switch (evt.key) {
                case 'g': return API.group.merge();
                case 'u': return API.group.split();
            }
        }
        switch (evt.charCode) {
            case cca('`'): API.show.slices(0); break;
            case cca('0'): API.show.slices(API.var.layer_max); break;
            case cca('1'): API.show.slices(API.var.layer_max/10); break;
            case cca('2'): API.show.slices(API.var.layer_max*2/10); break;
            case cca('3'): API.show.slices(API.var.layer_max*3/10); break;
            case cca('4'): API.show.slices(API.var.layer_max*4/10); break;
            case cca('5'): API.show.slices(API.var.layer_max*5/10); break;
            case cca('6'): API.show.slices(API.var.layer_max*6/10); break;
            case cca('7'): API.show.slices(API.var.layer_max*7/10); break;
            case cca('8'): API.show.slices(API.var.layer_max*8/10); break;
            case cca('9'): API.show.slices(API.var.layer_max*9/10); break;
            case cca('?'):
                API.help.show();
                break;
            case cca('Z'): // reset stored state
                UC.confirm('clear all settings and preferences?').then(yes => {
                    if (yes) SDB.clear();
                });
                break;
            case cca('C'): // refresh catalog
                CATALOG.refresh();
                break;
            case cca('i'): // file import
                API.event.import();
                break;
            case cca('S'): // slice
            case cca('s'): // slice
                if (evt.shiftKey) {
                    API.show.alert('CAPS lock on?');
                }
                API.function.slice();
                break;
            case cca('P'): // prepare
            case cca('p'): // prepare
                if (evt.shiftKey) {
                    API.show.alert('CAPS lock on?');
                }
                if (API.mode.get() !== 'SLA') {
                    // hidden in SLA mode
                    API.function.print();
                }
                break;
            case cca('X'): // export
            case cca('x'): // export
                if (evt.shiftKey) {
                    API.show.alert('CAPS lock on?');
                }
                API.function.export();
                break;
            case cca('g'): // CAM animate
                API.function.animate();
                break;
            case cca('O'): // manual rotation
                rotateInputSelection();
                break;
            case cca('r'): // recent files
                API.modal.show('files');
                break;
            case cca('q'): // preferences
                API.modal.show('prefs');
                break;
            case cca('l'): // device
                settingsLoad();
                break;
            case cca('e'): // device
                showDevices();
                break;
            case cca('o'): // tools
                showTools();
                break;
            case cca('c'): // local devices
                API.show.local();
                break;
            case cca('v'): // toggle single slice view mode
                if (API.view.get() === VIEWS.ARRANGE) {
                    API.space.set_focus(API.selection.widgets());
                }
                if (API.var.layer_hi == API.var.layer_lo) {
                    API.var.layer_lo = 0;
                } else {
                    API.var.layer_lo = API.var.layer_hi;
                }
                API.show.slices();
                break;
            case cca('d'): // duplicate object
                duplicateSelection();
                break;
            case cca('m'): // mirror object
                mirrorSelection();
                break;
            case cca('R'): // toggle slice render mode
                renderMode++;
                API.function.slice();
                break;
            case cca('a'):
                if (API.view.get() === VIEWS.ARRANGE) {
                    // auto arrange items on platform
                    platform.layout();
                    API.space.set_focus(API.selection.widgets());
                } else {
                    // go to arrange view
                    API.view.set(VIEWS.ARRANGE);
                }
                break;
            default:
                API.event.emit('keypress', evt);
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
            API.selection.rotate(q);
        }
    }

    function setFocus() {
        let int = contextInt[0];
        if (int && int.object && int.object.widget) {
            API.space.set_focus(undefined, int.point);
        }
    }

    function duplicateSelection() {
        API.selection.for_widgets(function(widget) {
            let mesh = widget.mesh;
            let bb = mesh.getBoundingBox();
            let ow = widget;
            let nw = API.widgets.new().loadGeometry(mesh.geometry.clone());
            nw.meta.file = ow.meta.file;
            nw.meta.vertices = ow.meta.vertices;
            nw.move(bb.max.x - bb.min.x + 1, 0, 0);
            platform.add(nw,true);
            let owa = API.widgets.annotate(ow.id);
            let nwa = API.widgets.annotate(nw.id);
            if (owa.tab) {
                nwa.tab = Object.clone(owa.tab);
                nwa.tab.forEach((tab,i) => {
                    tab.id = Date.now() + i
                });
            }
            KIRI.driver.CAM.restoreTabs([nw]);
        });
    }

    function mirrorSelection() {
        API.selection.mirror();
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
        if (API.selection.meshes().length === 0) {
            API.show.alert("select object to rotate");
            return;
        }
        let coord = (prompt("Enter X,Y,Z degrees of rotation") || '').split(','),
            prod = Math.PI / 180,
            x = parseFloat(coord[0] || 0.0) * prod,
            y = parseFloat(coord[1] || 0.0) * prod,
            z = parseFloat(coord[2] || 0.0) * prod;

        API.selection.rotate(x, y, z);
    }

    function positionSelection() {
        if (API.selection.meshes().length === 0) {
            API.show.alert("select object to position");
            return;
        }
        let current = settings(),
            center = current.process.outputOriginCenter,
            bounds = boundsSelection(),
            coord = prompt("Enter X,Y coordinates for selection").split(','),
            x = parseFloat(coord[0] || 0.0),
            y = parseFloat(coord[1] || 0.0),
            z = parseFloat(coord[2] || 0.0);

        if (!center) {
            x = x - current.device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
            y = y - current.device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
        }

        API.selection.move(x, y, z, true);
    }

    function deviceExport(exp, name) {
        name = (name || "device")
            .toLowerCase()
            .replace(/ /g,'_')
            .replace(/\./g,'_');
        UC.prompt("Export Device Filename", name).then(name => {
            if (name) {
                API.util.download(exp, `${name}.km`);
            }
        });
    }

    function objectsExport() {
        // return API.selection.export();
        UC.confirm("Export Filename", {ok:true, cancel: false}, "selected.stl").then(name => {
            if (!name) return;
            if (name.toLowerCase().indexOf(".stl") < 0) {
                name = `${name}.stl`;
            }
            API.util.download(API.selection.export(), name);
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
        UC.confirm("Export Filename", {ok:true, cancel: false}, "workspace", opt).then(name => {
            if (name) {
                let work = $('incwork').checked,
                    json = API.conf.export({work});
                API.util.download(json, `${name}.km`);
            }
        });
    }

    function settingsSave(ev, name) {
        if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
        }

        API.dialog.hide();
        let mode = API.mode.get(),
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
                API.conf.save();
                API.conf.update();
                API.event.settings();
            };

        if (name) {
            saveAs(name);
        } else {
            UC.prompt("Save Settings As", cp ? lp || def : def).then(saveAs);
        }
    }

    function settingsLoad() {
        UC.hidePoppers();
        API.conf.show();
    }

    function putLocalDevice(devicename, obj) {
        settings().devices[devicename] = obj;
        API.conf.save();
    }

    function removeLocalDevice(devicename) {
        delete settings().devices[devicename];
        API.conf.save();
    }

    function isLocalDevice(devicename) {
        return settings().devices[devicename] ? true : false;
    }

    function getSelectedDevice() {
        return API.device.get();
    }

    function selectDevice(devicename) {
        if (isLocalDevice(devicename)) {
            setDeviceCode(settings().devices[devicename], devicename);
        } else {
            let code = devices[API.mode.get_lower()][devicename];
            if (code) {
                setDeviceCode(code, devicename);
            }
        }
    }

    // only for local filters
    function cloneDevice() {
        let name = `${getSelectedDevice().replace(/\./g,' ')} Copy`;
        let code = API.clone(settings().device);
        code.mode = API.mode.get();
        putLocalDevice(name, code);
        setDeviceCode(code, name);
    }

    function setDeviceCode(code, devicename) {
        try {
            if (typeof(code) === 'string') code = js2o(code) || {};

            API.event.emit('device.set', devicename);

            let mode = API.mode.get(),
                current = settings(),
                local = isLocalDevice(devicename),
                dev = current.device = CONF.device_from_code(code,mode),
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

            UI.deviceName.value = devicename;
            UI.deviceBelt.checked = dev.bedBelt;
            UI.deviceRound.checked = dev.bedRound;
            UI.deviceOrigin.checked = dev.outputOriginCenter || dev.originCenter;
            UI.fwRetract.checked = dev.fwRetract;

            // add extruder selection buttons
            if (dev.extruders) {
                for (let ext of dev.extruders) {
                    // add missing deselect field from legacy configs
                    if (!ext.extDeselect) {
                        ext.extDeselect = [];
                    }
                }
                let ext = API.lists.extruders = [];
                dev.internal = 0;
                let selext = $('pop-nozzle');
                selext.innerHTML = '';
                for (let i=0; i<dev.extruders.length; i++) {
                    let d = DOC.createElement('div');
                    d.appendChild(DOC.createTextNode(i));
                    d.setAttribute('id', `sel-ext-${i}`);
                    d.setAttribute('class', 'col j-center');
                    d.onclick = function() {
                        API.selection.for_widgets(w => {
                            API.widgets.annotate(w.id).extruder = i;
                        });
                        API.platform.update_selected();
                    };
                    selext.appendChild(d);
                    ext.push({id:i, name:i});
                }
            }

            // disable editing for non-local devices
            [
                UI.deviceName,
                UI.gcodePre,
                UI.gcodePost,
                UI.gcodeExt,
                UI.gcodeInt,
                UI.gcodePause,
                UI.bedDepth,
                UI.bedWidth,
                UI.maxHeight,
                UI.deviceOrigin,
                UI.deviceRound,
                UI.deviceBelt,
                UI.fwRetract,
                UI.gcodeFan,
                UI.gcodeTrack,
                UI.gcodeLayer,
                UI.extFilament,
                UI.extNozzle,
                UI.spindleMax,
                UI.gcodeSpindle,
                UI.gcodeDwell,
                UI.gcodeChange,
                UI.gcodeFExt,
                UI.gcodeSpace,
                UI.gcodeStrip,
                UI.gcodeLaserOn,
                UI.gcodeLaserOff,
                UI.extPrev,
                UI.extNext,
                UI.extAdd,
                UI.extDel,
                UI.extOffsetX,
                UI.extOffsetY,
                UI.extSelect,
                UI.extDeselect
            ].forEach(function(e) {
                e.disabled = !local;
            });

            UI.deviceSave.disabled = !local;
            UI.deviceDelete.disabled = !local;
            UI.deviceExport.disabled = !local;
            if (local) {
                UI.deviceAdd.innerText = "copy";
                UI.deviceDelete.style.display = '';
                UI.deviceExport.style.display = '';
            } else {
                UI.deviceAdd.innerText = "customize";
                UI.deviceDelete.style.display = 'none';
                UI.deviceExport.style.display = 'none';
            }
            UI.deviceAdd.disabled = dev.noclone;

            API.view.update_fields();
            platform.update_size();
            platform.update_origin();
            platform.update();

            // store current device name for this mode
            current.filter[mode] = devicename;
            // cache device record for this mode (restored in setMode)
            current.cdev[mode] = currentDevice = dev;

            if (dproc) {
                // restore last process associated with this device
                API.conf.load(null, dproc);
            } else {
                API.conf.update();
            }

            API.conf.save();

            API.const.SPACE.view.setHome(dev.bedBelt ? Math.PI/2 : 0);
            // when changing devices, update focus on widgets
            if (chgdev) {
                setTimeout(API.space.set_focus, 0);
            }

            UC.refresh();

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
            API.show.alert(`invalid or deprecated device: "${devicename}"`, 10);
            API.show.alert(`please select a new device`, 10);
            throw e;
            showDevices();
        }
        API.function.clear();
        API.event.settings();
    }

    function clearDeviceTexture() {
        if (deviceImage) {
            SPACE.world.remove(deviceImage);
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
        if (!(texture && API.conf.get().controller.decals)) {
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
        SPACE.world.add(deviceImage = mesh);
    }

    function updateDeviceName() {
        let newname = UI.deviceName.value,
            selected = API.device.get(),
            devs = settings().devices;
        if (newname !== selected) {
            devs[newname] = devs[selected];
            delete devs[selected];
            UI.deviceSave.onclick();
            selectDevice(newname);
            updateDeviceList();
        }
    }

    function renderDevices(devices) {
        let selectedIndex = -1,
            selected = API.device.get(),
            devs = settings().devices;

        for (let local in devs) {
            if (!(devs.hasOwnProperty(local) && devs[local])) {
                continue;
            }
            let dev = devs[local],
                fdmCode = dev.cmd,
                fdmMode = (API.mode.get() === 'FDM');

            if (dev.mode ? (dev.mode === API.mode.get()) : (fdmCode ? fdmMode : !fdmMode)) {
                devices.push(local);
            }
        };

        devices = devices.sort();

        UI.deviceSave.onclick = function() {
            API.function.clear();
            API.conf.save();
            showDevices();
            API.modal.hide();
        };
        UI.deviceAdd.onclick = function() {
            API.function.clear();
            cloneDevice();
            showDevices();
        };
        UI.deviceDelete.onclick = function() {
            API.function.clear();
            removeLocalDevice(getSelectedDevice());
            showDevices();
        };
        UI.deviceExport.onclick = function() {
            let exp = API.util.b64enc({
                version: KIRI.version,
                device: selected,
                process: API.process.code(),
                code: devs[selected],
                time: Date.now()
            });
            deviceExport(exp, selected);
        };

        UI.deviceList.innerHTML = '';
        UI.deviceMy.innerHTML = '';
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
                API.platform.layout();
            };
            if (loc) {
                UI.deviceMy.appendChild(opt);
            } else {
                UI.deviceList.appendChild(opt);
            }
            if (device === selected) {
                // scroll to highlighted selection
                setTimeout(() => UI.deviceList.scrollTop = opt.offsetTop, 0);
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
        UI.toolSelect.innerHTML = '';
        maxTool = 0;
        editTools.forEach(function(tool, index) {
            maxTool = Math.max(maxTool, tool.number);
            tool.order = index;
            let opt = DOC.createElement('option');
            opt.appendChild(DOC.createTextNode(tool.name));
            opt.onclick = function() { selectTool(tool) };
            UI.toolSelect.appendChild(opt);
        });
    }

    function selectTool(tool) {
        selectedTool = tool;
        UI.toolName.value = tool.name;
        UI.toolNum.value = tool.number;
        UI.toolFluteDiam.value = tool.flute_diam;
        UI.toolFluteLen.value = tool.flute_len;
        UI.toolShaftDiam.value = tool.shaft_diam;
        UI.toolShaftLen.value = tool.shaft_len;
        // UI.toolTaperAngle.value = tool.taper_angle || 70;
        UI.toolTaperTip.value = tool.taper_tip || 0;
        UI.toolMetric.checked = tool.metric;
        UI.toolType.selectedIndex = ['endmill','ballmill','tapermill'].indexOf(tool.type);
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
        // UI.toolTaperAngle.disabled = taper ? undefined : 'true';
        UI.toolTaperTip.disabled = taper ? undefined : 'true';
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
        selectedTool.name = UI.toolName.value;
        selectedTool.number = parseInt(UI.toolNum.value);
        selectedTool.flute_diam = parseFloat(UI.toolFluteDiam.value);
        selectedTool.flute_len = parseFloat(UI.toolFluteLen.value);
        selectedTool.shaft_diam = parseFloat(UI.toolShaftDiam.value);
        selectedTool.shaft_len = parseFloat(UI.toolShaftLen.value);
        // selectedTool.taper_angle = parseFloat(UI.toolTaperAngle.value);
        selectedTool.taper_tip = parseFloat(UI.toolTaperTip.value);
        selectedTool.metric = UI.toolMetric.checked;
        selectedTool.type = ['endmill','ballmill','tapermill'][UI.toolType.selectedIndex];
        renderTools();
        UI.toolSelect.selectedIndex = selectedTool.order;
        setToolChanged(true);
        renderTool(selectedTool);
    }

    function setToolChanged(changed) {
        editTools.changed = changed;
        UI.toolsSave.disabled = !changed;
    }

    function showTools() {
        if (API.mode.get_id() !== MODES.CAM) return;

        let selectedIndex = null;

        editTools = settings().tools.slice().sort((a,b) => {
            return a.name > b.name ? 1 : -1;
        });

        setToolChanged(false);

        UI.toolsClose.onclick = function() {
            if (editTools.changed && !confirm("abandon changes?")) return;
            API.dialog.hide();
        };
        UI.toolAdd.onclick = function() {
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
            UI.toolSelect.selectedIndex = editTools.length-1;
            selectTool(editTools[editTools.length-1]);
        };
        UI.toolDelete.onclick = function() {
            editTools.remove(selectedTool);
            setToolChanged(true);
            renderTools();
        };
        UI.toolsSave.onclick = function() {
            if (selectedTool) updateTool();
            settings().tools = editTools.sort((a,b) => {
                return a.name < b.name ? -1 : 1;
            });
            setToolChanged(false);
            API.conf.save();
            API.view.update_fields();
            API.event.settings();
        };

        renderTools();
        if (editTools.length > 0) {
            selectTool(editTools[0]);
            UI.toolSelect.selectedIndex = 0;
        } else {
            UI.toolAdd.onclick();
        }

        API.dialog.show('tools');
        UI.toolSelect.focus();
    }

    function updateDeviceList() {
        renderDevices(Object.keys(devices[API.mode.get_lower()]).sort());
    }

    function showDevices() {
        // disable device filter and show devices
        UI.dev.search.onclick(true);
        API.modal.show('setup');
        UI.deviceList.focus();
    }

    function dragOverHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        // prevent drop actions when a dialog is open
        if (API.modal.visible()) {
            return;
        }

        evt.dataTransfer.dropEffect = 'copy';
        let oldcolor = SPACE.platform.setColor(0x00ff00);
        if (oldcolor !== 0x00ff00) platformColor = oldcolor;
    }

    function dragLeave() {
        SPACE.platform.setColor(platformColor);
    }

    function dropHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        // prevent drop actions when a dialog is open
        if (API.modal.visible()) {
            return;
        }

        SPACE.platform.setColor(platformColor);

        let files = evt.dataTransfer.files;

        switch (API.feature.drop_group) {
            case true:
                return API.platform.load_files(files, []);
            case false:
                return API.platform.load_files(files, undefined);
        }

        function ck_group() {
            if (files.length === 1) {
                API.platform.load_files(files);
            } else {
                UC.confirm(`group ${files.length} files?`).then(yes => {
                    API.platform.load_files(files, yes ? [] : undefined);
                });
            }
        }

        if (files.length > 5) {
            UC.confirm(`add ${files.length} objects to workspace?`).then(yes => {
                if (yes) ck_group();
            });
        } else {
            ck_group();
        }
    }

    function loadCatalogFile(e) {
        API.widgets.load(e.target.getAttribute('load'), function(widget) {
            platform.add(widget);
            API.dialog.hide();
        });
    }

    function updateCatalog(files) {
        let table = UI.catalogList,
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
                    CATALOG.rename(name, `${newname}${ext}`, then => {
                        CATALOG.refresh();
                    });
                }
            };

            load.setAttribute('load', name);
            load.setAttribute('title', `file: ${name}\nvertices: ${file.v}\ndate: ${date}`);
            load.onclick = loadCatalogFile;
            load.appendChild(DOC.createTextNode(short));

            del.setAttribute('del', name);
            del.setAttribute('title', "remove '"+name+"'");
            del.onclick = () => { CATALOG.deleteFile(name) };
            del.innerHTML = '<i class="far fa-trash-alt"></i>';

            size.setAttribute("disabled", true);
            size.setAttribute("class", "label");
            size.appendChild(DOC.createTextNode(BASE.util.comma(file.v)));

            row.setAttribute("class", "f-row a-center");
            row.appendChild(renm);
            row.appendChild(load);
            row.appendChild(size);
            row.appendChild(del);
            table.appendChild(row);
        }
    }

    function isMultiHead() {
        let dev = API.conf.get().device;
        return isNotBelt() && dev.extruders && dev.extruders.length > 1;
    }

    function isBelt() {
        return UI.deviceBelt.checked;
    }

    function isNotBelt() {
        return !isBelt();
    }

    function isDanger() {
        return UI.danger.checked;
    }

    // MAIN INITIALIZATION FUNCTION

    function init_one() {
        API.event.emit('init.one');

        // ensure we have settings from last session
        API.conf.restore();

        let container = $('container'),
            welcome = $('welcome'),
            gcode = $('dev-gcode'),
            tracker = $('tracker'),
            controller = settings().controller;

        UC.setHoverPop(false);

        WIN.addEventListener("resize", () => {
            API.event.emit('resize');
        });

        API.event.on('resize', () => {
            if (WIN.innerHeight < 800) {
                UI.modalBox.classList.add('mh85');
            } else {
                UI.modalBox.classList.remove('mh85');
            }
            API.view.update_slider();
        });

        SPACE.showSkyGrid(false);
        SPACE.setSkyColor(controller.dark ? 0 : 0xffffff);
        SPACE.init(container, function (delta) {
            if (API.var.layer_max === 0 || !delta) return;
            if (controller.reverseZoom) delta = -delta;
            let same = API.var.layer_hi === API.var.layer_lo;
            let track = API.var.layer_lo > 0;
            if (delta > 0) {
                API.var.layer_hi = Math.max(same ? 0 : API.var.layer_lo, API.var.layer_hi - 1);
                if (track) {
                    API.var.layer_lo = Math.max(0, API.var.layer_lo - 1);
                }
            } else if (delta < 0) {
                API.var.layer_hi = Math.min(API.var.layer_max, API.var.layer_hi + 1);
                if (track) {
                    API.var.layer_lo = Math.min(API.var.layer_hi, API.var.layer_lo + 1);
                }
            }
            if (same) {
                API.var.layer_lo = API.var.layer_hi;
            }
            API.view.update_slider();
            API.show.slices();
        }, controller.ortho);
        SPACE.platform.onMove(API.conf.save);
        SPACE.platform.setRound(true);
        SPACE.useDefaultKeys(API.feature.on_key === undefined || API.feature.on_key_defaults);

        Object.assign(UI, {
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
                search:         $('dev-search'),
                filter:         $('dev-filter')
            },

            fps:                $('fps'),
            load:               $('load-file'),
            speeds:             $('speeds'),
            speedbar:           $('speedbar'),
            context:            $('context-menu'),

            back:               $('lt-back'),
            trash:              $('lt-trash'),
            ltsetup:            $('lt-setup'),
            ltfile:             $('lt-file'),
            ltview:             $('lt-view'),
            ltact:              $('act-slice'),
            rotate:             $('lt-rotate'),
            scale:              $('lt-scale'),
            nozzle:             $('lt-nozzle'),
            render:             $('lt-render'),

            modal:              $('modal'),
            modalBox:           $('modal-box'),
            help:               $('mod-help'),
            setup:              $('mod-setup'),
            tools:              $('mod-tools'),
            prefs:              $('mod-prefs'),
            files:              $('mod-files'),
            saves:              $('mod-saves'),
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

            device:           UC.newGroup(LANG.dv_gr_dev, $('device1'), {group:"ddev", inline:true, class:"noshow"}),
            deviceName:       UC.newInput(LANG.dv_name_s, {title:LANG.dv_name_l, size:"65%", text:true, action:updateDeviceName}),
            bedWidth:         UC.newInput(LANG.dv_bedw_s, {title:LANG.dv_bedw_l, convert:UC.toFloat, size:6, units:true, round:2}),
            bedDepth:         UC.newInput(LANG.dv_bedd_s, {title:LANG.dv_bedd_l, convert:UC.toFloat, size:6, units:true, round:2}),
            maxHeight:        UC.newInput(LANG.dv_bedh_s, {title:LANG.dv_bedh_l, convert:UC.toFloat, size:6, modes:FDM_SLA}),
            spindleMax:       UC.newInput(LANG.dv_spmx_s, {title:LANG.dv_spmx_l, convert:UC.toInt, size: 6, modes:CAM}),
            deviceOrigin:     UC.newBoolean(LANG.dv_orgc_s, onBooleanClick, {title:LANG.dv_orgc_l, modes:FDM_LASER_SLA}),
            deviceRound:      UC.newBoolean(LANG.dv_bedc_s, onBooleanClick, {title:LANG.dv_bedc_l, modes:FDM, trigger:true, show:isNotBelt}),
            deviceBelt:       UC.newBoolean(LANG.dv_belt_s, onBooleanClick, {title:LANG.dv_belt_l, modes:FDM, trigger:true, show:() => !UI.deviceRound.checked}),
            fwRetract:        UC.newBoolean(LANG.dv_retr_s, onBooleanClick, {title:LANG.dv_retr_l, modes:FDM}),

            extruder:         UC.newGroup(LANG.dv_gr_ext, $('device2'), {group:"dext", inline:true, modes:FDM}),
            extFilament:      UC.newInput(LANG.dv_fila_s, {title:LANG.dv_fila_l, convert:UC.toFloat, modes:FDM}),
            extNozzle:        UC.newInput(LANG.dv_nozl_s, {title:LANG.dv_nozl_l, convert:UC.toFloat, modes:FDM}),
            extOffsetX:       UC.newInput(LANG.dv_exox_s, {title:LANG.dv_exox_l, convert:UC.toFloat, modes:FDM}),
            extOffsetY:       UC.newInput(LANG.dv_exoy_s, {title:LANG.dv_exoy_l, convert:UC.toFloat, modes:FDM}),
            extSelect:        UC.newText(LANG.dv_exts_s, {title:LANG.dv_exts_l, modes:FDM, size:14, height:3, modes:FDM, area:gcode}),
            extDeselect:      UC.newText(LANG.dv_dext_s, {title:LANG.dv_dext_l, modes:FDM, size:14, height:3, modes:FDM, area:gcode}),
            extActions:       UC.newRow([
                UI.extPrev = UC.newButton(undefined, undefined, {icon:'<i class="fas fa-less-than"></i>'}),
                UI.extAdd = UC.newButton(undefined, undefined, {icon:'<i class="fas fa-plus"></i>'}),
                UI.extDel = UC.newButton(undefined, undefined, {icon:'<i class="fas fa-minus"></i>'}),
                UI.extNext = UC.newButton(undefined, undefined, {icon:'<i class="fas fa-greater-than"></i>'})
            ], {modes:FDM, class:"dev-buttons ext-buttons"}),

            gcode:            UC.newGroup(LANG.dv_gr_out, $('device2'), {group:"dgco", inline:true, modes:CAM_LASER}),
            gcodeSpace:       UC.newBoolean(LANG.dv_tksp_s, onBooleanClick, {title:LANG.dv_tksp_l, modes:CAM_LASER}),
            gcodeStrip:       UC.newBoolean(LANG.dv_strc_s, onBooleanClick, {title:LANG.dv_strc_l, modes:CAM}),
            gcodeFExt:        UC.newInput(LANG.dv_fext_s, {title:LANG.dv_fext_l, modes:CAM_LASER, size:7, text:true}),

            gcodeEd:          UC.newGroup(LANG.dv_gr_gco, $('dg'), {group:"dgcp", inline:true, modes:GCODE}),
            gcodeMacros:      UC.newRow([
                (UI.gcodePre = UC.newGCode(LANG.dv_head_s, {title:LANG.dv_head_l, modes:GCODE, area:gcode})).button,
                (UI.gcodePost = UC.newGCode(LANG.dv_foot_s, {title:LANG.dv_foot_l, modes:GCODE, area:gcode})).button,
                (UI.gcodeFan = UC.newGCode(LANG.dv_fanp_s, {title:LANG.dv_fanp_l, modes:FDM, area:gcode})).button,
                (UI.gcodeTrack = UC.newGCode(LANG.dv_prog_s, {title:LANG.dv_prog_l, modes:FDM, area:gcode})).button,
                (UI.gcodeLayer = UC.newGCode(LANG.dv_layr_s, {title:LANG.dv_layr_l, modes:FDM, area:gcode})).button,
                (UI.gcodePause = UC.newGCode(LANG.dv_paus_s, {title:LANG.dv_paus_l, modes:FDM, area:gcode})).button,
                (UI.gcodeExt = UC.newGCode(LANG.dv_pext_s, {title:LANG.dv_pext_l, modes:FDM, area:gcode, show:isDanger})).button,
                (UI.gcodeInt = UC.newGCode(LANG.dv_pint_s, {title:LANG.dv_pint_l, modes:FDM, area:gcode, show:isDanger})).button,
                (UI.gcodeLaserOn = UC.newGCode(LANG.dv_lzon_s, {title:LANG.dv_lzon_l, modes:LASER, area:gcode})).button,
                (UI.gcodeLaserOff = UC.newGCode(LANG.dv_lzof_s, {title:LANG.dv_lzof_l, modes:LASER, area:gcode})).button,
                (UI.gcodeChange = UC.newGCode(LANG.dv_tool_s, {title:LANG.dv_tool_l, modes:CAM, area:gcode})).button,
                (UI.gcodeDwell = UC.newGCode(LANG.dv_dwll_s, {title:LANG.dv_dwll_l, modes:CAM, area:gcode})).button,
                (UI.gcodeSpindle = UC.newGCode(LANG.dv_sspd_s, {title:LANG.dv_sspd_l, modes:CAM, area:gcode})).button
            ], {class:"ext-buttons f-row gcode-macros"}),

            lprefs:           UC.newGroup(LANG.op_menu, $('prefs-gen1'), {inline: true}),
            reverseZoom:      UC.newBoolean(LANG.op_invr_s, booleanSave, {title:LANG.op_invr_l}),
            ortho:            UC.newBoolean(LANG.op_orth_s, booleanSave, {title:LANG.op_orth_l}),
            dark:             UC.newBoolean(LANG.op_dark_s, booleanSave, {title:LANG.op_dark_l}),
            devel:            UC.newBoolean(LANG.op_devl_s, booleanSave, {title:LANG.op_devl_l}),
            danger:           UC.newBoolean(LANG.op_dang_s, booleanSave, {title:LANG.op_dang_l}),

            lprefs:           UC.newGroup(LANG.op_disp, $('prefs-gen2'), {inline: true}),
            showOrigin:       UC.newBoolean(LANG.op_shor_s, booleanSave, {title:LANG.op_shor_l}),
            showRulers:       UC.newBoolean(LANG.op_shru_s, booleanSave, {title:LANG.op_shru_l}),
            showSpeeds:       UC.newBoolean(LANG.op_sped_s, speedSave, {title:LANG.op_sped_l}),
            decals:           UC.newBoolean(LANG.op_decl_s, booleanSave, {title:LANG.op_decl_s}),
            lineType:         UC.newSelect(LANG.op_line_s, {title: LANG.op_line_l, action: lineTypeSave, modes:FDM}, "linetype"),
            animesh:          UC.newSelect(LANG.op_anim_s, {title: LANG.op_anim_l, action: aniMeshSave, modes:CAM}, "animesh"),
            units:            UC.newSelect(LANG.op_unit_s, {title: LANG.op_unit_l, action: unitsSave, modes:CAM, trace:true}, "units"),

            layout:           UC.newGroup(LANG.lo_menu, $('prefs-lay'), {inline: true}),
            autoSave:         UC.newBoolean(LANG.op_save_s, booleanSave, {title:LANG.op_save_l}),
            autoLayout:       UC.newBoolean(LANG.op_auto_s, booleanSave, {title:LANG.op_auto_l}),
            freeLayout:       UC.newBoolean(LANG.op_free_s, booleanSave, {title:LANG.op_free_l}),
            spaceLayout:      UC.newInput(LANG.op_spcr_s, {title:LANG.op_spcr_l, convert:UC.toFloat, size:3, units:true}),

            export:           UC.newGroup(LANG.xp_menu, $('prefs-xpo'), {inline: true}),
            exportOcto:       UC.newBoolean(`OctoPrint`, booleanSave),
            exportGhost:      UC.newBoolean(`Grid:Host`, booleanSave),
            exportLocal:      UC.newBoolean(`Grid:Local`, booleanSave),
            exportPreview:    UC.newBoolean(`Code Preview`, booleanSave),

            parts:            UC.newGroup(LANG.pt_menu, $('prefs-prt'), {inline: true}),
            detail:           UC.newSelect(LANG.pt_qual_s, {title: LANG.pt_qual_l, action: detailSave}, "detail"),
            decimate:         UC.newBoolean(LANG.pt_deci_s, booleanSave, {title: LANG.pt_deci_l}),
            healMesh:         UC.newBoolean(LANG.pt_heal_s, booleanSave, {title: LANG.pt_heal_l}),

            prefadd:          UC.checkpoint($('prefs-add')),

            process:             UC.newGroup(LANG.sl_menu, $('settings'), {modes:FDM_LASER}),
            sliceHeight:         UC.newInput(LANG.sl_lahi_s, {title:LANG.sl_lahi_l, convert:UC.toFloat, modes:FDM}),
            sliceMinHeight:      UC.newInput(LANG.ad_minl_s, {title:LANG.ad_minl_l, bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM, show: () => UI.sliceAdaptive.checked}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceShells:         UC.newInput(LANG.sl_shel_s, {title:LANG.sl_shel_l, convert:UC.toFloat, modes:FDM}),
            sliceLineWidth:      UC.newInput(LANG.sl_line_s, {title:LANG.sl_line_l, convert:UC.toFloat, bound:UC.bound(0,5), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceTopLayers:      UC.newInput(LANG.sl_ltop_s, {title:LANG.sl_ltop_l, convert:UC.toInt, modes:FDM}),
            sliceSolidLayers:    UC.newInput(LANG.sl_lsld_s, {title:LANG.sl_lsld_l, convert:UC.toInt, modes:FDM}),
            sliceBottomLayers:   UC.newInput(LANG.sl_lbot_s, {title:LANG.sl_lbot_l, convert:UC.toInt, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceAdaptive:       UC.newBoolean(LANG.ad_adap_s, onBooleanClick, {title: LANG.ad_adap_l, modes:FDM, trigger: true}),
            detectThinWalls:     UC.newBoolean(LANG.ad_thin_s, onBooleanClick, {title: LANG.ad_thin_l, modes:FDM}),

            laserOffset:         UC.newInput(LANG.ls_offs_s, {title:LANG.ls_offs_l, convert:UC.toFloat, modes:LASER}),
            laserSliceHeight:    UC.newInput(LANG.ls_lahi_s, {title:LANG.ls_lahi_l, convert:UC.toFloat, modes:LASER, trigger: true}),
            laserSliceHeightMin: UC.newInput(LANG.ls_lahm_s, {title:LANG.ls_lahm_l, convert:UC.toFloat, modes:LASER, show:() => { return UI.laserSliceHeight.value == 0 }}),
            laserSliceSingle:    UC.newBoolean(LANG.ls_sngl_s, onBooleanClick, {title:LANG.ls_sngl_l, modes:LASER}),

            firstLayer:          UC.newGroup(LANG.fl_menu, null, {modes:FDM}),
            firstSliceHeight:    UC.newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:UC.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerNozzleTemp:UC.newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:UC.toInt, modes:FDM, show:isNotBelt}),
            firstLayerBedTemp:   UC.newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:UC.toInt, modes:FDM, show:isNotBelt}),
            firstLayerFanSpeed:  UC.newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:UC.toInt, bound:UC.bound(0,255), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerYOffset:   UC.newInput(LANG.fl_zoff_s, {title:LANG.fl_zoff_l, convert:UC.toFloat, modes:FDM, show:isBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerRate:      UC.newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:UC.toFloat, modes:FDM}),
            firstLayerFillRate:  UC.newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:UC.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            firstLayerLineMult:  UC.newInput(LANG.fl_sfac_s, {title:LANG.fl_sfac_l, convert:UC.toFloat, bound:UC.bound(0.5,2), modes:FDM, show:isNotBelt}),
            firstLayerPrintMult: UC.newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:UC.toFloat, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerBrim:      UC.newInput(LANG.fl_brim_s, {title:LANG.fl_brim_l, convert:UC.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimIn:    UC.newInput(LANG.fl_brin_s, {title:LANG.fl_brin_l, convert:UC.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimComb:  UC.newInput(LANG.fl_brco_s, {title:LANG.fl_brco_l, convert:UC.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimTrig:  UC.newInput(LANG.fl_brmn_s, {title:LANG.fl_brmn_l, convert:UC.toInt, modes:FDM, show:isBelt}),
            firstLayerBrimGap:   UC.newInput(LANG.fl_brgp_s, {title:LANG.fl_brgp_l, convert:UC.toFloat, modes:FDM, show:isBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isBelt}),
            firstLayerBeltLead:  UC.newInput(LANG.fl_bled_s, {title:LANG.fl_bled_l, convert:UC.toFloat, modes:FDM, show:isBelt}),
            firstLayerBeltBump:  UC.newInput(LANG.fl_blmp_s, {title:LANG.fl_blmp_l, convert:UC.toFloat, bound:UC.bound(0, 10), modes:FDM, show:isBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            outputBrimCount:     UC.newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:UC.toInt, modes:FDM, show:isNotBelt}),
            outputBrimOffset:    UC.newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:UC.toFloat, modes:FDM, show:isNotBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            outputRaftSpacing:   UC.newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:UC.toFloat, bound:UC.bound(0.0,3.0), modes:FDM, show: () => UI.outputRaft.checked && isNotBelt() }),
            outputRaft:          UC.newBoolean(LANG.fr_nabl_s, onBooleanClick, {title:LANG.fr_nabl_l, modes:FDM, trigger: true, show:isNotBelt}),

            fdmInfill:           UC.newGroup(LANG.fi_menu, $('settings'), {modes:FDM}),
            sliceFillType:       UC.newSelect(LANG.fi_type, {modes:FDM, trigger:true}, "infill"),
            sliceFillSparse:     UC.newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:UC.toFloat, bound:UC.bound(0.0,1.0), modes:FDM}),
            sliceFillRepeat:     UC.newInput(LANG.fi_rept_s, {title:LANG.fi_rept_l, convert:UC.toInt, bound:UC.bound(1,10), show:fillShow, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceFillOverlap:    UC.newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            sliceFillRate:       UC.newInput(LANG.ou_feed_s, {title:LANG.fi_rate_l, convert:UC.toInt, bound:UC.bound(0,300), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceFillAngle:      UC.newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:UC.toFloat, modes:FDM}),
            // sliceFillWidth:      UC.newInput(LANG.fi_wdth_s, {title:LANG.fi_wdth_l, convert:UC.toFloat, modes:FDM}),

            fdmSupport:          UC.newGroup(LANG.sp_menu, null, {modes:FDM, marker:false}),
            sliceSupportNozzle:  UC.newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, modes:FDM}, "extruders"),
            sliceSupportDensity: UC.newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:UC.toFloat, bound:UC.bound(0.0,1.0), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportSize:    UC.newInput(LANG.sp_size_s, {title:LANG.sp_size_l, bound:UC.bound(1.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportOffset:  UC.newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportGap:     UC.newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, bound:UC.bound(0,5), convert:UC.toInt, modes:FDM, show:isNotBelt}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportArea:    UC.newInput(LANG.sp_area_s, {title:LANG.sp_area_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportExtra:   UC.newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceSupportAngle:   UC.newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, bound:UC.bound(0.0,90.0), convert:UC.toFloat, modes:FDM, xshow:isNotBelt}),
            sliceSupportEnable:  UC.newBoolean(LANG.sp_auto_s, onBooleanClick, {title:LANG.sp_auto_l, modes:FDM, show:isNotBelt}),

            sliceSupportGen:     UC.newRow([
                UI.ssaGen = UC.newButton(LANG.sp_detect, onButtonClick, {class: "f-col grow a-center"})
            ], { modes: FDM, class: "ext-buttons f-row grow" }),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM, show:isNotBelt}),
            sliceSupportManual: UC.newRow([
                (UI.ssmAdd = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (UI.ssmDun = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (UI.ssmClr = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {modes:FDM, class:"ext-buttons f-row"}),

            camTabs:             UC.newGroup(LANG.ct_menu, null, {modes:CAM, marker:true}),
            camTabsWidth:        UC.newInput(LANG.ct_wdth_s, {title:LANG.ct_wdth_l, convert:UC.toFloat, bound:UC.bound(0.005,100), modes:CAM, units:true}),
            camTabsHeight:       UC.newInput(LANG.ct_hght_s, {title:LANG.ct_hght_l, convert:UC.toFloat, bound:UC.bound(0.005,100), modes:CAM, units:true}),
            camTabsDepth:        UC.newInput(LANG.ct_dpth_s, {title:LANG.ct_dpth_l, convert:UC.toFloat, bound:UC.bound(0.005,100), modes:CAM, units:true}),
            camTabsMidline:      UC.newBoolean(LANG.ct_midl_s, onBooleanClick, {title:LANG.ct_midl_l, modes:CAM}),
            camSep:              UC.newBlank({class:"pop-sep"}),
            camTabsManual: UC.newRow([
                (UI.tabAdd = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
                (UI.tabDun = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
                (UI.tabClr = UC.newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
            ], {modes:CAM, class:"ext-buttons f-row"}),

            camStock:            UC.newGroup(LANG.cs_menu, null, {modes:CAM, marker: true}),
            camStockX:           UC.newInput(LANG.cs_wdth_s, {title:LANG.cs_wdth_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM, units:true}),
            camStockY:           UC.newInput(LANG.cs_dpth_s, {title:LANG.cs_dpth_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM, units:true}),
            camStockZ:           UC.newInput(LANG.cs_hght_s, {title:LANG.cs_hght_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM, units:true}),
            camStockOffset:      UC.newBoolean(LANG.cs_offs_s, onBooleanClick, {title:LANG.cs_offs_l, modes:CAM}),
            camStockClipTo:      UC.newBoolean(LANG.cs_clip_s, onBooleanClick, {title:LANG.cs_clip_l, modes:CAM}),
            camSep:              UC.newBlank({class:"pop-sep"}),
            camStockOn:          UC.newBoolean(LANG.cs_offe_s, onBooleanClick, {title:LANG.cs_offe_l, modes:CAM}),

            camCommon:           UC.newGroup(LANG.cc_menu, null, {modes:CAM}),
            camZAnchor:          UC.newSelect(LANG.ou_zanc_s, {title: LANG.ou_zanc_l, action:zAnchorSave, modes:CAM, trace:true}, "zanchor"),
            camZOffset:          UC.newInput(LANG.ou_ztof_s, {title:LANG.ou_ztof_l, convert:UC.toFloat, modes:CAM, units:true}),
            camZBottom:          UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, modes:CAM, units:true, trigger: true}),
            camZThru:            UC.newInput(LANG.ou_ztru_s, {title:LANG.ou_ztru_l, convert:UC.toFloat, bound:UC.bound(0.0,100), modes:CAM, units:true, show:() => { return UI.camZBottom.value == 0 }}),
            camSep:              UC.newBlank({class:"pop-sep"}),
            camZClearance:       UC.newInput(LANG.ou_zclr_s, {title:LANG.ou_zclr_l, convert:UC.toFloat, bound:UC.bound(0.01,100), modes:CAM, units:true}),
            camSep:              UC.newBlank({class:"pop-sep"}),
            camFastFeedZ:        UC.newInput(LANG.cc_rzpd_s, {title:LANG.cc_rzpd_l, convert:UC.toFloat, modes:CAM, units:true}),
            camFastFeed:         UC.newInput(LANG.cc_rapd_s, {title:LANG.cc_rapd_l, convert:UC.toFloat, modes:CAM, units:true}),

            laserLayout:         UC.newGroup(LANG.lo_menu, null, {modes:LASER, group:"lz-lo"}),
            outputTileSpacing:   UC.newInput(LANG.ou_spac_s, {title:LANG.ou_spac_l, convert:UC.toInt, modes:LASER}),
            outputLaserMerged:   UC.newBoolean(LANG.ou_mrgd_s, onBooleanClick, {title:LANG.ou_mrgd_l, modes:LASER}),
            outputLaserGroup:    UC.newBoolean(LANG.ou_grpd_s, onBooleanClick, {title:LANG.ou_grpd_l, modes:LASER}),

            knife:               UC.newGroup(LANG.dk_menu, null, {modes:LASER, marker:true}),
            outputKnifeDepth:    UC.newInput(LANG.dk_dpth_s, {title:LANG.dk_dpth_l, convert:UC.toFloat, bound:UC.bound(0.0,5.0), modes:LASER}),
            outputKnifePasses:   UC.newInput(LANG.dk_pass_s, {title:LANG.dk_pass_l, convert:UC.toInt, bound:UC.bound(0,5), modes:LASER}),
            outputKnifeTip:      UC.newInput(LANG.dk_offs_s, {title:LANG.dk_offs_l, convert:UC.toFloat, bound:UC.bound(0.0,10.0), modes:LASER}),
            knifeSep:            UC.newBlank({class:"pop-sep", modes:LASER}),
            knifeOn:             UC.newBoolean(LANG.enable, onBooleanClick, {title:LANG.ou_drkn_l, modes:LASER}),

            output:              UC.newGroup(LANG.ou_menu, null, {modes:GCODE}),
            outputLaserPower:    UC.newInput(LANG.ou_powr_s, {title:LANG.ou_powr_l, convert:UC.toInt, bound:UC.bound(1,100), modes:LASER}),
            outputLaserSpeed:    UC.newInput(LANG.ou_sped_s, {title:LANG.ou_sped_l, convert:UC.toInt, modes:LASER}),
            outputLaserZColor:   UC.newBoolean(LANG.ou_layo_s, onBooleanClick, {title:LANG.ou_layo_l, modes:LASER, show:() => { return UI.outputLaserMerged.checked === false }}),
            outputLaserLayer:    UC.newBoolean(LANG.ou_layr_s, onBooleanClick, {title:LANG.ou_layr_l, modes:LASER}),

            outputTemp:          UC.newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:UC.toInt, modes:FDM}),
            outputBedTemp:       UC.newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:UC.toInt, modes:FDM}),
            outputFanSpeed:      UC.newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:UC.toInt, bound:UC.bound(0,255), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            outputFeedrate:      UC.newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:UC.toInt, modes:FDM}),
            outputFinishrate:    UC.newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:UC.toInt, modes:FDM}),
            outputSeekrate:      UC.newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:UC.toInt, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            outputShellMult:     UC.newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFillMult:      UC.newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputSparseMult:    UC.newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceShellOrder:     UC.newSelect(LANG.sl_ordr_s, {title:LANG.sl_ordr_l, modes:FDM}, "shell"),
            sliceLayerStart:     UC.newSelect(LANG.sl_strt_s, {title:LANG.sl_strt_l, modes:FDM}, "start"),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            outputLayerRetract:  UC.newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l, modes:FDM}),
            outputBeltFirst:     UC.newBoolean(LANG.ad_lbir_s, onBooleanClick, {title:LANG.ad_lbir_l, show: isBelt, modes:FDM}),
            camConventional:     UC.newBoolean(LANG.ou_conv_s, onBooleanClick, {title:LANG.ou_conv_l, modes:CAM}),
            camEaseDown:         UC.newBoolean(LANG.cr_ease_s, onBooleanClick, {title:LANG.cr_ease_l, modes:CAM}),
            camDepthFirst:       UC.newBoolean(LANG.ou_depf_s, onBooleanClick, {title:LANG.ou_depf_l, modes:CAM}),
            outputOriginBounds:  UC.newBoolean(LANG.or_bnds_s, onBooleanClick, {title:LANG.or_bnds_l, modes:LASER}),
            outputOriginCenter:  UC.newBoolean(LANG.or_cntr_s, onBooleanClick, {title:LANG.or_cntr_l, modes:CAM_LASER}),
            camOriginTop:        UC.newBoolean(LANG.or_topp_s, onBooleanClick, {title:LANG.or_topp_l, modes:CAM}),

            camExpert:           UC.newGroup(LANG.op_xprt_s, null, {group: "cam_expert", modes:CAM, marker: false}),
            camExpertFast:       UC.newBoolean(LANG.cx_fast_s, onBooleanClick, {title:LANG.cx_fast_l, modes:CAM, show: () => !UI.camTrueShadow.checked }),
            camTrueShadow:       UC.newBoolean(LANG.cx_true_s, onBooleanClick, {title:LANG.cx_true_l, modes:CAM, show: () => !UI.camExpertFast.checked }),

            advanced:            UC.newGroup(LANG.ad_menu, null, {modes:FDM}),
            outputRetractDist:   UC.newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:UC.toFloat, modes:FDM}),
            outputRetractSpeed:  UC.newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:UC.toInt, modes:FDM}),
            outputRetractWipe:   UC.newInput(LANG.ad_wpln_s, {title:LANG.ad_wpln_l, bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM}),
            outputRetractDwell:  UC.newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:UC.toInt, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            sliceSolidMinArea:   UC.newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:UC.toFloat, modes:FDM}),
            outputMinSpeed:      UC.newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, bound:UC.bound(5,200), convert:UC.toFloat, modes:FDM}),
            outputShortPoly:     UC.newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, bound:UC.bound(0,10000), convert:UC.toFloat, modes:FDM}),
            outputCoastDist:     UC.newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            zHopDistance:        UC.newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM}),
            arcTolerance:        UC.newInput(LANG.ad_arct_s, {title:LANG.ad_arct_l, bound:UC.bound(0,1.0), convert:UC.toFloat, modes:FDM, show:() => { return isDanger() && isNotBelt() }}),
            antiBacklash:        UC.newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, bound:UC.bound(0,3), convert:UC.toInt, modes:FDM}),
            fdmSep:              UC.newBlank({class:"pop-sep", modes:FDM}),
            outputPeelGuard:     UC.newInput(LANG.ag_peel_s, {title:LANG.ag_peel_l, convert:UC.toInt, modes:FDM, comma:true, show:isBelt}),
            gcodePauseLayers:    UC.newInput(LANG.ag_paws_s, {title:LANG.ag_paws_l, modes:FDM, comma:true, show:isNotBelt}),
            outputLoops:         UC.newInput(LANG.ag_loop_s, {title:LANG.ag_loop_l, convert:UC.toInt, bound:UC.bound(0,1000), modes:FDM, show:isBelt}),
            outputPurgeTower:    UC.newBoolean(LANG.ad_purg_s, onBooleanClick, {title:LANG.ad_purg_l, modes:FDM, show:isMultiHead}),

            // SLA
            slaProc:             UC.newGroup(LANG.sa_menu, null, {modes:SLA, group:"sla-slice"}),
            slaSlice:            UC.newInput(LANG.sa_lahe_s, {title:LANG.sa_lahe_l, convert:UC.toFloat, modes:SLA}),
            slaShell:            UC.newInput(LANG.sa_shel_s, {title:LANG.sa_shel_l, convert:UC.toFloat, modes:SLA}),
            slaOpenTop:          UC.newBoolean(LANG.sa_otop_s, onBooleanClick, {title:LANG.sa_otop_l, modes:SLA}),
            slaOpenBase:         UC.newBoolean(LANG.sa_obas_s, onBooleanClick, {title:LANG.sa_obas_l, modes:SLA}),

            // SLA
            slaOutput:           UC.newGroup(LANG.sa_layr_m, null, {modes:SLA, group:"sla-layers"}),
            slaLayerOn:          UC.newInput(LANG.sa_lton_s, {title:LANG.sa_lton_l, convert:UC.toFloat, modes:SLA}),
            slaLayerOff:         UC.newInput(LANG.sa_ltof_s, {title:LANG.sa_ltof_l, convert:UC.toFloat, modes:SLA}),
            slaPeelDist:         UC.newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:UC.toFloat, modes:SLA}),
            slaPeelLiftRate:     UC.newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:UC.toFloat, modes:SLA}),
            slaPeelDropRate:     UC.newInput(LANG.sa_pldr_s, {title:LANG.sa_pldr_l, convert:UC.toFloat, modes:SLA}),

            slaOutput:           UC.newGroup(LANG.sa_base_m, null, {modes:SLA, group:"sla-base"}),
            slaBaseLayers:       UC.newInput(LANG.sa_balc_s, {title:LANG.sa_balc_l, convert:UC.toInt, modes:SLA}),
            slaBaseOn:           UC.newInput(LANG.sa_lton_s, {title:LANG.sa_bltn_l, convert:UC.toFloat, modes:SLA}),
            slaBaseOff:          UC.newInput(LANG.sa_ltof_s, {title:LANG.sa_bltf_l, convert:UC.toFloat, modes:SLA}),
            slaBasePeelDist:     UC.newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:UC.toFloat, modes:SLA}),
            slaBasePeelLiftRate: UC.newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:UC.toFloat, modes:SLA}),

            slaFill:             UC.newGroup(LANG.sa_infl_m, null, {modes:SLA, group:"sla-infill"}),
            slaFillDensity:      UC.newInput(LANG.sa_ifdn_s, {title:LANG.sa_ifdn_l, convert:UC.toFloat, bound:UC.bound(0,1), modes:SLA}),
            slaFillLine:         UC.newInput(LANG.sa_iflw_s, {title:LANG.sa_iflw_l, convert:UC.toFloat, bound:UC.bound(0,5), modes:SLA}),

            slaSupport:          UC.newGroup(LANG.sa_supp_m, null, {modes:SLA, group:"sla-support"}),
            slaSupportLayers:    UC.newInput(LANG.sa_slyr_s, {title:LANG.sa_slyr_l, convert:UC.toInt, bound:UC.bound(5,100), modes:SLA}),
            slaSupportGap:       UC.newInput(LANG.sa_slgp_s, {title:LANG.sa_slgp_l, convert:UC.toInt, bound:UC.bound(3,30), modes:SLA}),
            slaSupportDensity:   UC.newInput(LANG.sa_sldn_s, {title:LANG.sa_sldn_l, convert:UC.toFloat, bound:UC.bound(0.01,0.9), modes:SLA}),
            slaSupportSize:      UC.newInput(LANG.sa_slsz_s, {title:LANG.sa_slsz_l, convert:UC.toFloat, bound:UC.bound(0.1,1), modes:SLA}),
            slaSupportPoints:    UC.newInput(LANG.sa_slpt_s, {title:LANG.sa_slpt_l, convert:UC.toInt, bound:UC.bound(3,10), modes:SLA}),
            slaSupportEnable:    UC.newBoolean(LANG.enable, onBooleanClick, {title:LANG.sl_slen_l, modes:SLA}),

            slaOutput:           UC.newGroup(LANG.sa_outp_m, null, {modes:SLA, group:"sla-first"}),
            slaFirstOffset:      UC.newInput(LANG.sa_opzo_s, {title:LANG.sa_opzo_l, convert:UC.toFloat, bound:UC.bound(0,1), modes:SLA}),
            slaAntiAlias:        UC.newSelect(LANG.sa_opaa_s, {title:LANG.sa_opaa_l, modes:SLA}, "antialias"),

            rangeGroup:    UC.newGroup("ranges", null, {modes:FDM, group:"ranges"}),
            rangeList:     UC.newRow([], {}),

            settingsGroup: UC.newGroup(LANG.se_menu, $('settings')),
            settingsTable: UC.newRow([ UI.settingsLoad = UC.newButton(LANG.se_load, settingsLoad) ]),
            settingsTable: UC.newRow([ UI.settingsSave = UC.newButton(LANG.se_save, settingsSave) ]),
            settingsSave: $('settingsSave'),
            settingsName: $('settingsName'),

            layers:        UC.setGroup($("layers")),
        });

        // override old style settings two-button menu
        UI.settingsGroup.onclick = settingsLoad;
        UI.settingsSave.onclick = () => {
            settingsSave(undefined, UI.settingsName.value);
        };

        function optSelected(sel) {
            let opt = sel.options[sel.selectedIndex];
            return opt ? opt.value : undefined;
        }

        function fillShow() {
            return optSelected(UI.sliceFillType) === 'linear';
        }

        function spindleShow() {
            return settings().device.spindleMax > 0;
        }

        // slider setup
        const slbar = 30;
        const slbar2 = slbar * 2;
        const slider = UI.sliderRange;
        const drag = { };

        function pxToInt(txt) {
            return txt ? parseInt(txt.substring(0,txt.length-2)) : 0;
        }

        function sliderUpdate() {
            let start = drag.low / drag.maxval;
            let end = (drag.low + drag.mid - slbar) / drag.maxval;
            API.event.emit('slider.pos', { start, end });
            API.var.layer_lo = Math.round(start * API.var.layer_max);
            API.var.layer_hi = Math.round(end * API.var.layer_max);
            API.show.layer();
            SPACE.scene.active();
        }

        function dragit(el, delta) {
            el.onmousedown = (ev) => {
                tracker.style.display = 'block';
                ev.stopPropagation();
                drag.width = slider.clientWidth;
                drag.maxval = drag.width - slbar2;
                drag.start = ev.screenX;
                drag.loat = drag.low = pxToInt(UI.sliderHold.style.marginLeft);
                drag.mdat = drag.mid = UI.sliderMid.clientWidth;
                drag.hiat = pxToInt(UI.sliderHold.style.marginRight);
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

        dragit(UI.sliderLo, (delta) => {
            let midval = drag.mdat - delta;
            let lowval = drag.loat + delta;
            if (midval < slbar || lowval < 0) {
                return;
            }
            UI.sliderHold.style.marginLeft = `${lowval}px`;
            UI.sliderMid.style.width = `${midval}px`;
            drag.low = lowval;
            drag.mid = midval;
            sliderUpdate();
        });
        dragit(UI.sliderMid, (delta) => {
            let loval = drag.loat + delta;
            let hival = drag.hiat - delta;
            if (loval < 0 || hival < 0) return;
            UI.sliderHold.style.marginLeft = `${loval}px`;
            UI.sliderHold.style.marginRight = `${hival}px`;
            drag.low = loval;
            sliderUpdate();
        });
        dragit(UI.sliderHi, (delta) => {
            let midval = drag.mdat + delta;
            let hival = drag.hiat - delta;
            if (midval < slbar || midval > drag.mdmax || hival < 0) return;
            UI.sliderMid.style.width = `${midval}px`;
            UI.sliderHold.style.marginRight = `${hival}px`;
            drag.mid = midval;
            sliderUpdate();
        });

        UI.sliderMin.onclick = () => {
            API.show.layer(0,0);
        }

        UI.sliderMax.onclick = () => {
            API.show.layer(API.var.layer_max,0);
        }

        UI.slider.onmouseover = (ev) => {
            API.event.emit('slider.label');
        };

        UI.slider.onmouseleave = (ev) => {
            if (!ev.buttons) API.event.emit('slider.unlabel');
        };

        UI.dev.search.onclick = (hide) => {
            let style = UI.dev.filter.style;
            if (style.display === 'flex' || hide === true) {
                style.display = '';
                deviceFilter = null;
                updateDeviceList();
            } else {
                style.display = 'flex';
                UI.dev.filter.focus();
                deviceFilter = UI.dev.filter.value.toLowerCase();
                updateDeviceList();
            }
        };

        UI.dev.filter.onkeyup = (ev) => {
            deviceFilter = UI.dev.filter.value.toLowerCase();
            updateDeviceList();
        };

        UI.dev.filter.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        };

        API.event.on('slider.unlabel', (values) => {
        });

        API.event.on('slider.label', (values) => {
            let digits = API.var.layer_max.toString().length;
            $('slider-zero').style.width = `${digits}em`;
            $('slider-max').style.width = `${digits}em`;
            $('slider-zero').innerText = API.var.layer_lo;
            $('slider-max').innerText = API.var.layer_hi;
        });

        API.event.on('slider.set', (values) => {
            let width = slider.clientWidth;
            let maxval = width - slbar2;
            let start = Math.max(0, Math.min(1, values.start));
            let end = Math.max(start, Math.min(1, values.end));
            let lowval = start * maxval;
            let midval = ((end - start) * maxval) + slbar;
            let hival = maxval - end * maxval;
            UI.sliderHold.style.marginLeft = `${lowval}px`;
            UI.sliderMid.style.width = `${midval}px`;
            UI.sliderHold.style.marginRight = `${hival}px`;
        });

        // store layer preferences
        API.event.on('stack.show', label => {
            let mode = API.mode.get();
            let view = API.view.get();
            API.conf.get().labels[`${mode}-${view}-${label}`] = true;
        });

        API.event.on('stack.hide', label => {
            let mode = API.mode.get();
            let view = API.view.get();
            API.conf.get().labels[`${mode}-${view}-${label}`] = false;
        });

        // bind language choices
        $('lset-en').onclick = function() {
            SDB.setItem('kiri-lang', 'en-us');
            API.space.reload();
        };
        $('lset-da').onclick = function() {
            SDB.setItem('kiri-lang', 'da-dk');
            API.space.reload();
        };
        $('lset-de').onclick = function() {
            SDB.setItem('kiri-lang', 'de-de');
            API.space.reload();
        };
        $('lset-fr').onclick = function() {
            SDB.setItem('kiri-lang', 'fr-fr');
            API.space.reload();
        };
        $('lset-pl').onclick = function() {
            SDB.setItem('kiri-lang', 'pl-pl');
            API.space.reload();
        };
        $('lset-pt').onclick = function() {
            SDB.setItem('kiri-lang', 'pt-pt');
            API.space.reload();
        };
        $('lset-es').onclick = function() {
            SDB.setItem('kiri-lang', 'es-es');
            API.space.reload();
        };
        $('lset-zh').onclick = function() {
            SDB.setItem('kiri-lang', 'zh');
            API.space.reload();
        };

        SPACE.addEventHandlers(self, [
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
                xv = parseFloat(UI.sizeX.was),
                yv = parseFloat(UI.sizeY.was),
                zv = parseFloat(UI.sizeZ.was),
                ta = e.target,
                xc = UI.lockX.checked,
                yc = UI.lockY.checked,
                zc = UI.lockZ.checked,
                xt = ta === UI.sizeX,
                yt = ta === UI.sizeY,
                zt = ta === UI.sizeZ,
                tl = (xt && xc) || (yt && yc) || (zt && zc),
                xr = ((tl && xc) || (!tl && xt) ? ra : 1),
                yr = ((tl && yc) || (!tl && yt) ? ra : 1),
                zr = ((tl && zc) || (!tl && zt) ? ra : 1);
            API.selection.scale(xr,yr,zr);
            UI.sizeX.was = UI.sizeX.value = xv * xr;
            UI.sizeY.was = UI.sizeY.value = yv * yr;
            UI.sizeZ.was = UI.sizeZ.value = zv * zr;
        }

        function selectionScale(e) {
            let dv = parseFloat(e.target.value || 1),
                pv = parseFloat(e.target.was || 1),
                ra = dv / pv,
                xv = parseFloat(UI.scaleX.was),
                yv = parseFloat(UI.scaleY.was),
                zv = parseFloat(UI.scaleZ.was),
                ta = e.target,
                xc = UI.lockX.checked,
                yc = UI.lockY.checked,
                zc = UI.lockZ.checked,
                xt = ta === UI.scaleX,
                yt = ta === UI.scaleY,
                zt = ta === UI.scaleZ,
                tl = (xt && xc) || (yt && yc) || (zt && zc),
                xr = ((tl && xc) || (!tl && xt) ? ra : 1),
                yr = ((tl && yc) || (!tl && yt) ? ra : 1),
                zr = ((tl && zc) || (!tl && zt) ? ra : 1);
            API.selection.scale(xr,yr,zr);
            UI.scaleX.was = UI.scaleX.value = xv * xr;
            UI.scaleY.was = UI.scaleY.value = yv * yr;
            UI.scaleZ.was = UI.scaleZ.value = zv * zr;
        }

        function selectionRotate(e) {
            let deg = parseFloat(e.target.value) * DEG;
            e.target.value = 0;
            switch (e.target.id.split('').pop()) {
                case 'x': return API.selection.rotate(deg,0,0);
                case 'y': return API.selection.rotate(0,deg,0);
                case 'z': return API.selection.rotate(0,0,deg);
            }
        }

        SPACE.onEnterKey([
            UI.scaleX,        selectionScale,
            UI.scaleY,        selectionScale,
            UI.scaleZ,        selectionScale,
            UI.sizeX,         selectionSize,
            UI.sizeY,         selectionSize,
            UI.sizeZ,         selectionSize,
            UI.toolName,      updateTool,
            UI.toolNum,       updateTool,
            UI.toolFluteDiam, updateTool,
            UI.toolFluteLen,  updateTool,
            UI.toolShaftDiam, updateTool,
            UI.toolShaftLen,  updateTool,
            UI.toolTaperTip,  updateTool,
            $('rot_x'),       selectionRotate,
            $('rot_y'),       selectionRotate,
            $('rot_z'),       selectionRotate
        ], true);

        $('lab-axis').onclick = () => {
            UI.lockX.checked =
            UI.lockY.checked =
            UI.lockZ.checked = !(
                UI.lockX.checked ||
                UI.lockY.checked ||
                UI.lockZ.checked
            );
        };

        $('lab-scale').onclick = () => {
            API.selection.scale(1 / UI.scaleX.was, 1 / UI.scaleY.was, 1 / UI.scaleZ.was);
            UI.scaleX.value = UI.scaleY.value = UI.scaleZ.value =
            UI.scaleX.was = UI.scaleY.was = UI.scaleZ.was = 1;
        };

        let hpops = [];
        UC.hoverPop(UI.ltsetup, { group: hpops, target: $('set-pop') });
        UC.hoverPop(UI.ltfile,  { group: hpops, target: $('file-pop') });
        UC.hoverPop(UI.ltview,  { group: hpops, target: $('pop-view') });
        UC.hoverPop(UI.ltact,   { group: hpops, target: $('pop-slice') });
        UC.hoverPop(UI.render,  { group: hpops, target: $('pop-render'), sticky: false });
        UC.hoverPop(UI.rotate,  { group: hpops, target: $('pop-rotate'), sticky: true });
        UC.hoverPop(UI.scale,   { group: hpops, target: $('pop-scale'), sticky: true });
        UC.hoverPop(UI.nozzle,  { group: hpops, target: $('pop-nozzle'), sticky: true });
        UC.hoverPop($('app-acct'), { group: hpops, target: $('acct-pop') } );
        UC.hoverPop($('app-mode'), { group: hpops, target: $('mode-info') } );
        UC.hoverPop($('app-name'), { group: hpops, target: $('app-info') } );

        UC.onBlur([
            UI.toolName,
            UI.toolNum,
            UI.toolFluteDiam,
            UI.toolFluteLen,
            UI.toolShaftDiam,
            UI.toolShaftLen,
            UI.toolTaperTip,
        ], updateTool);

        UI.toolMetric.onclick = updateTool;
        UI.toolType.onchange = updateTool;
        // default show gcode pre
        UI.gcodePre.button.click();

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

        $('mode-fdm').appendChild(mksvg(icons.fdm));
        $('mode-sla').appendChild(mksvg(icons.sla));
        $('mode-cam').appendChild(mksvg(icons.cnc));
        $('mode-laser').appendChild(mksvg(icons.laser));

        API.platform.update_size();

        SPACE.mouse.onHover((int, event, ints) => {
            if (!API.feature.hover) return;
            if (!int) return API.feature.hovers || API.widgets.meshes();
            API.event.emit('mouse.hover', {int, ints, event, point: int.point, type: 'widget'});
        });

        SPACE.platform.onHover((int, event) => {
            if (!API.feature.hover) return;
            if (int) API.event.emit('mouse.hover', {point: int, event, type: 'platform'});
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

        SPACE.mouse.up((event, int) => {
            // context menu
            if (event.button === 2) {
                let et = event.target;
                if (et.tagName != 'CANVAS' && et.id != 'context-menu') {
                    return;
                }
                let full = API.view.isArrange();
                for (let key of ["layflat","mirror","duplicate"]) {
                    $(`context-${key}`).disabled = !full;
                }
                let style = UI.context.style;
                style.display = 'flex';
                style.left = `${event.clientX-3}px`;
                style.top = `${event.clientY-3}px`;
                UI.context.onmouseleave = () => {
                    style.display = '';
                };
                event.preventDefault();
                event.stopPropagation();
                contextInt = int;
            }
        });

        SPACE.mouse.downSelect((int,event) => {
            if (API.feature.hover) {
                if (int) {
                    API.event.emit('mouse.hover.down', {int, point: int.point});
                    return;
                }
                return;
            }
            // lay flat with meta or ctrl clicking a selected face
            if (int && (event.ctrlKey || event.metaKey || API.feature.on_face_select)) {
                let q = new THREE.Quaternion();
                // find intersecting point, look "up" on Z and rotate to face that
                q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                API.selection.rotate(q);
            }
            if (API.view.get() !== VIEWS.ARRANGE) {
                // return no selection in modes other than arrange
                return null;
            } else {
                // return selected meshes for further mouse processing
                return API.feature.hovers || API.selection.meshes();
            }
        });

        SPACE.mouse.upSelect(function(object, event) {
            if (event && API.feature.hover) {
                API.event.emit('mouse.hover.up', { object, event });
                return;
            }
            if (event && event.target.nodeName === "CANVAS") {
                if (object && object.object) {
                    if (object.object.widget) {
                        platform.select(object.object.widget, event.shiftKey);
                    }
                } else {
                    platform.deselect();
                }
            } else {
                return API.feature.hovers || API.widgets.meshes();
            }
        });

        SPACE.mouse.onDrag(function(delta) {
            if (API.feature.hover) {
                return;
            }
            if (delta && UI.freeLayout.checked) {
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
                API.selection.move(delta.x, delta.y, 0);
                API.event.emit('selection.drag', delta);
            } else {
                return API.selection.meshes().length > 0;
            }
        });

        API.space.restore(init_two) || checkSeed(init_two) || init_two();

    };

    // SECOND STAGE INIT AFTER UI RESTORED

    function init_two() {
        API.event.emit('init.two');

        // API.space.set_focus();

        // call driver initializations, if present
        Object.values(KIRI.driver).forEach(driver => {
            if (driver.init) try {
                driver.init(KIRI, API);
            } catch (error) {
                console.log({driver_init_fail: driver, error})
            }
        });

        // load script extensions
        if (SETUP.s) SETUP.s.forEach(function(lib) {
            let scr = DOC.createElement('script');
            scr.setAttribute('defer',true);
            scr.setAttribute('src',`/code/${lib}.js?${KIRI.version}`);
            DOC.body.appendChild(scr);
            STATS.add('load_'+lib);
            API.event.emit('load.lib', lib);
        });

        // load CSS extensions
        if (SETUP.ss) SETUP.ss.forEach(function(style) {
            style = style.charAt(0) === '/' ? style : `/kiri/style-${style}`;
            let ss = DOC.createElement('link');
            ss.setAttribute("type", "text/css");
            ss.setAttribute("rel", "stylesheet");
            ss.setAttribute("href", `${style}.css?${KIRI.version}`);
            DOC.body.appendChild(ss);
        });

        // override stored settings
        if (SETUP.v) SETUP.v.forEach(function(kv) {
            kv = kv.split('=');
            SDB.setItem(kv[0],kv[1]);
        });

        // import octoprint settings
        if (SETUP.ophost) {
            let ohost = API.const.OCTO = {
                host: SETUP.ophost[0],
                apik: SETUP.opkey ? SETUP.opkey[0] : ''
            };
            SDB['octo-host'] = ohost.host;
            SDB['octo-apik'] = ohost.apik;
            console.log({octoprint:ohost});
        }

        // bind this to UI so main can call it on settings import
        UI.sync = function() {
            const current = settings();
            const control = current.controller;
            const process = settings.process;

            platform.deselect();
            CATALOG.addFileListener(updateCatalog);
            SPACE.view.setZoom(control.reverseZoom, control.zoomSpeed);
            SPACE.platform.setZOff(0.2);

            // restore UI state from settings
            UI.showOrigin.checked = control.showOrigin;
            UI.showRulers.checked = control.showRulers;
            UI.showSpeeds.checked = control.showSpeeds;
            UI.freeLayout.checked = control.freeLayout;
            UI.autoLayout.checked = control.autoLayout;
            UI.reverseZoom.checked = control.reverseZoom;
            UI.autoSave.checked = control.autoSave;
            UI.decimate.checked = control.decimate;
            UI.healMesh.checked = control.healMesh;
            UI.ortho.checked = control.ortho;
            UI.devel.checked = control.devel;
            lineTypeSave();
            detailSave();
            updateFPS();

            // optional set-and-lock mode (hides mode menu)
            let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

            // optional set-and-lock device (hides device menu)
            let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

            // setup default mode and enable mode locking, if set
            API.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);

            // fill device list
            updateDeviceList();

            // ensure settings has gcode
            selectDevice(DEVNAME || API.device.get());

            // update ui fields from settings
            API.view.update_fields();

            // default to ARRANGE view mode
            API.view.set(VIEWS.ARRANGE);

            // add ability to override
            API.show.controls(API.feature.controls);

            // update everything dependent on the platform size
            platform.update_size();
        };

        UI.sync();

        // clear alerts as they build up
        setInterval(API.event.alerts, 1000);

        // add hide-alerts-on-alert-click
        UI.alert.dialog.onclick = function() {
            API.event.alerts(true);
        };

        // enable modal hiding
        $('mod-x').onclick = API.modal.hide;

        if (!SETUP.s) console.log(`kiri | init main | ${KIRI.version}`);

        // send init-done event
        API.event.emit('init-done', STATS);

        // show gdpr if it's never been seen and we're not iframed
        if (!SDB.gdpr && WIN.self === WIN.top && !SETUP.debug) {
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
            SDB.gdpr = Date.now();
        };

        // lift curtain
        $('curtain').style.display = 'none';

        function showSetup() {
            API.modal.show('setup');
        }

        // bind interface action elements
        $('app-name').onclick = API.help.show;
        $('app-mode').onclick = (ev) => { ev.stopPropagation(); showSetup() };
        $('set-device').onclick = (ev) => { ev.stopPropagation(); showSetup() };
        $('set-tools').onclick = (ev) => { ev.stopPropagation(); showTools() };
        $('set-prefs').onclick = (ev) => { ev.stopPropagation(); API.modal.show('prefs') };
        UI.acct.help.onclick = (ev) => { ev.stopPropagation(); API.help.show() };
        UI.acct.export.onclick = (ev) => { ev.stopPropagation(); profileExport() };
        UI.acct.export.title = LANG.acct_xpo;
        $('file-recent').onclick = () => { API.modal.show('files') };
        $('file-import').onclick = (ev) => { API.event.import(ev) };
        UI.back.onclick = API.platform.layout;
        UI.trash.onclick = API.selection.delete;
        UI.func.slice.onclick = (ev) => { ev.stopPropagation(); API.function.slice() };
        UI.func.preview.onclick = (ev) => { ev.stopPropagation(); API.function.print() };
        UI.func.animate.onclick = (ev) => { ev.stopPropagation(); API.function.animate() };
        UI.func.export.onclick = (ev) => { ev.stopPropagation(); API.function.export() };
        $('view-arrange').onclick = API.platform.layout;
        $('view-top').onclick = SPACE.view.top;
        $('view-home').onclick = SPACE.view.home;
        $('view-clear').onclick = API.platform.clear;
        $('mode-fdm').onclick = () => { API.mode.set('FDM') };
        $('mode-sla').onclick = () => { API.mode.set('SLA') };
        $('mode-cam').onclick = () => { API.mode.set('CAM') };
        $('mode-laser').onclick = () => { API.mode.set('LASER') };
        $('unrotate').onclick = () => { API.widgets.for(w => w.unrotate()) };
        // rotation buttons
        let d = (Math.PI / 180) * 5;
        $('rot_x_lt').onclick = () => { API.selection.rotate(-d,0,0) };
        $('rot_x_gt').onclick = () => { API.selection.rotate( d,0,0) };
        $('rot_y_lt').onclick = () => { API.selection.rotate(0,-d,0) };
        $('rot_y_gt').onclick = () => { API.selection.rotate(0, d,0) };
        $('rot_z_lt').onclick = () => { API.selection.rotate(0,0, d) };
        $('rot_z_gt').onclick = () => { API.selection.rotate(0,0,-d) };
        // rendering options
        $('render-hide').onclick = () => { API.view.wireframe(false, 0, 0); };
        $('render-ghost').onclick = () => { API.view.wireframe(false, 0, 0.5); };
        $('render-wire').onclick = () => { API.view.wireframe(true, 0, 0.5); };
        $('render-solid').onclick = () => { API.view.wireframe(false, 0, 1); };
        // context menu
        $('context-export-stl').onclick = () => { objectsExport() };
        $('context-export-workspace').onclick = () => { profileExport(true) };
        $('context-clear-workspace').onclick = () => {
            API.view.set(VIEWS.ARRANGE);
            API.platform.clear();
            UI.context.onmouseleave();
        };
        $('context-duplicate').onclick = duplicateSelection;
        $('context-mirror').onclick = mirrorSelection;
        $('context-layflat').onclick = layFlat;
        $('context-setfocus').onclick = setFocus;

        UI.modal.onclick = API.modal.hide;
        UI.modalBox.onclick = (ev) => { ev.stopPropagation() };

        // add app name hover info
        $('app-info').innerText = KIRI.version;
        // show topline separator when iframed
        // try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { }

        // warn users they are running a beta release
        if (KIRI.beta && KIRI.beta > 0 && SDB.kiri_beta != KIRI.beta) {
            API.show.alert("this is a beta / development release");
            SDB.kiri_beta = KIRI.beta;
        }
    }

    // update static html elements with language overrides
    UI.lang = function() {
        for (let el of [...DOC.querySelectorAll("[lk]")]) {
            let key = el.getAttribute('lk');
            let val = LANG[key];
            if (val) {
                el.innerText = val;
            } else {
                console.log({missing_ln: key});
            }
        }
    };

    // if a language needs to load, the script is injected and loaded
    // first.  once this loads, or doesn't, the initialization begins
    let lang_load = false;
    let lang_set = undefined;
    let lang = SETUP.ln ? SETUP.ln[0] : SDB.getItem('kiri-lang') || KIRI.lang.get();

    // inject language script if not english
    if (lang && lang !== 'en' && lang !== 'en-us') {
        lang_set = lang;
        let map = KIRI.lang.map(lang);
        let scr = DOC.createElement('script');
        // scr.setAttribute('defer',true);
        scr.setAttribute('src',`/kiri/lang/${map}.js?${KIRI.version}`);
        (DOC.body || DOC.head).appendChild(scr);
        STATS.set('ll',lang);
        scr.onload = function() {
            lang_load = true;
            KIRI.lang.set(map);
            UI.lang();
            init_one();
        };
        scr.onerror = function(err) {
            console.log({language_load_error: err, lang})
            init_one();
        }
    }

    // set to browser default which will be overridden
    // by any future script loads (above)
    if (!lang_load) {
        KIRI.lang.set();
        UI.lang();
    }

    // schedule init_one to run after all page content is loaded
    // unless a languge script is loading first, in which case it
    // will call init once it's done (or failed)
    if (!lang_set) {
        if (document.readyState === 'loading') {
            SPACE.addEventListener(DOC, 'DOMContentLoaded', init_one);
        } else {
            // happens in debug mode when scripts are chain loaded
            init_one();
        }
    }

})();
