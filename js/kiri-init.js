/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_init = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (self.kiri.init) return;

    let KIRI = self.kiri,
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
        ROT = Math.PI/2,
        ROT5 = ROT / 9,
        ALL = [MODES.FDM, MODES.LASER, MODES.CAM],
        CAM = [MODES.CAM],
        FDM = [MODES.FDM],
        FDM_CAM = [MODES.CAM,MODES.FDM],
        FDM_LASER = [MODES.LASER,MODES.FDM],
        CAM_LASER = [MODES.LASER,MODES.CAM],
        LASER = [MODES.LASER],
        CATALOG = API.catalog,
        platform = API.platform,
        selection = API.selection,
        deviceLock = false,
        js2o = API.js2o,
        o2js = API.o2js,
        selectedTool = null,
        editTools = null,
        maxTool = 0;

    // extend KIRI API with local functions
    API.show.devices = showDevices;
    API.device.set = selectDevice;

    function settings() {
        return API.conf.get();
    }

    function checkSeed(then) {
        // skip sample object load in onshape (or any script postload)
        if (!SDB[SEED]) {
            SDB[SEED] = new Date().getTime();
            if (!SETUP.s && API.feature.seed) {
                platform.load_stl("/obj/cube.stl", function(vert) {
                    CATALOG.putFile("sample cube.stl", vert);
                    platform.compute_max_z();
                    SPACE.view.home();
                    setTimeout(API.space.save,500);
                    then();
                    API.help.show();
                });
                return true;
            }
        }
        return false;
    }

    function booleanSave() {
        let control = settings().controller;
        let isCompact = control.compact;
        let isDark = control.dark;
        control.expert = UI.expert.checked;
        control.showOrigin = UI.showOrigin.checked;
        control.autoLayout = UI.autoLayout.checked;
        control.freeLayout = UI.freeLayout.checked;
        control.alignTop = UI.alignTop.checked;
        control.reverseZoom = UI.reverseZoom.checked;
        control.compact = UI.compact.checked;
        control.dark = UI.dark.checked;
        SPACE.view.setZoom(control.reverseZoom, control.zoomSpeed);
        platform.layout();
        platform.update_stock();
        API.conf.save();
        // if compact mode changed, reload UI
        if (isCompact !== control.compact) {
            UC.setDefaults(isCompact);
            LOC.reload();
        }
        // if dark mode changed, reload UI
        if (isDark !== control.dark) {
            LOC.reload();
        }
        UC.setExpert(control.expert);
    }

    function onLayerToggle() {
        API.conf.update();
        API.show.slices();
    }

    function onBooleanClick() {
        API.conf.update();
        DOC.activeElement.blur();
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
                if (KIRI.work.isSlicing()) KIRI.work.restart();
                // kill any poppers in compact mode
                UC.hidePoppers();
                // hide layers menu
                UI.layers.style.display = 'none';
                break;
        }
        return false;
    }

    function keyDownHandler(evt) {
        if (API.modal.visible()) {
            return false;
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
                if (move > 0) moveSelection(-move, 0, 0);
                evt.preventDefault();
                break;
            case 39: // right arrow
                if (inputHasFocus()) return false;
                if (deg) API.selection.rotate(0, 0, deg);
                if (move > 0) moveSelection(move, 0, 0);
                evt.preventDefault();
                break;
            case 38: // up arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return API.show.layer(API.var.layer_at+1);
                if (deg) API.selection.rotate(deg, 0, 0);
                if (move > 0) moveSelection(0, move, 0);
                evt.preventDefault();
                break;
            case 40: // down arrow
                if (inputHasFocus()) return false;
                if (evt.metaKey) return API.show.layer(API.var.layer_at-1);
                if (deg) API.selection.rotate(-deg, 0, 0);
                if (move > 0) moveSelection(0, -move, 0);
                evt.preventDefault();
                break;
            case 65: // 'a' for select all
                if (evt.metaKey) {
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
                    log("settings saved");
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
        let handled = true,
            current = settings(),
            style, sel, i, m, bb,
            ncc = evt.charCode - 48;
        if (API.modal.visible() || inputHasFocus()) {
            return false;
        }
        switch (evt.charCode) {
            case cca('`'): API.show.slices(0); break;
            case cca('0'): API.show.slices(API.var.layer_max); break;
            case cca('1'): // toggle control left
                if (evt.ctrlKey) {
                    style = UI.ctrlLeft.style;
                    style.display = style.display === 'none' ? 'block' : 'none';
                } else {
                    API.show.slices(API.var.layer_max/10);
                }
                break;
            case cca('2'): // toggle control right
                if (evt.ctrlKey) {
                    style = UI.ctrlRight.style;
                    style.display = style.display === 'none' ? 'block' : 'none';
                } else {
                    API.show.slices(API.var.layer_max*2/10);
                }
                break;
            case cca('3'):
                if (evt.ctrlKey) {
                    style = !SPACE.platform.isHidden();
                    SPACE.platform.setHidden(style);
                    SPACE.platform.showGrid(!style);
                    SPACE.update();
                } else {
                    API.show.slices(API.var.layer_max*3/10);
                }
                break;
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
                if (confirm('clear all settings?')) {
                    SDB.clear();
                }
                break;
            case cca('C'): // refresh catalog
                CATALOG.refresh();
                break;
            case cca('i'): // single settings edit
                let v = prompt('edit "'+current.process.processName+'"', JSON.stringify(current.process));
                if (v) {
                    try {
                        current.process = JSON.parse(v);
                        API.view.update_fields();
                    } catch (e) {
                        console.log(e);
                        API.show.alert("invalid settings format");
                    }
                }
                break;
            case cca('U'): // full settings url
                storeSettingsToServer(true);
                break;
            case cca('u'): // full settings url
                loadSettingsFromServer(prompt("settings id to load"));
                break;
            case cca('s'): // complete slice
                API.function.slice();
                break;
            case cca('p'): // prepare print
                API.function.print();
                break;
            case cca('P'): // position widget
                positionSelection();
                break;
            case cca('R'): // position widget
                rotateInputSelection();
                break;
            case cca('x'): // export print
                API.function.export();
                break;
            case cca('e'): // devices
                showDevices();
                break;
            case cca('o'): // tools
                showTools();
                break;
            case cca('c'): // local devices
                API.show.local();
                break;
            case cca('v'): // toggle single slice view mode
                UI.layerRange.checked = !UI.layerRange.checked;
                API.show.slices();
                break;
            case cca('d'): // duplicate object
                sel = API.selection.meshes();
                platform.deselect();
                for (i=0; i<sel.length; i++) {
                    m = sel[i].clone();
                    m.geometry = m.geometry.clone();
                    m.material = m.material.clone();
                    bb = m.getBoundingBox();
                    let nw = API.widgets.new().loadGeometry(m.geometry);
                    nw.move(bb.max.x - bb.min.x + 1, 0, 0);
                    platform.add(nw,true);
                }
                break;
            case cca('m'): // mirror object
                API.selection.for_widgets(function(widget) {
                    widget.mirror();
                });
                SPACE.update();
                break;
            case cca('R'): // toggle slice render mode
                renderMode++;
                API.function.slice();
                break;
            case cca('a'): // auto arrange items on platform
                platform.layout();
                break;
            case cca('w'): // toggle wireframe on widgets
                API.view.wireframe(API.color.wireframe, API.color.wireframe_opacity);
                break;
            default:
                API.event.emit('keypress', evt);
                handled = false;
                break;
        }
        if (handled) evt.preventDefault();
        return false;
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
        let coord = prompt("Enter X,Y,Z degrees of rotation").split(','),
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

        moveSelection(x, y, z, true);
    }

    function loadSettingsFromServer(tok) {
        let hash = (tok || LOC.hash.substring(1)).split("/");
        if (hash.length === 2) {
            new moto.Ajax(function(reply) {
                if (reply) {
                    let res = JSON.parse(reply);
                    if (res && res.ver && res.rec) {
                        let set = JSON.parse(atob(res.rec));
                        set.id = res.space;
                        set.ver = res.ver;
                        API.conf.put(set);
                        API.event.settings();
                        LOC.hash = '';
                    }
                }
            }).request("/data/"+ hash[0] + "/" + hash[1]);
        }
    }

    function storeSettingsToServer(display) {
        let set = btoa(JSON.stringify(settings()));
        new moto.Ajax(function(reply) {
            if (reply) {
                let res = JSON.parse(reply);
                if (res && res.ver) {
                    LOC.hash = res.space + "/" + res.ver;
                    if (display) alert("unique settings id is: " + res.space + "/" + res.ver);
                }
            } else {
                updateSpaceState();
            }
        }).request("/data/"+ settings().id + "/" + settings().ver, set);
    }

    function settingsExport() {
        if (!confirm('Download Kiri:Moto Settings?')) return;
        let json = API.conf.export();
        let blob = new Blob([json], {type: "octet/stream"});
        let url = WIN.URL.createObjectURL(blob);
        $('help').innerHTML = `<a id="sexport" href="${url}" download="kiriconf.b64">x</a>`;
        $('sexport').click();
    }

    function settingsSave() {
        API.dialog.hide();
        let mode = API.mode.get(),
            s = settings(),
            def = "default",
            cp = s.process,
            pl = s.sproc[mode],
            // pt = sf[mode.toLowerCase()].p, // process field mask
            name = WIN.prompt("Save Settings As", cp ? cp.processName || def : def);
        if (!name) return;
        let np = pl[name] = {};
        cp.processName = name;
        for (let k in cp) {
            if (!cp.hasOwnProperty(k)) continue;
            // if (!pt.hasOwnProperty(k)) continue; // mask out invalid fields
            np[k] = cp[k];
        }
        s.cproc[API.mode.get()] = name;
        API.conf.save();
        API.event.settings();
    }

    function settingsLoad() {
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

    function isFavoriteDevice(devicename) {
        return settings().favorites[devicename] ? true : false;
    }

    function getSelectedDevice() {
        return UI.deviceSelect.options[UI.deviceSelect.selectedIndex].text;
    }

    function selectDevice(devicename, lock) {
        deviceLock = lock;
        if (lock) UI.setupDevices.style.display = 'none';
        if (isLocalDevice(devicename)) {
            setDeviceCode(settings().devices[devicename], devicename);
        } else {
            API.ajax("/kiri/filter/"+API.mode.get()+"/"+devicename, function(code) {
                setDeviceCode(code, devicename);
            });
        }
        $('selected-device').innerHTML = devicename;
    }

    // only for local filters
    function cloneDevice() {
        let name = `${getSelectedDevice()}.copy`;
        let code = API.clone(settings().device);
        code.mode = API.mode.get();
        putLocalDevice(name, code);
        setDeviceCode(code, name);
    }

    function setDeviceCode(code, devicename) {
        try {
            STATS.set(`ud_${API.mode.get_lower()}`, devicename);

            if (typeof(code) === 'string') code = js2o(code) || {};

            let mode = API.mode.get(),
                current = settings(),
                local = isLocalDevice(devicename),
                dproc = current.devproc[devicename],
                dev = current.device = CONF.device_from_code(code,mode),
                proc = current.process;

            proc.outputOriginCenter = dev.outputOriginCenter;
            UI.deviceName.value = devicename;
            UI.deviceOrigin.checked = proc.outputOriginCenter;

            // add extruder selection buttons
            if (dev.extruders) {
                let ext = API.lists.extruders = [];
                dev.internal = 0;
                let selext = $('sel-ext');
                selext.innerHTML = '';
                for (let i=dev.extruders.length-1; i>=0; i--) {
                    let b = DOC.createElement('button');
                    b.appendChild(DOC.createTextNode(i));
                    b.setAttribute('id', `sel-ext-${i}`);
                    b.onclick = function() {
                        API.selection.for_widgets(w => {
                            current.widget[w.id] = {extruder: i};
                            API.platform.update_selected();
                        });
                    };
                    selext.appendChild(b);
                    ext.push({id:i, name:i});
                }
            }

            if (mode === 'CAM') {
                proc.camOriginTop = dev.outputOriginTop;
            }
            // disable editing for non-local devices
            [
                UI.deviceName,
                UI.gcodePre,
                UI.gcodePost,
                UI.gcodePause,
                UI.bedDepth,
                UI.bedWidth,
                UI.maxHeight,
                UI.extrudeAbs,
                UI.deviceOrigin,
                UI.deviceOriginTop,
                UI.deviceRound,
                UI.gcodeFan,
                UI.gcodeTrack,
                UI.gcodeLayer,
                UI.extFilament,
                UI.extNozzle,
                UI.deviceMaxSpindle,
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

            // hide spindle fields when device doens't support it
            if (mode === 'CAM') [
                UI.extrudeAbs,
                UI.roughingSpindle,
                UI.finishingSpindle,
                UI.drillSpindle
            ].forEach(function(e) {
                e.parentNode.style.display = dev.spindleMax >= 0 ? 'none' : 'block';
            });

            UI.deviceSave.disabled = !local;
            UI.deviceDelete.disabled = !local;

            API.view.update_fields();
            platform.update_size();

            current.filter[mode] = devicename;
            current.cdev[mode] = dev;

            // restore last process associated with this device
            if (dproc) API.conf.load(null, dproc);

            API.conf.save();
        } catch (e) {
            console.log({error:e, device:code, devicename});
            API.show.alert(`invalid or deprecated device: "${devicename}"`, 10);
            API.show.alert(`please select a new device`, 10);
            showDevices();
        }
        API.function.clear();
        API.event.settings();
    }

    function renderDevices(devices) {
        UI.devices.onclick = UC.hidePop;
        UC.hidePop();

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

        UI.deviceClose.onclick = API.dialog.hide;
        UI.deviceSave.onclick = function() {
            API.function.clear();
            API.conf.save();
            showDevices();
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

        UI.deviceAll.onclick = function() {
            API.show.favorites(false);
            showDevices();
        };
        UI.deviceFavorites.onclick = function() {
            API.show.favorites(true);
            showDevices();
        };

        UI.deviceSelect.innerHTML = '';
        let incr = 0;
        let faves = API.show.favorites();
        let found = false;
        let first = devices[0];
        // run through the list up to twice forcing faves off
        // the second time if incr === 0 (no devices shown)
        // if incr > 0, second loop is avoided
        for (let rep=0; rep<2; rep++)
        if (incr === 0)
        devices.forEach(function(device, index) {
            // force faves off for second try
            if (rep === 1) faves = false;
            let fav = isFavoriteDevice(device),
                loc = isLocalDevice(device);
            if (faves && !(fav || loc)) {
                return;
            }
            if (incr === 0) {
                first = device;
            }
            let opt = DOC.createElement('option');
            opt.appendChild(DOC.createTextNode(device));
            opt.onclick = function() {
                selectDevice(device);
            };
            opt.ondblclick = function() {
                if (settings().favorites[device]) {
                    delete settings().favorites[device];
                    API.show.alert(`removed "${device}" from favorites`, 3);
                } else {
                    settings().favorites[device] = true;
                    API.show.alert(`added "${device}" to favorites`, 3);
                }
                showDevices();
            };
            // if (API.show.favorites()) {
                if (loc) opt.setAttribute("local", 1);
            // } else {
                if (loc || fav) opt.setAttribute("favorite", 1);
            // }
            UI.deviceSelect.appendChild(opt);
            if (device === selected) {
                selectedIndex = incr;
                found = true;
            }
            incr++;
        });

        if (selectedIndex >= 0) {
            UI.deviceSelect.selectedIndex = selectedIndex;
            selectDevice(selected);
        } else {
            UI.deviceSelect.selectedIndex = 0;
            selectDevice(first);
        }

        API.dialog.show('devices', true);
        API.dialog.update();

        UI.deviceSelect.focus();
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
            let shaft = tool.shaft_len || 1;
            let flute = tool.flute_len || 1;
            let tip_len = type === "ballmill" ? tool.flute_diam / 2 : 0;
            let total_len = shaft + flute + tip_len;
            let shaft_len = (shaft / total_len) * max.h;
            let flute_len = (flute / total_len) * max.h;
            let total_wid = Math.max(tool.flute_diam, tool.shaft_diam, total_len/4);
            let shaft_off = (max.w * (1 - (tool.shaft_diam / total_wid))) / 2;
            let flute_off = (max.w * (1 - (tool.flute_diam / total_wid))) / 2;
            let taper_off = (max.w * (1 - ((tool.taper_tip || 0) / total_wid))) / 2;
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
                parts.push({ rect: {
                    x:off.x + flute_off, y:off.y + shaft_len,
                    width:max.w - flute_off * 2, height:flute_len,
                    stroke, fill: flute_fill, stroke_width
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

        STATS.add('ua_get_tools');
    }

    function showDevices() {
        if (deviceLock) return;
        API.modal.hide();
        API.ajax("/api/filters-"+API.mode.get_lower(), function(flvalue) {
            if (!flvalue) return;
            renderDevices(js2o(flvalue));
            STATS.add('ua_get_devs');
        });
    }

    function dragOverHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
        SPACE.platform.setColor(0x00ff00);
    }

    function dragLeave() {
        SPACE.platform.setColor(0x555555);
    }

    function dropHandler(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        SPACE.platform.setColor(0x555555);

        let files = evt.dataTransfer.files,
            plate = files.length < 5 || confirm(`add ${files.length} objects to workspace?`),
            group = files.length < 2 ? undefined : confirm('group files?') ? [] : undefined;

        if (plate) API.platform.load_files(files,group);
    }

    function loadCatalogFile(e) {
        API.widgets.load(e.target.getAttribute('load'), function(widget) {
            platform.add(widget);
            API.dialog.hide();
        });
    }

    function deleteCatalogFile(e) {
        CATALOG.deleteFile(e.target.getAttribute('del'));
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
                load = DOC.createElement('button'),
                del = DOC.createElement('button'),
                file = list[i],
                name = file.n;

            load.setAttribute('load', name);
            load.setAttribute('title', 'file: '+name+'\nvertices: '+file.v);
            load.onclick = loadCatalogFile;
            load.appendChild(DOC.createTextNode(name.split('.')[0]));

            del.setAttribute('del', name);
            del.setAttribute('title', "remove '"+name+"'");
            del.onclick = deleteCatalogFile;
            del.appendChild(DOC.createTextNode('x'));

            row.setAttribute("class", "flow-row");
            row.appendChild(load);
            row.appendChild(del);
            table.appendChild(row);
        }
        // fix layer scroll size
        API.dialog.update();
    }

    // MAIN INITIALIZATION FUNCTION

    function init_one() {
        // ensure we have settings from last session
        API.conf.restore();

        let assets = $('assets'),
            control = $('control'),
            container = $('container'),
            welcome = $('welcome'),
            controller = settings().controller,
            compact = controller.compact,
            dark = controller.dark;

        WIN.addEventListener("resize", API.dialog.update);

        SPACE.showSkyGrid(false);
        SPACE.setSkyColor(dark ? 0 : 0xffffff);
        SPACE.init(container, function (delta) {
            if (API.var.layer_max === 0) return;
            if (settings().controller.reverseZoom) delta = -delta;
            if (delta > 0) API.var.layer_at--;
            else if (delta < 0) API.var.layer_at++;
            API.show.slices();
        });
        SPACE.platform.onMove(API.conf.save);
        SPACE.platform.setRound(true);

        UC.setCompact(compact);

        Object.assign(UI, {
            // from static HTML
            alert: {
                dialog:         $('alert-area'),
                text:           $('alert-text')
            },
            container:          container,
            assets:             assets,
            control:            control,
            ctrlLeft:           $('control-left'),
            ctrlRight:          $('control-right'),
            layerView:          $('layer-view'),
            layerSlider:        $('layer-slider'),
            modelOpacity:       $('opacity'),
            modal:              $('modal'),
            print:              $('print'),
            local:              $('local'),
            help:               $('help'),
            devices:            $('devices'),
            deviceAdd:          $('device-add'),
            deviceDelete:       $('device-del'),
            deviceSave:         $('device-save'),
            deviceClose:        $('device-close'),
            deviceSelect:       $('device-select'),
            deviceFavorites:    $('device-favorites'),
            deviceAll:          $('device-all'),
            tools:              $('tools'),
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
            catalog:            $('catalog'),
            catalogBody:        $('catalogBody'),
            catalogList:        $('catalogList'),
            settings:           $('settings'),
            settingsBody:       $('settingsBody'),
            settingsList:       $('settingsList'),
            layerID:            $('layer-id'),
            layerSpan:          $('layer-span'),
            layerRange:         $('layer-range'),
            loading:            $('loading').style,
            progress:           $('progress').style,
            prostatus:          $('prostatus'),
            selection:          $('selection'),
            selWidth:           $('sel_width'),
            selHeight:          $('sel_height'),
            selDepth:           $('sel_depth'),
            scaleX:             $('scale_x'),
            scaleY:             $('scale_y'),
            scaleZ:             $('scale_z'),
            scaleUniform:       $('scale_uni'),
            stock:              $('stock'),
            stockWidth:         $('stock-width'),
            stockDepth:         $('stock-width'),
            stockHeight:        $('stock-width'),

            device:           UC.newGroup(LANG.dv_gr_dev, $('device'), {group:"ddev", nocompact:true}),
            deviceName:       UC.newInput(LANG.dv_name_s, {title:LANG.dv_name_l, size:"60%", text:true}),
            bedWidth:         UC.newInput(LANG.dv_bedw_s, {title:LANG.dv_bedw_l, convert:UC.toInt}),
            bedDepth:         UC.newInput(LANG.dv_bedd_s, {title:LANG.dv_bedd_l, convert:UC.toInt}),
            maxHeight:        UC.newInput(LANG.dv_bedh_s, {title:LANG.dv_bedh_l, convert:UC.toInt, modes:FDM}),
            deviceMaxSpindle: UC.newInput(LANG.dv_spmx_s, {title:LANG.dv_spmx_l, convert:UC.toInt, modes:CAM}),
            deviceOrigin:     UC.newBoolean(LANG.dv_orgc_s, onBooleanClick, {title:LANG.dv_orgc_l}),
            deviceOriginTop:  UC.newBoolean(LANG.dv_orgt_s, onBooleanClick, {title:LANG.dv_orgt_l, modes:CAM}),
            deviceRound:      UC.newBoolean(LANG.dv_bedc_s, onBooleanClick, {title:LANG.dv_bedc_l, modes:FDM}),

            extruder:         UC.newGroup(LANG.dv_gr_ext, $('device'), {group:"dext", nocompact:true, modes:FDM}),
            extFilament:      UC.newInput(LANG.dv_fila_s, {title:LANG.dv_fila_l, convert:UC.toFloat, modes:FDM}),
            extNozzle:        UC.newInput(LANG.dv_nozl_s, {title:LANG.dv_nozl_l, convert:UC.toFloat, modes:FDM}),
            extOffsetX:       UC.newInput(LANG.dv_exox_s, {title:LANG.dv_exox_l, convert:UC.toFloat, modes:FDM, expert:true}),
            extOffsetY:       UC.newInput(LANG.dv_exoy_s, {title:LANG.dv_exoy_l, convert:UC.toFloat, modes:FDM, expert:true}),
            extSelect:        UC.newText(LANG.dv_exts_s, {title:LANG.dv_exts_l, modes:FDM, size:14, height:3, modes:FDM, expert:true}),
            extDeselect:      UC.newText(LANG.dv_extd_s, {title:LANG.dv_extd_l, modes:FDM, size:14, height:3, modes:FDM, expert:true}),
            extrudeAbs:       UC.newBoolean(LANG.dv_xtab_s, onBooleanClick, {title:LANG.dv_xtab_l, modes:FDM}),
            extActions:       UC.newTableRow([[
                UI.extPrev = UC.newButton("<"),
                UI.extAdd = UC.newButton("+"),
                UI.extDel = UC.newButton("-"),
                UI.extNext = UC.newButton(">")
            ]], {modes:FDM, expert:true}),

            gcode:            UC.newGroup(LANG.dv_gr_gco, $('device'), {group:"dgco", nocompact:true}),
            gcodeFan:         UC.newInput(LANG.dv_fanp_s, {title:LANG.dv_fanp_l, modes:FDM, size:"40%", text:true}),
            gcodeTrack:       UC.newInput(LANG.dv_prog_s, {title:LANG.dv_prog_l, modes:FDM, size:"40%", text:true}),
            gcodeLayer:       UC.newText(LANG.dv_layr_s, {title:LANG.dv_layr_l, modes:FDM, size:14, height: 2}),
            gcodeSpace:       UC.newBoolean(LANG.dv_tksp_s, null, {title:LANG.dv_tksp_l, modes:CAM_LASER}),
            gcodeStrip:       UC.newBoolean(LANG.dv_strc_s, null, {title:LANG.dv_strc_l, modes:CAM}),
            gcodeFExt:        UC.newInput(LANG.dv_fext_s, {title:LANG.dv_fext_l, modes:CAM_LASER, size:7, text:true}),
            gcodeDwell:       UC.newText(LANG.dv_dwll_s, {title:LANG.dv_dwll_l, modes:CAM, size:14, height:2}),
            gcodeChange:      UC.newText(LANG.dv_tool_s, {title:LANG.dv_tool_l, modes:CAM, size:14, height:2}),
            gcodeSpindle:     UC.newText(LANG.dv_sspd_s, {title:LANG.dv_sspd_l, modes:CAM, size:14, height:2}),
            gcodePause:       UC.newText(LANG.dv_paus_s, {title:LANG.dv_paus_l, modes:FDM, size:14, height:3}),
            gcodeLaserOn:     UC.newText(LANG.dv_lzon_s, {title:LANG.dv_lzon_l, modes:LASER, size:14, height:3}),
            gcodeLaserOff:    UC.newText(LANG.dv_lzof_s, {title:LANG.dv_lzof_l, modes:LASER, size:14, height:3}),
            gcodePre:         UC.newText(LANG.dv_head_s, {title:LANG.dv_head_l, modes:ALL, size:14, height:3}),
            gcodePost:        UC.newText(LANG.dv_foot_s, {title:LANG.dv_foot_l, modes:ALL, size:14, height:3}),

            mode: UC.newGroup(LANG.mo_menu, assets, {region:"left"}),
            modeTable: UC.newTableRow([
                [
                    UI.modeFDM =
                    UC.newButton(LANG.mo_fdmp, function() { API.mode.set('FDM',null,platform.update_size) }),
                ],[
                    UI.modeLASER =
                    UC.newButton(LANG.mo_lazr, function() { API.mode.set('LASER',null,platform.update_size) }),
                ],[
                    UI.modeCAM =
                    UC.newButton(LANG.mo_cncm, function() { API.mode.set('CAM',null,platform.update_size) }, {id:"modeCAM"}),
                ]
            ]),
            system: UC.newGroup(LANG.su_menu),
            sysTable: UC.newTableRow([
                [
                    UI.setupDevices =
                    UC.newButton(LANG.su_devi, showDevices)
                ],[
                    UI.setupTools =
                    UC.newButton(LANG.su_tool, showTools, {modes:CAM})
                ],[
                    UI.setupExport =
                    UC.newButton(LANG.su_xprt, settingsExport, {modes:ALL, expert:true})
                ],[
                    UI.localButton =
                    UC.newButton(LANG.su_locl, API.show.local, {modes:FDM_CAM, expert:true})
                ],[
                    UI.helpButton =
                    UC.newButton(LANG.su_help, API.help.show)
                ]
            ]),
            wsFunc: UC.newGroup(LANG.fn_menu),
            wsFuncTable: UC.newTableRow([
                [
                    UI.load =
                    UC.newButton(LANG.fn_impo, function() { API.event.import() }, {class:"asym"}),
                    UI.import =
                    UC.newButton("+", undefined, {class:"asym"})
                ],[
                    UI.modeArrange =
                    UC.newButton(LANG.fn_arra, platform.layout),
                ],[
                    UI.modeSlice =
                    UC.newButton(LANG.fn_slic, API.function.slice)
                ],[
                    UI.modePreview =
                    UC.newButton(LANG.fn_prev, API.function.print),
                ],[
                    UI.modeExport =
                    UC.newButton(LANG.fn_expo, API.function.export)
                ]
            ]),
            camera: UC.newGroup(LANG.vu_menu),
            camTable: UC.newTableRow([
                [
                    UC.newButton(LANG.vu_home, SPACE.view.home),
                    UC.newButton(LANG.vu_rset, SPACE.view.reset)
                ],[
                    UC.newButton(LANG.vu_sptp, SPACE.view.top),
                    UC.newButton(LANG.vu_spfr, SPACE.view.front),
                ],[
                    UC.newButton(LANG.vu_splt, SPACE.view.left),
                    UC.newButton(LANG.vu_sprt, SPACE.view.right)
                ]
            ]),

            workspace: UC.newGroup(LANG.ws_menu),
            wsTable: UC.newTableRow([
                [
                    UI.saveButton =
                    UC.newButton(LANG.ws_save, API.space.save),
                ],[
                    UC.newButton(LANG.ws_cler, API.space.clear)
                ]
            ]),

            layout:        UC.newGroup(LANG.op_menu),
            expert:        UC.newBoolean(LANG.op_xprt_s, booleanSave, {title:LANG.op_xprt_l}),
            compact:       UC.newBoolean(LANG.op_comp_s, booleanSave, {title:LANG.op_comp_l}),
            dark:          UC.newBoolean(LANG.op_dark_s, booleanSave, {title:LANG.op_dark_l}),
            showOrigin:    UC.newBoolean(LANG.op_show_s, booleanSave, {title:LANG.op_show_l}),
            alignTop:      UC.newBoolean(LANG.op_alig_s, booleanSave, {title:LANG.op_alig_l, modes:CAM}),
            autoLayout:    UC.newBoolean(LANG.op_auto_s, booleanSave, {title:LANG.op_auto_l}),
            freeLayout:    UC.newBoolean(LANG.op_free_s, booleanSave, {title:LANG.op_free_l, modes:ALL, expert:true}),
            reverseZoom:   UC.newBoolean(LANG.op_invr_s, booleanSave, {title:LANG.op_invr_l, modes:ALL, expert:true}),
            units:         UC.newSelect(LANG.op_unit_s, {title: LANG.op_unit_l, modes:CAM}, "units"),

            // allow modules to insert new items at the bottom of the left menu
            appendLeft:    UC.checkpoint(),

            layers:        UC.setGroup($("layers")),
            layerOutline:  UC.newBoolean(LANG.la_olin, onLayerToggle, {modes:LOCAL ? ALL : FDM_LASER}),
            layerTrace:    UC.newBoolean(LANG.la_trce, onLayerToggle, {modes:FDM_LASER}),
            layerFacing:   UC.newBoolean(LANG.la_face, onLayerToggle, {modes:CAM}),
            layerRough:    UC.newBoolean(LANG.la_ruff, onLayerToggle, {modes:CAM}),
            layerFinish:   UC.newBoolean(LANG.la_fini, onLayerToggle, {modes:CAM}),
            layerFinishX:  UC.newBoolean(LANG.la_finx, onLayerToggle, {modes:CAM}),
            layerFinishY:  UC.newBoolean(LANG.la_finy, onLayerToggle, {modes:CAM}),
            layerDelta:    UC.newBoolean(LANG.la_dlta, onLayerToggle, {modes:FDM}),
            layerSolid:    UC.newBoolean(LANG.la_slds, onLayerToggle, {modes:FDM}),
            layerFill:     UC.newBoolean(LANG.la_fill, onLayerToggle, {modes:FDM}),
            layerSparse:   UC.newBoolean(LANG.la_sprs, onLayerToggle, {modes:FDM}),
            layerSupport:  UC.newBoolean(LANG.la_sprt, onLayerToggle, {modes:FDM}),
            layerPrint:    UC.newBoolean(LANG.la_prnt, onLayerToggle),
            layerMoves:    UC.newBoolean(LANG.la_move, onLayerToggle),

            settingsGroup: UC.newGroup(LANG.se_menu, control, {region:"right"}),
            settingsTable: UC.newTableRow([
                [
                    UI.settingsLoad =
                    UC.newButton(LANG.se_load, settingsLoad),
                    UI.settingsSave =
                    UC.newButton(LANG.se_save, settingsSave)
                ]
            ]),

            process:             UC.newGroup(LANG.sl_menu, control, {modes:FDM_LASER}),
            sliceHeight:         UC.newInput(LANG.sl_lahi_s, {title:LANG.sl_lahi_l, convert:UC.toFloat, modes:FDM}),
            sliceShells:         UC.newInput(LANG.sl_shel_s, {title:LANG.sl_shel_l, convert:UC.toInt, modes:FDM}),
            sliceTopLayers:      UC.newInput(LANG.sl_ltop_s, {title:LANG.sl_ltop_l, convert:UC.toInt, modes:FDM}),
            sliceSolidLayers:    UC.newInput(LANG.sl_lsld_s, {title:LANG.sl_lsld_l, convert:UC.toInt, modes:FDM}),
            sliceBottomLayers:   UC.newInput(LANG.sl_lbot_s, {title:LANG.sl_lbot_l, convert:UC.toInt, modes:FDM}),

            process:             UC.newGroup(LANG.fi_menu, control, {modes:FDM}),
            sliceFillType:       UC.newSelect(LANG.fi_type, {modes:FDM}, "infill"),
            sliceFillSparse:     UC.newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:UC.toFloat, bound:UC.bound(0.0,1.0), modes:FDM}),
            sliceFillAngle:      UC.newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:UC.toFloat, modes:FDM, expert:true}),
            sliceFillOverlap:    UC.newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM, expert:true}),

            firstLayer:          UC.newGroup(LANG.fl_menu, null, {modes:FDM}),
            firstSliceHeight:    UC.newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:UC.toFloat, modes:FDM}),
            firstLayerRate:      UC.newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:UC.toFloat, modes:FDM}),
            firstLayerFillRate:  UC.newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:UC.toFloat, modes:FDM}),
            firstLayerPrintMult: UC.newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:UC.toFloat, modes:FDM, expert:true}),
            outputBrimCount:     UC.newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:UC.toInt, modes:FDM}),
            outputBrimOffset:    UC.newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:UC.toFloat, modes:FDM}),
            firstLayerNozzleTemp:UC.newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:UC.toInt, modes:FDM, expert:true}),
            firstLayerBedTemp:   UC.newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:UC.toInt, modes:FDM, expert:true}),

            support:             UC.newGroup(LANG.sp_menu, null, {modes:FDM}),
            sliceSupportDensity: UC.newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:FDM}),
            sliceSupportSize:    UC.newInput(LANG.sp_size_s, {title:LANG.sp_size_l, bound:UC.bound(1.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportOffset:  UC.newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportGap:     UC.newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, bound:UC.bound(0,5), convert:UC.toInt, modes:FDM, expert:true}),
            sliceSupportSpan:    UC.newInput(LANG.sp_span_s, {title:LANG.sp_span_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportArea:    UC.newInput(LANG.sp_area_s, {title:LANG.sp_area_l, bound:UC.bound(0.1,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportExtra:   UC.newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM, expert:true}),
            sliceSupportNozzle:  UC.newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, modes:FDM, expert:true}, "extruders"),
            sliceSupportEnable:  UC.newBoolean(LANG.enable, onBooleanClick, {modes:FDM}),

            laserOffset:         UC.newInput(LANG.ls_offs_s, {title:LANG.ls_offs_l, convert:UC.toFloat, modes:LASER}),
            laserSliceHeight:    UC.newInput(LANG.ls_lahi_s, {title:LANG.ls_lahi_l, convert:UC.toFloat, modes:LASER}),
            laserSliceSingle:    UC.newBoolean(LANG.ls_sngl_s, onBooleanClick, {title:LANG.ls_sngl_l, modes:LASER}),

            camCommon:           UC.newGroup(LANG.cc_menu, null, {modes:CAM}),
            camFastFeed:         UC.newInput(LANG.cc_rapd_s, {title:LANG.cc_rapd_l, convert:UC.toInt, modes:CAM}),

            roughing:            UC.newGroup(LANG.cr_menu, null, {modes:CAM}),
            roughingTool:        UC.newSelect(LANG.cc_tool, {modes:CAM}),
            roughingSpindle:     UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, modes:CAM}),
            roughingOver:        UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.1,1.0), modes:CAM}),
            roughingDown:        UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, modes:CAM}),
            roughingSpeed:       UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, modes:CAM}),
            roughingPlunge:      UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, modes:CAM}),
            roughingStock:       UC.newInput(LANG.cr_lsto_s, {title:LANG.cr_lsto_l, convert:UC.toFloat, modes:CAM}),
            camPocketOnlyRough:  UC.newBoolean(LANG.cc_pock_s, onBooleanClick, {title:LANG.cc_pock_l, modes:CAM}),
            camEaseDown:         UC.newBoolean(LANG.cr_ease_s, onBooleanClick, {title:LANG.cr_ease_l, modes:CAM}),
            roughingOn:          UC.newBoolean(LANG.enable, onBooleanClick, {modes:CAM}),

            finishing:           UC.newGroup(LANG.cf_menu, null, {modes:CAM}),
            finishingTool:       UC.newSelect(LANG.cc_tool, {modes:CAM}),
            finishingSpindle:    UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, modes:CAM}),
            finishingOver:       UC.newInput(LANG.cc_sovr_s, {title:LANG.cc_sovr_l, convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:CAM}),
            finishingDown:       UC.newInput(LANG.cc_sdwn_s, {title:LANG.cc_sdwn_l, convert:UC.toFloat, modes:CAM}),
            finishingAngle:      UC.newInput(LANG.cf_angl_s, {title:LANG.cf_angl_l, convert:UC.toFloat, bound:UC.bound(45,90), modes:CAM}),
            finishingSpeed:      UC.newInput(LANG.cc_feed_s, {title:LANG.cc_feed_l, convert:UC.toInt, modes:CAM}),
            finishingPlunge:     UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toInt, modes:CAM}),
            camPocketOnlyFinish: UC.newBoolean(LANG.cc_pock_s, onBooleanClick, {title:LANG.cc_pock_l, modes:CAM}),
            finishingOn:         UC.newBoolean(LANG.cf_watr_s, onBooleanClick, {title:LANG.cf_watr_l, modes:CAM}),
            finishingXOn:        UC.newBoolean(LANG.cf_linx_s, onBooleanClick, {title:LANG.cf_linx_l, modes:CAM}),
            finishingYOn:        UC.newBoolean(LANG.cf_liny_s, onBooleanClick, {title:LANG.cf_liny_l, modes:CAM}),
            finishCurvesOnly:    UC.newBoolean(LANG.cf_curv_s, onBooleanClick, {title:LANG.cf_curv_l, modes:CAM}),

            drilling:            UC.newGroup(LANG.cd_menu, null, {modes:CAM}),
            drillTool:           UC.newSelect(LANG.cc_tool, {modes:CAM}),
            drillSpindle:        UC.newInput(LANG.cc_spnd_s, {title:LANG.cc_spnd_l, convert:UC.toInt, modes:CAM}),
            drillDown:           UC.newInput(LANG.cd_plpr_s, {title:LANG.cd_plpr_l, convert:UC.toFloat, modes:CAM}),
            drillDownSpeed:      UC.newInput(LANG.cc_plng_s, {title:LANG.cc_plng_l, convert:UC.toFloat, modes:CAM}),
            drillDwell:          UC.newInput(LANG.cd_dwll_s, {title:LANG.cd_dwll_l, convert:UC.toFloat, modes:CAM}),
            drillLift:           UC.newInput(LANG.cd_lift_s, {title:LANG.cd_lift_l, convert:UC.toFloat, modes:CAM}),
            drillingOn:          UC.newBoolean(LANG.enable, onBooleanClick, {modes:CAM}),

            camTabs:             UC.newGroup(LANG.ct_menu, null, {modes:CAM}),
            camTabsAngle:        UC.newInput(LANG.ct_angl_s, {title:LANG.ct_angl_l, convert:UC.toInt, bound:UC.bound(0,360), modes:CAM}),
            camTabsCount:        UC.newInput(LANG.ct_numb_s, {title:LANG.ct_numb_l, convert:UC.toInt, bound:UC.bound(1,20), modes:CAM}),
            camTabsWidth:        UC.newInput(LANG.ct_wdth_s, {title:LANG.ct_wdth_l, convert:UC.toFloat, bound:UC.bound(0.1,100), modes:CAM}),
            camTabsHeight:       UC.newInput(LANG.ct_hght_s, {title:LANG.ct_hght_l, convert:UC.toFloat, bound:UC.bound(0.1,100), modes:CAM}),
            camTabsOn:           UC.newBoolean(LANG.enable, onBooleanClick, {title:LANG.ct_nabl_l, modes:CAM}),

            output:              UC.newGroup(LANG.fr_menu, null, {modes:FDM}),
            outputRaftSpacing:   UC.newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:UC.toFloat, bound:UC.bound(0.0,3.0), modes:FDM}),
            outputRaft:          UC.newBoolean(LANG.enable, onBooleanClick, {title:LANG.fr_nabl_l, modes:FDM}),

            output:              UC.newGroup(LANG.ou_menu),
            outputTileSpacing:   UC.newInput(LANG.ou_spac_c, {title:LANG.ou_spac_l, convert:UC.toInt, modes:LASER}),
            outputTileScaling:   UC.newInput(LANG.ou_scal_s, {title:LANG.ou_scal_l, convert:UC.toInt, bound:UC.bound(0.1,100), modes:LASER}),
            outputLaserPower:    UC.newInput(LANG.ou_powr_s, {title:LANG.ou_powr_l, convert:UC.toInt, bound:UC.bound(1,100), modes:LASER}),
            outputLaserSpeed:    UC.newInput(LANG.ou_sped_s, {title:LANG.ou_sped_l, convert:UC.toInt, modes:LASER}),
            outputLaserMerged:   UC.newBoolean(LANG.ou_mrgd_s, onBooleanClick, {title:LANG.ou_mrgd_l, modes:LASER}),
            outputLaserGroup:    UC.newBoolean(LANG.ou_grpd_s, onBooleanClick, {title:LANG.ou_grpd_l, modes:LASER}),
            outputTemp:          UC.newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:UC.toInt, modes:FDM}),
            outputBedTemp:       UC.newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:UC.toInt, modes:FDM}),
            outputFeedrate:      UC.newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:UC.toInt, modes:FDM}),
            outputFinishrate:    UC.newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:UC.toInt, modes:FDM}),
            outputSeekrate:      UC.newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:UC.toInt, modes:FDM}),
            outputShellMult:     UC.newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFillMult:      UC.newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputSparseMult:    UC.newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFanLayer:      UC.newInput(LANG.ou_fanl_s, {title:LANG.ou_fanl_l, convert:UC.toInt, bound:UC.bound(0,100), modes:FDM, expert:true}),
            camTolerance:        UC.newInput(LANG.ou_toll_s, {title:LANG.ou_toll_l, convert:UC.toFloat, bound:UC.bound(0.001,1.0), modes:CAM}),
            camZTopOffset:       UC.newInput(LANG.ou_ztof_s, {title:LANG.ou_ztof_l, convert:UC.toFloat, modes:CAM}),
            camZBottom:          UC.newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:UC.toFloat, modes:CAM}),
            camZClearance:       UC.newInput(LANG.ou_zclr_s, {title:LANG.ou_zclr_l, convert:UC.toFloat, bound:UC.bound(0.01,100), modes:CAM}),
            outputClockwise:     UC.newBoolean(LANG.ou_conv_s, onBooleanClick, {title:LANG.ou_conv_l, modes:CAM}),
            camDepthFirst:       UC.newBoolean(LANG.ou_depf_s, onBooleanClick, {title:LANG.ou_depf_l, modes:CAM}),

            camStock:            UC.newGroup(LANG.cs_menu, null, {modes:CAM}),
            camStockX:           UC.newInput(LANG.cs_wdth_s, {title:LANG.cs_wdth_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockY:           UC.newInput(LANG.cs_dpth_s, {title:LANG.cs_dpth_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockZ:           UC.newInput(LANG.cs_hght_s, {title:LANG.cs_hght_l, convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockOffset:      UC.newBoolean(LANG.cs_offs_s, onBooleanClick, {title:LANG.cs_offs_l, modes:CAM}),

            outputOriginBounds:  UC.newBoolean(LANG.or_bnds_s, onBooleanClick, {title:LANG.or_bnds_l, modes:LASER}),
            outputOriginCenter:  UC.newBoolean(LANG.or_cntr_s, onBooleanClick, {title:LANG.or_cntr_l, modes:CAM_LASER}),
            camOriginTop:        UC.newBoolean(LANG.or_topp_s, onBooleanClick, {title:LANG.or_topp_l, modes:CAM}),

            advanced:            UC.newGroup(LANG.ad_menu, null, {modes:FDM, expert:true}),
            outputRetractDist:   UC.newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:UC.toFloat, modes:FDM, expert:true}),
            outputRetractSpeed:  UC.newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:UC.toInt, modes:FDM, expert:true}),
            outputRetractDwell:  UC.newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:UC.toInt, modes:FDM, expert:true}),
            outputCoastDist:     UC.newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM, expert:true}),
            // outputWipeDistance: UC.newInput("wipe", {title:"non-printing move at\close of polygon\nin millimeters", bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM, expert:true}),
            sliceSolidMinArea:   UC.newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:UC.toFloat, modes:FDM, expert:true}),
            sliceMinHeight:      UC.newInput(LANG.ad_minl_s, {title:LANG.ad_minl_l, bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM, expert:true}),
            outputMinSpeed:      UC.newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, bound:UC.bound(5,200), convert:UC.toFloat, modes:FDM, expert:true}),
            outputShortPoly:     UC.newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, bound:UC.bound(0,200), convert:UC.toFloat, modes:FDM, expert:true}),
            zHopDistance:        UC.newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM, expert:true}),
            antiBacklash:        UC.newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, bound:UC.bound(0,3), convert:UC.toInt, modes:FDM, expert:true}),
            // detectThinWalls: UC.newBoolean("thin wall fill", onBooleanClick, {title: "detect and fill thin openings\nbetween shells walls", modes:FDM, expert:true})
            polishLayers:        LOCAL ? UC.newInput(LANG.ad_play_s, {title:LANG.ad_play_l, bound:UC.bound(0,10), convert:UC.toFloat, modes:FDM, expert:true}) : null,
            polishSpeed:         LOCAL ? UC.newInput(LANG.ad_pspd_s, {title:LANG.ad_pspd_l, bound:UC.bound(10,2000), convert:UC.toInt, modes:FDM, expert:true}) : null,
            gcodePauseLayers:    UC.newInput(LANG.ag_paws_s, {title:LANG.ag_paws_l, modes:FDM, expert:true}),
            outputLayerRetract:  UC.newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l, modes:FDM, expert:true})
        });

        if (!lang_set) {
            // for english only, add underlined labels for hotkeys
            UI.setupDevices.innerHTML   = "D<u>e</u>vices";
            UI.setupTools.innerHTML     = "T<u>o</u>ols";
            UI.modeArrange.innerHTML    = "<u>A</u>rrange";
            UI.modeSlice.innerHTML      = "<u>S</u>lice";
            UI.modePreview.innerHTML    = "<u>P</u>review";
            UI.modeExport.innerHTML     = "E<u>x</u>port";
        }

        // populate language drop-down
        let lp = $('langpop');
        let elp = DOC.createElement("div");
        let dlp = DOC.createElement("div");
        elp.appendChild(DOC.createTextNode('english'));
        dlp.appendChild(DOC.createTextNode('danish'));
        lp.appendChild(elp);
        lp.appendChild(dlp);
        elp.onclick = function() {
            SDB.setItem('kiri-lang', 'en-us');
            LOC.reload();
        };
        dlp.onclick = function() {
            SDB.setItem('kiri-lang', 'da-dk');
            LOC.reload();
        };

        SPACE.addEventHandlers(self, [
            'keyup', keyUpHandler,
            'keydown', keyDownHandler,
            'keypress', keyHandler,
            'dragover', dragOverHandler,
            'dragleave', dragLeave,
            'drop', dropHandler
        ]);

        SPACE.onEnterKey([
            UI.layerSpan,    function() { API.show.slices() },
            UI.layerID,      function() { API.show.layer(UI.layerID.value) },

            UI.scaleX,           selection.scale,
            UI.scaleY,           selection.scale,
            UI.scaleZ,           selection.scale,

            UI.toolName,         updateTool,
            UI.toolNum,          updateTool,
            UI.toolFluteDiam,    updateTool,
            UI.toolFluteLen,     updateTool,
            UI.toolShaftDiam,    updateTool,
            UI.toolShaftLen,     updateTool,
            // UI.toolTaperAngle,   updateTool,
            UI.toolTaperTip,     updateTool,
        ]);

        UI.layerID.convert = UC.toFloat.bind(UI.layerID);
        UI.layerSpan.convert = UC.toFloat.bind(UI.layerSpan);
        UI.layerRange.onclick = function() {
            UI.layerRange.checked = !(UI.layerRange.checked || false);
            API.show.slices();
        };

        $('layer-toggle').onclick = function(ev) {
            let ls = UI.layers.style;
            ls.display = ls.display !== 'block' ? 'block' : 'none';
            UI.layers.style.left = ev.target.getBoundingClientRect().left + 'px';
        };

        $('x-').onclick = function(ev) { API.selection.rotate(ev.shiftKey ? -ROT5 : -ROT,0,0) };
        $('x+').onclick = function(ev) { API.selection.rotate(ev.shiftKey ? ROT5 : ROT,0,0) };
        $('y-').onclick = function(ev) { API.selection.rotate(0,ev.shiftKey ? -ROT5 : -ROT,0) };
        $('y+').onclick = function(ev) { API.selection.rotate(0,ev.shiftKey ? ROT5 : ROT,0) };
        $('z-').onclick = function(ev) { API.selection.rotate(0,0,ev.shiftKey ? ROT5 : ROT) };
        $('z+').onclick = function(ev) { API.selection.rotate(0,0,ev.shiftKey ? -ROT5 : -ROT) };

        UI.modelOpacity.onchange = UI.modelOpacity.onclick = function(ev) {
            API.widgets.opacity(parseInt(UI.modelOpacity.value)/100);
        };

        UI.layerSlider.ondblclick = function() {
            UI.layerRange.checked = !UI.layerRange.checked;
            API.show.slices();
        };

        UI.layerSlider.onmousedown = function(ev) {
            if (ev.shiftKey) UI.layerRange.checked = !UI.layerRange.checked;
        };

        UI.layerSlider.onclick = function() {
            API.show.layer(UI.layerSlider.value);
        };

        UI.layerSlider.onmousemove = UI.layerSlider.onchange = function() {
            API.show.layer(UI.layerSlider.value);
        };

        UI.layerSlider.onmouseup = function() { API.focus() };

        UI.import.setAttribute("import","1");
        UI.import.onclick = function() {
            UC.hidePoppers();
            API.dialog.show("catalog");
        };

        UI.toolMetric.onclick = updateTool;
        UI.toolType.onchange = updateTool;

        $('apphelp').onclick = API.help.show;

        SPACE.platform.setSize(
            settings().device.bedWidth,
            settings().device.bedDepth,
            settings().device.bedHeight
        );

        if (dark) {
            SPACE.platform.setGrid(25, 5, 0x999999, 0x333333);
            SPACE.platform.opacity(0.8);
            DOC.body.classList.add('dark');
        } else {
            SPACE.platform.setGrid(25, 5, 0x999999, 0xcccccc);
            SPACE.platform.opacity(0.3);
        }

        SPACE.mouse.downSelect(function(int,event) {
            // lay flat with meta or ctrl clicking a selected face
            if (int && (event.ctrlKey || event.metaKey)) {
                let q = new THREE.Quaternion();
                q.setFromUnitVectors(int.face.normal, new THREE.Vector3(0,0,-1));
                API.selection.rotate(q);
            }
            if (API.view.get() !== VIEWS.ARRANGE) return null;
            return API.selection.meshes();
        });

        SPACE.mouse.upSelect(function(selection, event) {
            if (event && event.target.nodeName === "CANVAS") {
                if (selection) {
                    platform.select(selection.object.widget, event.shiftKey);
                } else {
                    platform.deselect();
                }
            } else {
                return API.widgets.meshes();
            }
        });

        SPACE.mouse.onDrag(function(delta) {
            let dev = settings().device;
            let bmaxx = dev.bedWidth/2;
            let bminx = -bmaxx;
            let bmaxy = dev.bedDepth/2;
            let bminy = -bmaxy
            if (delta && UI.freeLayout.checked) {
                API.selection.for_widgets(function(widget) {
                    let wbnd = widget.getBoundingBox();
                    let wwid = wbnd.max.x - wbnd.min.x;
                    let wminx = widget.track.pos.x + delta.x - wwid / 2;
                    let wmaxx = wminx + wwid + delta.x;
                    if (wminx < bminx || wmaxx > bmaxx) return;
                    let whei = wbnd.max.y - wbnd.min.y;
                    let wminy = widget.track.pos.y + delta.y - whei / 2;
                    let wmaxy = wminy + whei + delta.y;
                    if (wminy < bminy || wmaxy > bmaxy) return;
                    widget.move(delta.x, delta.y, 0);
                });
                platform.update_stock();
            } else {
                return API.selection.meshes().length > 0;
            }
        });

        API.space.restore(init_two) || checkSeed(init_two) || init_two();

    };

    // SECOND STAGE INIT AFTER UI RESTORED

    function init_two() {
        let current = settings(),
            control = current.controller;

        platform.deselect();
        CATALOG.addFileListener(updateCatalog);
        SPACE.view.setZoom(control.reverseZoom, control.zoomSpeed);
        SPACE.platform.setZOff(0.2);

        // restore UI state from settings
        UI.showOrigin.checked = control.showOrigin;
        UI.freeLayout.checked = control.freeLayout;
        UI.autoLayout.checked = control.autoLayout;
        UI.alignTop.checked = control.alignTop;
        UI.reverseZoom.checked = control.reverseZoom;
        UI.compact.checked = control.compact;

        // load script extensions
        if (SETUP.s) SETUP.s.forEach(function(lib) {
            let scr = DOC.createElement('script');
            scr.setAttribute('defer',true);
            scr.setAttribute('src','/code/'+lib+'.js');
            DOC.body.appendChild(scr);
            STATS.add('load_'+lib);
        });

        // load CSS extensions
        if (SETUP.ss) SETUP.ss.forEach(function(style) {
            style = style.charAt(0) === '/' ? style : `/kiri/style-${style}`;
            let ss = DOC.createElement('link');
            ss.setAttribute("type", "text/css");
            ss.setAttribute("rel", "stylesheet");
            ss.setAttribute("href", `${style}.css`);
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

        // optional set-and-lock mode (hides mode menu)
        let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

        // optional set-and-lock device (hides device menu)
        let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

        // setup default mode and enable mode locking, if set
        API.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);

        // update everything dependent on the platform size
        platform.update_size();

        // ensure hot keys work even in iframes
        API.focus();

        // place version number a couple of places to help users
        UI.helpButton.title = `${LANG.version} ` + KIRI.version;

        // restore expert setting preference
        UC.setExpert(control.expert);

        // setup tab visibility watcher
        // DOC.addEventListener('visibilitychange', function() { document.title = document.hidden });

        // ensure settings has gcode
        selectDevice(DEVNAME || API.device.get(), DEVNAME);

        // ensure field data propagation
        API.conf.update();

        // load settings provided in url hash
        loadSettingsFromServer();

        // clear alerts as they build up
        setInterval(API.event.alerts, 1000);

        // add hide-alerts-on-alert-click
        UI.alert.dialog.onclick = function() {
            API.event.alerts(true);
        };

        // default to ARRANGE view mode
        API.view.set(VIEWS.ARRANGE);

        // add ability to override
        API.show.controls(API.feature.controls);

        // set initial layer slider size
        API.dialog.update();

        // show version on startup
        API.show.alert(`${LANG.version} ${KIRI.version}`);

        if (!SETUP.s) console.log(`kiri | init main | ${KIRI.version}`);

        // send init-done event
        API.event.emit('init-done', STATS);
    }

    // if a language needs to load, the script is injected and loaded
    // first.  once this loads, or doesn't, the initialization begins
    let lang_set = undefined;
    let lang = SETUP.ln ? SETUP.ln[0] : SDB.getItem('kiri-lang') || KIRI.lang.get();

    // inject language script if not english
    if (lang && lang !== 'en' && lang !== 'en-us') {
        lang_set = lang;
        let scr = DOC.createElement('script');
        // scr.setAttribute('defer',true);
        scr.setAttribute('src',`/kiri/lang/${lang}.js`);
        (DOC.body || DOC.head).appendChild(scr);
        STATS.set('ll',lang);
        scr.onload = function() {
            KIRI.lang.set(lang);
            init_one();
        };
        scr.onerror = function(err) {
            console.log({language_load_error: err, lang})
            init_one();
        }
    }

    // set to browser default which will be overridden
    // by any future script loads (above)
    KIRI.lang.set();

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
