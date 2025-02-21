/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri.api
// dep: kiri.conf
// dep: kiri.utils
// dep: moto.space
// dep: data.local
// use: kiri.widgets
// use: ext.base64
gapp.register("kiri.settings", (root, exports) => {

const { data, kiri, moto, noop } = self;
const { api, conf, consts, utils } = kiri;
const { space } = moto;
const { local } = data;
const { clone } = Object;
const { areEqual, ls2o, js2o } = utils;
const { COLOR } = consts;
const localFilterKey ='kiri-gcode-filters';
const localFilters = js2o(local.getItem(localFilterKey)) || [];

let settings = clone(conf.template);

function normalize(set) {
    return conf.normalize(set);
}

function getSettings() {
    return settings;
}

function putSettings(newset) {
    settings = normalize(newset);
    saveSettings();
    api.space.restore(null, true);
}

function saveSettings() {
    const { ui } = api;
    const view = space.view.save();
    if (view.left || view.up) {
        settings.controller.view = view;
    }
    const mode = settings.mode;
    settings.sproc[mode].default = settings.process;
    settings.sproc[mode][settings.process.processName] = settings.process;
    // moved to init.onBooleanClick() -- delete later after confirming no side-effects
    // settings.device.bedBelt = ui.deviceBelt.checked;
    // settings.device.bedRound = ui.deviceRound.checked;
    // settings.device.originCenter = ui.deviceOrigin.checked || ui.deviceRound.checked;
    // settings.device.fwRetract = ui.fwRetract.checked;
    local.setItem('ws-settings', JSON.stringify(settings));
    api.event.emit('settings.saved', settings);
}

function loadSettings(evt, named) {
    let mode = settings.mode,
        name = evt ? evt.target.getAttribute("load") : named || api.process.get() || "default",
        load = settings.sproc[mode][name];

    if (!load) return;

    // cloning loaded process into settings requires user to save
    // process before switching devices or risk losing any changes
    settings.process = clone(load);
    // update process name
    settings.process.processName = name;
    // save named process with the current device
    settings.devproc[api.device.get()] = name;
    // preserve name of last library loaded
    if (name !== 'default') {
        settings.cproc[mode] = name;
    }
    // allow mode driver to take any necessary actions
    api.event.emit("settings.load", settings);

    // update UI fields to reflect current settings
    api.conf.update_fields();
    api.conf.update();

    // publish event when loading from ui event
    if (evt) api.event.settings();

    // update hidden map from settings
    api.uc.setHidden(settings.hidden);
}

function showSettings() {
    api.settings.sync.get().then(() => {
        api.dialog.update_process_list();
        api.modal.show("saves");
        api.ui.settingsName.focus();
    });
}

function updateSettings(opt = {}) {
    const { controller, device, process, mode, sproc, cproc } = settings;
    const { uc } = api;
    const changes = {};

    updateSettingsFromFields(controller, undefined, changes);

    switch (controller.units) {
        case 'mm': uc.setUnits(1); break;
        case 'in': uc.setUnits(25.4); break;
    }

    // limit update to controller fields (ui prefs dialog)
    if (opt.controller) {
        return;
    }

    updateSettingsFromFields(device, undefined, changes);

    // range-specific values
    if (settings.mode === 'FDM' && api.view.is_slice()) {
        let changes = {};
        let values = process;
        let { layer_lo, layer_hi, layer_max } = api.var;
        let range = { lo: layer_lo, hi: layer_hi };
        let add = false;
        if (layer_lo > 0 || layer_hi < layer_max) {
            values = Object.clone(process);
            add = true;
        }
        // collect changes to pass to range updates
        updateSettingsFromFields(values, undefined, changes);
        if (range) {
            updateRange(range.lo, range.hi, changes, add);
        }
    } else {
        updateSettingsFromFields(process, undefined, changes);
    }

    if (device.extruders && device.extruders[device.internal]) {
        updateSettingsFromFields(device.extruders[device.internal]);
    }

    // invalidate slice, preview, export on settings changes
    if (Object.keys(changes).length) {
        api.function.clear_progress();
    }

    api.conf.save();

    let compare = sproc[mode][cproc[mode]];
    let same = true;
    if (compare)
    for (let [key, val] of Object.entries(compare).filter(v => v[0] !== 'processName')) {
        let tval = process[key];
        // outputLoopLayers misbehaving and setting null on empty
        if (val === '' && tval == null) {
            continue;
        }
        if (Array.isArray(tval) && Array.isArray(val)) {
            if (JSON.stringify(tval) == JSON.stringify(val)) {
                continue;
            }
        }
        if (tval != val) {
            // console.log(key, 'expected', val, 'got', tval);
            same = false;
        }
    }

    $('mode-device').innerText = device.deviceName;
    $('mode-profile').innerText = `${cproc[mode]}${same ? '' : ' *'}`;
}

function updateSettingsFromFields(setrec, uirec = api.ui, changes) {
    if (!setrec) {
        return console.trace("missing scope");
    }
    let lastChange = api.uc.lastChange();

    // for each key in setrec object
    for (let key in setrec) {
        if (!setrec.hasOwnProperty(key)) {
            // console.log({no_setrec: key});
            continue;
        }
        if (!uirec.hasOwnProperty(key)) {
            // console.log({no_uirec: key});
            continue;
        }
        let nval = null, uie = uirec[key];
        // skip empty UI values
        if (!uie || uie === '') {
            // console.log({uie_empty: key});
            continue;
        }
        if (uie.type === 'text') {
            nval = uirec[key].convert();
        } else if (uie.type === 'checkbox') {
            nval = uirec[key].checked;
        } else if (uie.type === 'select-one') {
            if (uie.selectedIndex >= 0) {
                nval = uie.options[uie.selectedIndex].value;
                let src = uie.parentNode.getAttribute('source');
                if (src === 'tools' || src == 'extruders') {
                    nval = parseInt(nval);
                }
            } else {
                nval = setrec[key];
            }
        } else if (uie.type === 'textarea') {
            nval = uie.value.trim().split('\n').filter(v => v !== '');
        } else {
            continue;
        }
        if (lastChange === uie) {
            if (changes) changes[key] = nval;
        }
        if (!areEqual(setrec[key], nval)) {
            setrec[key] = nval;
            if (changes) {
                changes[key] = nval;
            }
        }
    }

    return settings;
}

// given a settings region, update values of matching bound UI fields
function updateFieldsFromSettings(setrec, uirec = api.ui, trace) {
    if (!setrec) {
        updateFieldsFromSettings(settings.device);
        updateFieldsFromSettings(settings.process);
        updateFieldsFromSettings(settings.controller);
        updateExtruderFields(settings.device);
        return;
    }
    for (let key in setrec) {
        if (!setrec.hasOwnProperty(key)) {
            continue;
        }
        let val = setrec[key];
        if (!uirec.hasOwnProperty(key)) {
            continue;
        }
        let uie = uirec[key], typ = uie ? uie.type : null;
        if (typ === 'text') {
            if (uie.setv) {
                uie.setv(val);
            } else {
                uie.value = val;
            }
        } else if (typ === 'checkbox') {
            uie.checked = val;
        } else if (typ === 'select-one') {
            uie.innerHTML = '';
            let source = uie.parentNode.getAttribute('source'),
                list = uie._source || settings[source] || api.lists[source],
                chosen = null;
            if (list) list.forEach(function(el, index) {
                let id = el.id || el.name;
                let ev = el.value || id;
                if (val == id) {
                    chosen = index;
                }
                let opt = document.createElement('option');
                opt.appendChild(document.createTextNode(el.name));
                opt.setAttribute('value', ev);
                uie.appendChild(opt);
            });
            if (chosen) {
                uie.selectedIndex = chosen;
            }
        } else if (typ === 'textarea') {
            if (Array.isArray(val)) {
                uie.value = val.join('\n');
            } else {
                uie.value = '';
            }
        }
    }
}

function updateExtruderFields(device) {
    const { ui } = api;
    const { LANG } = api.const;
    if (device.extruders && device.extruders[device.internal]) {
        updateFieldsFromSettings(device.extruders[device.internal]);
        ui.extruder.innerHTML =
            `${LANG.dv_gr_ext}<label class='grow'></label>${device.internal+1} of ${device.extruders.length}`;
        ui.extPrev.disabled = device.internal === 0;
        ui.extPrev.onclick = function() {
            device.internal--;
            updateExtruderFields(device);
        };
        ui.extNext.disabled = device.internal === device.extruders.length - 1;
        ui.extNext.onclick = function() {
            device.internal++;
            updateExtruderFields(device);
        };
        ui.extDel.disabled = ui.extDel.disabled || device.extruders.length < 2;
        ui.extDel.onclick = function() {
            device.extruders.splice(device.internal,1);
            device.internal = Math.min(device.internal, device.extruders.length-1);
            updateExtruderFields(device);
        };
        ui.extAdd.onclick = function() {
            let copy = clone(device.extruders[device.internal]);
            device.extruders.push(copy);
            device.internal = device.extruders.length - 1;
            updateExtruderFields(device);
        };
        api.uc.setClass($('tool-nozzle'), 'hide', false);
        h.bind($('ft-nozzle'), device.extruders.map((d,i) => h.div([
            h.button({
                _: `extruder ${i}`,
                onclick() {
                    api.selection.for_widgets(w => {
                        w.anno.extruder = i;
                        w.setColor(
                            api.selection.contains(w) ?
                                COLOR.selected : COLOR.deselected,
                            undefined,
                            false);
                    });
                }
            }),
            h.div({
                class: "splat",
                style: `background-color: #${COLOR.deselected[i].toString(16)}`
            })
        ])));
    } else {
        api.uc.setClass($('tool-nozzle'), 'hide', true);
    }
}

function getOverlappingRanges(lo, hi) {
    let ranges = [];
    for (let range of settings.process.ranges || []) {
        let in_lo = range.lo >= lo && range.lo <= hi;
        let in_hi = range.hi >= lo && range.hi <= hi;
        if (in_lo || in_hi) {
            ranges.push(range);
        }
    }
    return ranges;
}

// set process override values for a range
function updateRange(lo, hi, values, add) {
    let ranges = settings.process.ranges;
    let slices = {};
    let min = lo;
    let max = hi;

    // special case for belt loops which should not be flattened
    if (values.outputLoops) {
        ranges.push({
            lo, hi, fields: values
        });
        api.conf.update_fields(settings.process);
        api.show.alert("update ranges", 2);
        api.event.emit("range.updates", ranges);
        return;
    }

    // just remove values from matching ranges
    if (!add) {
        for (let range of getOverlappingRanges(lo, hi)) {
            for (let key of Object.keys(values)) {
                delete range.fields[key];
            }
            if (Object.keys(range.fields).length === 0) {
                let pos = ranges.indexOf(range);
                if (pos >= 0) {
                    ranges.splice(pos,1);
                }
            }
        }
        api.event.emit("range.updates", ranges);
        return;
    }

    // set aside belt loops and re-append later
    // since we do not want to collapse/merge loops
    let exclude = ranges.filter(r => r.fields.outputLoops);
    ranges = ranges.filter(r => !r.fields.outputLoops);

    // flatten ranges
    ranges.push({lo, hi, fields: values});
    for (let range of ranges) {
        min = Math.min(range.lo, min);
        max = Math.max(range.hi, max);
        for (let i=range.lo; i<=range.hi; i++) {
            let slice = slices[i];
            if (!slice) {
                slice = slices[i] = {};
            }
            for (let [key,val] of Object.entries(range.fields)) {
                slice[key] = val;
            }
        }
    }

    // merge contiguous matching ranges
    ranges = settings.process.ranges = [];
    let range;
    for (let i=min; i<=max; i++) {
        let slice = slices[i];
        if (slice && !range) {
            range = {lo: i, hi: i, fields: slice};
        } else if (slice && range && areEqual(range.fields, slice)) {
            range.hi = i;
        } else if (range) {
            ranges.push(range);
            if (slice) {
                range = {lo: i, hi: i, fields: slice};
            } else {
                range = undefined;
            }
        }
    }

    ranges.push(range);
    ranges.appendAll(exclude);

    api.conf.update_fields(settings.process);
    api.show.alert("update ranges", 2);
    api.event.emit("range.updates", ranges);
}

let overrides = {};

// updates editable fields that are range dependent
function updateFieldsFromRange() {
    if (true) return;
    if (settings.mode !== 'FDM' || !api.view.is_slice() || !settings.process.ranges) {
        let okeys = Object.keys(overrides);
        if (okeys.length) {
            api.conf.update_fields(overrides);
            overrides = {};
        }
        return;
    }
    let match = 0;
    let values = {};
    let restores = Object.clone(overrides);
    let { layer_lo, layer_hi } = api.var;
    for (let range of getOverlappingRanges(api.var.layer_lo, api.var.layer_hi)) {
        for (let key of Object.keys(range.fields)) {
            values[key] = range.fields[key];
            overrides[key] = settings.process[key];
            delete restores[key];
            match++;
        }
    }
    if (match) {
        api.conf.update_fields(values);
    }
    let rkeys = Object.keys(restores);
    if (rkeys.length) {
        api.conf.update_fields(restores);
        for (let key of rkeys) {
            delete overrides[key];
        }
    }
    api.uc.refresh();
}

function restoreSettings(save) {
    const widgets = api.widgets.all();
    const newset = ls2o('ws-settings') || settings;
    // extract legacy widget annotations into widgets
    if (newset.widget) {
        for (let id of Object.keys(newset.widget)) {
            let anno = newset.widget[id];
            let wid = widgets.filter(w => w.id === id)[0];
            if (wid && anno) {
                wid.anno = anno;
                console.log('transfer settings annotations to widget', id);
                wid.saveState();
            } else {
                console.log('missing widget for annotations', id);
            }
            delete newset.widget[id];
        }
    }
    settings = normalize(newset);
    // override camera from settings
    if (settings.controller.view) {
        local.removeItem('ws-camera');
    }
    // merge custom filters from localstorage into settings
    localFilters.forEach(function(fname) {
        let fkey = "gcode-filter-"+fname, ov = ls2o(fkey);
        if (ov) settings.devices[fname] = ov;
        local.removeItem(fkey)
    });
    local.removeItem(localFilterKey);
    // save updated settings
    if (save) api.conf.save();

    return newset;
}

function settingsExport(opts = {}) {
    const widgets = api.widgets.all();
    const note = opts.node || undefined;
    const shot = opts.work || opts.screen ? space.screenshot() : undefined;
    const work = opts.work ? kiri.codec.encode(widgets,{_json_:true}) : undefined;
    const view = opts.work ? space.view.save() : undefined;
    const setn = Object.clone(settings);
    // stuff in legacy annotations for re-import
    for (let w of widgets) {
        setn.widget[w.id] = w.anno;
    }
    const xprt = {
        settings: setn,
        version: kiri.version,
        screen: shot,
        space: space.info,
        note: note,
        work: work,
        view: view,
        moto: moto.id,
        init: local.getItem('kiri-init'),
        time: Date.now()
    };
    return opts.clear ? xprt : api.util.b64enc(xprt);
}

function settingsImport(data, ask) {
    const { uc, ui } = api;
    if (typeof(data) === 'string') {
        try {
            data = data.charAt(0) === '{' ? JSON.parse(data) : api.util.b64dec(data);
        } catch (e) {
            uc.alert('invalid import format');
            console.log('data',data,{type: typeof data},e);
            return;
        }
    }
    if (api.const.LOCAL) console.log('import', data);
    let isSettings = (data.settings && data.version && data.time);
    let isProcess = (data.process && data.version && data.time && data.mode && data.name);
    let isDevice = (data.device && data.version && data.time);
    let isTools = (data.tools && data.version && data.time)
    let isWork = (data.work);
    if (!isSettings && !isDevice && !isProcess && !isTools) {
        uc.alert('invalid settings or device format');
        console.log('data',data);
        return;
    }
    function doit() {
        function devset() {
            settings.devices[data.device] = data.code;
            settings.devproc[data.device] = data.name;
            api.show.devices();
        }
        function procset() {
            settings.sproc[data.mode][data.name] = data.process;
            if (!isDevice) {
                api.conf.show();
            }
        }
        if (isDevice) {
            if (data.process && data.process.processName && data.code.mode) {
                data.mode = data.code.mode;
                data.name = data.process.processName;
                isProcess = true;
            }
            if (settings.devices[data.device]) {
                uc.confirm(`Replace device ${data.device}?`).then(yes => {
                    if (yes) devset()
                });
            } else {
                devset();
            }
        }
        if (isProcess) {
            console.log({ data });
            if (data.name === 'default') data.name = data.device || data.name;
            if (settings.sproc[data.mode][data.name]) {
                uc.confirm(`Replace process ${data.name}?`).then(yes => {
                    if (yes) procset();
                });
            } else {
                procset();
            }
        }
        if (isSettings) {
            api.space.clear();
            settings = normalize(data.settings);
            local.setItem('ws-settings', JSON.stringify(settings));
            if (api.const.LOCAL) console.log('settings', Object.clone(settings));
            if (isWork) {
                api.platform.clear();
                // really old workspaces encoded the types as strings
                for (let work of data.work) {
                    if (work.type === "widget") {
                        work.type = 100;
                    }
                }
                kiri.codec.decode(data.work).forEach(widget => {
                    api.platform.add(widget, 0, true, true);
                });
                if (data.view) {
                    space.view.load(data.view);
                }
            }
            restoreSettings();
            api.space.restore(() => { ui.sync() }, true);
        }
        if (isTools && Array.isArray(data.tools)) {
            const settool = settings.tools;
            for (let tool of data.tools) {
                if (settool.filter(t => t.id === tool.id).length === 0) {
                    settool.push(tool);
                }
            }
            // settings.tools = data.tools;
            api.show.tools();
        }
    }
    if (ask) {
        let opt = {};
        let prompt = isDevice ?
            `Import device "${data.device}"?` : isProcess ?
            `Import process "${data.name}"?` : isTools ?
            `Import tool definitions?`:
            `Import settings made in Kiri:Moto version ${data.version} on<br>${new Date(data.time)}?`;
        if (data.screen) {
            opt.pre = [
                '<div class="f-col a-center">',
                `<img src="${data.screen}" style="width:300px"/>`,
                '</div>'
            ];
        }
        uc.confirm(prompt,undefined,undefined,opt).then((yes) => {
            if (yes) doit();
        });
    } else {
        doit();
    }
}

function settingsImportUrl(url, ask) {
    const kmz = url.endsWith(".kmz");
    fetch(url).then(r => kmz ? r.arrayBuffer() : r.text()).then(a => {
        kmz ? settingsImportZip(a, ask) : settingsImport(a, ask);
    }).catch(error => {
        console.log({workspace_url: url, error: error.message || error});
        api.show.alert('workspace load failed');
    });
}

function settingsImportZip(data, ask) {
    let alert = api.show.alert("Importing Workspace");
    JSZip.loadAsync(data).then(zip => {
        for (let [key,value] of Object.entries(zip.files)) {
            if (key === "workspace.json") {
                value.async("string").then(json => {
                    api.hide.alert(alert);
                    settingsImport(JSON.parse(json), ask);
                });
            }
        }
    });
}

// import and convert prusa ini file
function settingsPrusaConvert(data) {
    const { uc } = api;
    const map = {};
    const vsub = {
        '[first_layer_bed_temperature]': '{bed_temp}',
        '[first_layer_temperature]': '{temp}',
        '[layer_z]': '{z}'
    };
    try {
        data.split('\n')
            .filter(l => l.charAt(0) !== '#')
            .map(l => l.split('=').map(v => v.trim()))
            .map(l => {
                // convert gcode string into a string array
                if (l[0].indexOf('_gcode') > 0) {
                    l[1] = l[1].replaceAll('\\n','\n').split('\n')
                        .map(line => {
                            for (let [k,v] of Object.entries(vsub)) {
                                line = line.replace(k,v);
                            }
                            return line;
                        });
                }
                return l;
            })
            .forEach(l => {
                map[l[0]] = l[1];
            });
    } catch (e) {
        return uc.alert('invalid file');
    }
    // device setup
    let device = Object.clone(conf.defaults.fdm.d);
    let dname = device.deviceName = map.printer_model;
    if (dname) {
        device.mode = "FDM";
        device.extruders[0].extNozzle = parseFloat(map.nozzle_diameter);
        device.gcodePre = map.start_gcode;
        device.gcodePost = map.end_gcode;
        device.gcodeLayer = map.layer_gcode || [];
        device.maxHeight = parseInt(map.max_print_height || device.maxHeight);
        if (map.bed_shape) {
            let shape = map.bed_shape.split(',').map(l => l.split('x'));
            device.bedWidth = parseInt(shape[2][0]);
            device.bedDepth = parseInt(shape[2][1]);
        }
    }
    // profile setup
    let process = Object.clone(conf.defaults.fdm.p);
    let pname = process.processName = map.print_settings_id;
    if (pname) {
        process.sliceShells = parseInt(map.perimeters);
        process.sliceHeight = parseFloat(map.layer_height);
        process.outputFeedrate = parseInt(map.perimeter_speed);
        process.outputSeekrate = parseInt(map.travel_speed);
        process.outputTemp = parseInt(map.temperature);
        process.outputBedTemp = parseInt(map.bed_temperature);
        process.sliceTopLayers = parseInt(map.top_solid_layers);
        process.sliceBottomLayers = parseInt(map.bottom_solid_layers);
        process.firstSliceHeight = parseFloat(map.first_layer_height);
        process.firstLayerNozzleTemp = parseInt(map.first_layer_temperature);
        process.firstLayerRate = (
            (parseFloat(map.first_layer_speed) / 100) * process.outputFeedrate);
        process.firstLayerBedTemp = parseInt(map.first_layer_bed_temperature);
        process.outputRetractDist = parseFloat(map.retract_length);
        process.outputRetractSpeed = parseFloat(map.retract_speed);
    }
    uc.confirm(`Import "${dname}"?`).then(yes => {
        if (yes) {
            // create device, associated profile, set as current and show dialog
            settings.devices[dname] = device;
            settings.devproc[dname] = pname;
            settings.process = settings.sproc.FDM[pname] = process;
            settings.filter.FDM = dname;
            settings.cproc.FDM = pname;
            api.show.devices();
        }
    });
}

function setThreaded(bool) {
    bool = bool ? true : false;
    settings.controller.threaded = bool;
    api.event.emit("set.threaded", bool);
}

function setEnableWASM(bool) {
    bool = bool ? true : false;
    settings.controller.assembly = bool;
    api.event.emit("set.assembly", bool);
}

// extend API (api.conf)
Object.assign(api.conf, {
    dbo: () => { return ls2o('ws-settings') },
    get: getSettings,
    put: putSettings,
    load: loadSettings,
    save: saveSettings,
    show: showSettings,
    update: updateSettings,
    update_from: updateSettingsFromFields,
    update_fields: updateFieldsFromSettings,
    update_fields_from_range: updateFieldsFromRange,
    set_enable_wasm: setEnableWASM,
    set_threaded: setThreaded,
    restore: restoreSettings,
    export: settingsExport,
    import: settingsImport,
});

// extend API (api.settings)
Object.assign(api.settings, {
    get: getSettings,
    import: settingsImport,
    import_zip: settingsImportZip,
    import_url: settingsImportUrl,
    import_prusa: settingsPrusaConvert,
    dev()  { return settings.device },
    proc() { return settings.process },
    ctrl() { return settings.controller },
    mode() { return settings.mode },
    prof() { return settings.sproc[settings.mode] },
    sync: {
        async get() {},
        async put() {},
        status: false
    }
});

});
