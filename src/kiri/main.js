/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function () {

    const { base, data, load, kiri, moto, noop } = self;
    const { api, consts, lang, Widget, newWidget, utils } = kiri;
    const { areEqual, parseOpt, encodeOpt, ajax, o2js, js2o } = utils;
    const { feature, platform, selection } = api;
    const { COLOR, MODES, PMODES, VIEWS } = consts;

    const LANG = lang.current,
        WIN     = self.window,
        DOC     = self.document,
        LOC     = self.location,
        HOST    = LOC.host.split(':'),
        SETUP   = parseOpt(LOC.search.substring(1)),
        SECURE  = isSecure(LOC.protocol),
        LOCAL   = self.debug && !SETUP.remote,
        EVENT   = kiri.broker = gapp.broker,
        SDB     = data.local,
        SPACE   = kiri.space = moto.Space,
        FILES   = kiri.catalog = kiri.openFiles(new data.Index(SETUP.d ? SETUP.d[0] : 'kiri')),
        STATS   = new Stats(SDB),
        CONF    = kiri.conf,
        clone   = Object.clone;

    let settings = clone(CONF.template),
        UI = {},
        UC = kiri.ui.prefix('kiri').inputAction(updateSettings),
        MODE = MODES.FDM,
        STACKS = kiri.stacks,
        DRIVER = undefined,
        localFilterKey ='kiri-gcode-filters',
        localFilters = js2o(SDB.getItem(localFilterKey)) || [],
        viewMode = VIEWS.ARRANGE,
        local = SETUP.local,
        busy = 0,
        showFavorites = SDB.getItem('dev-favorites') === 'true',
        alerts = [],
        saveTimer = null,
        version = kiri.version = gapp.version;

    // add show() to catalog for API
    FILES.show = showCatalog;

    // patch broker for api backward compatibility
    EVENT.on = (topic, listener) => {
        EVENT.subscribe(topic, listener);
        return EVENT;
    };

    // augment api
    Object.assign(api, {
        ui: UI,
        uc: UC,
        focus: noop,
        stats: STATS,
        catalog: FILES,
        busy: {
            val() { return busy },
            inc() { kiri.api.event.emit("busy", ++busy) },
            dec() { kiri.api.event.emit("busy", --busy) }
        },
        conf: {
            dbo: () => { return ls2o('ws-settings') },
            get: getSettings,
            put: putSettings,
            load: loadSettings,
            save: saveSettings,
            show: showSettings,
            update: updateSettings,
            restore: restoreSettings,
            export: settingsExport,
            import: settingsImport
        },
        const: {
            LANG,
            LOCAL,
            SETUP,
            SECURE,
            STACKS,
        },
        device: {
            code: currentDeviceCode,
            get: currentDeviceName,
            set: noop, // set during init
            clone: noop // set during init
        },
        dialog: {
            show: showModal,
            hide: hideModal
        },
        help: {
            show: showHelp,
            file: showHelpFile
        },
        event: {
            on(t,l) { return EVENT.on(t,l) },
            emit(t,m,o) { return EVENT.publish(t,m,o) },
            bind(t,m,o) { return EVENT.bind(t,m,o) },
            import: loadFile,
            alerts: updateAlerts,
            settings: triggerSettingsEvent
        },
        group: {
            merge: groupMerge,
            split: groupSplit,
        },
        hide: {
            alert(rec,recs) { alert2cancel(rec,recs) },
            import: noop,
            slider: hideSlider
        },
        image: {
            dialog: loadImageDialog,
            convert: loadImageConvert
        },
        language: kiri.lang,
        modal: {
            show: showModal,
            hide: hideModal,
            visible: modalShowing
        },
        mode: {
            get_id() { return MODE },
            get_lower: getModeLower,
            get: getMode,
            set: setMode,
            switch: switchMode,
            set_expert: noop,
            is_fdm() { return MODE === MODES.FDM },
            is_cam() { return MODE === MODES.CAM },
            is_sla() { return MODE === MODES.SLA },
            is_laser() { return MODE === MODES.LASER },
        },
        probe: {
            live: "https://live.grid.space",
            grid: noop,
            local: noop
        },
        process: {
            code: currentProcessCode,
            get: currentProcessName
        },
        settings: {
            import: settingsImport,
            import_zip: settingsImportZip,
            import_prusa: settingsPrusaConvert
        },
        show: {
            alert: alert2,
            devices: noop, // set during init
            progress: setProgress,
            controls: setControlsVisible,
            favorites: getShowFavorites,
            slices: showSlices,
            layer: setVisibleLayer,
            local: showLocal,
            import: function() { UI.import.style.display = '' }
        },
        space: {
            reload,
            auto_save,
            restore: restoreWorkspace,
            clear: clearWorkspace,
            save: saveWorkspace,
            set_focus: setFocus,
            update: SPACE.update,
            is_dark() { return settings.controller.dark }
        },
        util: {
            isSecure,
            ui2rec: updateSettingsFromFields,
            rec2ui: updateFieldsFromSettings,
            download: downloadBlob,
            b64enc(obj) { return base64js.fromByteArray(new TextEncoder().encode(JSON.stringify(obj))) },
            b64dec(obj) { return JSON.parse(new TextDecoder().decode(base64js.toByteArray(obj))) }
        },
        view: {
            get() { return viewMode },
            set() { setViewMode(...arguments) },
            set_arrange() { api.view.set(VIEWS.ARRANGE) },
            set_slice() { api.view.set(VIEWS.SLICE) },
            set_preview() { api.view.set(VIEWS.PREVIEW) },
            is_arrange() { return viewMode === VIEWS.ARRANGE },
            is_slice() { return viewMode === VIEWS.SLICE },
            is_preview() { return viewMode === VIEWS.PREVIEW },
            hide_slices: hideSlices,
            update_speeds: updateSpeeds,
            update_fields: updateFields,
            update_slider: updateSlider,
            update_slider_max: updateSliderMax,
            snapshot: null,
            unit_scale: unitScale,
            wireframe: setWireframe,
        },
        work: kiri.work
    });

    function setFocus(sel, point) {
        if (point) {
            SPACE.platform.setCenter(point.x, point.z, point.y);
            SPACE.view.setFocus(new THREE.Vector3(point.x, point.y, point.z));
            return;
        }
        if (sel === undefined) {
            sel = api.widgets.all();
        } else if (!Array.isArray) {
            sel = [ sel ];
        } else if (sel.length === 0) {
            sel = api.widgets.all();
        }
        let pos = { x:0, y:0, z:0 };
        for (let widget of sel) {
            pos.x += widget.track.pos.x;
            pos.y += widget.track.pos.y;
            pos.z += widget.track.pos.z;
        }
        if (sel.length) {
            pos.x /= sel.length;
            pos.y /= sel.length;
            pos.z /= sel.length;
        }
        SPACE.platform.setCenter(pos.x, -pos.y, platform.top_z() / 2);
        SPACE.view.setFocus(new THREE.Vector3(pos.x, platform.top_z() / 2, -pos.y));
    }

    function reload() {
        api.event.emit('reload');
        do_reload(100);
    }

    function do_reload(time) {
        // allow time for async saves to complete and busy to to to zero
        setTimeout(() => {
            if (busy === 0) {
                LOC.reload();
            } else {
                console.log(`reload deferred on busy=${busy}`);
                do_reload(250);
            }
        }, time || 100);
    }

    function auto_save() {
        if (!settings.controller.autoSave) {
            return;
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            api.space.save(true);
        }, 1000);
    }

    // frame message api
    WIN.addEventListener('message', msg => {
        if (!feature.frame) return;
        let { origin, source, target, data } = msg;
        if (source.window === target.window) return;
        let send = source.window.postMessage;
        if (data.mode) { api.mode.set(data.mode.toUpperCase()) }
        if (data.view) { api.view.set(VIEWS[data.view.toUpperCase()]) }
        if (data.function) {
            let cb = data.callback ? (output) => {
                send({event:`${data.function}.done`, data: output});
            } : undefined;
            api.function[data.function.toLowerCase()](cb);
        }
        if (data.event) {
            api.event.on(data.event, (evd) => {
                send({event: data.event, data: evd});
            });
        }
        if (data.emit) api.event.emit(data.emit, data.message)
        if (data.get) switch (data.get) {
            case "mode": send({mode: settings.mode}); break;
            case "device": send({device: settings.device}); break;
            case "process": send({process: settings.process}); break;
            default: send({all: settings}); break;

        }
        if (data.set) switch (data.set) {
            case "features":
                Object.assign(feature, data.features);
                break;
            case "device":
                Object.assign(settings.device, data.options);
                saveSettings();
                break;
            case "process":
                Object.assign(settings.process, data.options);
                saveSettings();
                break;
        }
        if (data.parse) {
            let type = (data.type || 'stl').toLowerCase();
            let bin = data.parse;
            let widget;
            switch (type) {
                case 'stl':
                    if (!bin.buffer) bin = new Float32Array(bin).buffer;
                    new load.STL().parse(bin, vertices => {
                        platform.add(widget = newWidget().loadVertices(vertices));
                        send({event: "parsed", data: [ widget.id ]});
                    });
                    break;
                case 'obj':
                    // todo
                    break;
                case '3mf':
                    // todo
                    break;
                case 'svg':
                    let wid = [];
                    for (let svg of load.SVG.parse(bin)) {
                        if (!(svg && svg.length)) continue;
                        platform.add(widget = newWidget().loadVertices(svg.toFloat32()));
                        wid.push(widget.id);
                    }
                    send({event: "parsed", data: wid});
                    break;
            }
        }
        if (data.load) {
            api.platform.load(data.load, (verts, widget) => {
                send({event: "loaded", data: [ widget.id ]});
            })
        };
        if (data.clear) platform.clear();
        if (data.alert) alert2(data.alert, data.time);
        if (data.progress >= 0) setProgress(data.progress, data.message);
    });

    /** ******************************************************************
     * Stats accumulator
     ******************************************************************* */

    function Stats(db) {
        this.db = db;
        this.obj = js2o(this.db['stats'] || '{}');
        let o = this.obj, k;
        for (k in o) {
            if (!o.hasOwnProperty(k)) continue;
            if (['dn','lo','re'].indexOf(k) >= 0 || k.indexOf('-') > 0 || k.indexOf('_') > 0) {
                delete o[k];
            }
        }
    }

    Stats.prototype.save = function(quiet) {
        this.db['stats'] = o2js(this.obj);
        if (!quiet) {
            api.event.emit('stats', this.obj);
        }
        return this;
    };

    Stats.prototype.get = function(k) {
        return this.obj[k];
    };

    Stats.prototype.set = function(k,v,quiet) {
        this.obj[k] = v;
        this.save(quiet);
        return this;
    };

    Stats.prototype.add = function(k,v,quiet) {
        this.obj[k] = (this.obj[k] || 0) + (v || 1);
        this.save(quiet);
        return this;
    };

    Stats.prototype.del = function(k, quiet) {
        delete this.obj[k];
        this.save(quiet);
        return this;
    };

    let inits = parseInt(SDB.getItem('kiri-init') || STATS.get('init') || 0) + 1;
    SDB.setItem('kiri-init', inits);

    STATS.set('init', inits);
    STATS.set('kiri', kiri.version);

    // remove version from url, preserve other settings
    WIN.history.replaceState({},'','/kiri/' + encodeOpt(SETUP) + LOC.hash);

    /** ******************************************************************
     * Utility Functions
     ******************************************************************* */

    function unitScale() {
        return MODE === MODES.CAM && settings.controller.units === 'in' ? 25.4 : 1;
    }

    function alert2(message, time) {
        if (message === undefined || message === null) {
            return updateAlerts(true);
        }
        let rec = [message, Date.now(), time, true];
        if (feature.alert_event) {
            api.event.emit('alert', rec);
        } else {
            alerts.push(rec);
            updateAlerts();
        }
        return rec;
    }

    function alert2cancel(rec,recs) {
        if (Array.isArray(recs)) {
            for (let r of recs) {
                alert2cancel(r);
            }
            return;
        }
        if (feature.alert_event) {
            api.event.emit('alert.cancel', rec);
            return;
        }
        if (Array.isArray(rec)) {
            rec[3] = false;
            updateAlerts();
        }
    }

    function updateAlerts(clear) {
        if (clear) {
            alerts = [];
        }
        let now = Date.now();
        // filter out by age and active flag
        alerts = alerts.filter(alert => {
            return alert[3] && (now - alert[1]) < ((alert[2] || 5) * 1000);
        });
        // limit to 5 showing
        while (alerts.length > 5) {
            alerts.shift();
        }
        // return if called before UI configured
        if (!UI.alert) {
            return;
        }
        if (alerts.length > 0) {
            UI.alert.text.innerHTML = alerts.map(v => ['<p>',v[0],'</p>'].join('')).join('');
            UI.alert.dialog.style.display = 'flex';
        } else {
            UI.alert.dialog.style.display = 'none';
        }
    }

    function getShowFavorites(bool) {
        if (bool !== undefined) {
            SDB.setItem('dev-favorites', bool);
            showFavorites = bool;
            return bool;
        }
        return showFavorites;
    }

    function triggerSettingsEvent() {
        api.event.emit('settings', settings);
    }

    function isSecure(proto) {
         return proto.toLowerCase().indexOf("https") === 0;
    }

    function ls2o(key,def) {
        return js2o(SDB.getItem(key),def);
    }

    function setProgress(value, msg) {
        if (value) {
            value = (value * 100).round(4);
            UI.loading.display = 'block';
            UI.progress.width = value+'%';
            if (msg) UI.prostatus.innerHTML = msg;
        } else {
            UI.loading.display = 'none';
        }
    }

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
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
            updateFieldsFromSettings(settings.process);
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

        updateFieldsFromSettings(settings.process);
        api.show.alert("update ranges", 2);
        api.event.emit("range.updates", ranges);
    }

    let overrides = {};

    // updates editable fields that are range dependent
    function updateFieldsFromRange() {
        return;
        if (settings.mode !== 'FDM' || viewMode !== VIEWS.SLICE || !settings.process.ranges) {
            let okeys = Object.keys(overrides);
            if (okeys.length) {
                updateFieldsFromSettings(overrides);
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
            updateFieldsFromSettings(values);
        }
        let rkeys = Object.keys(restores);
        if (rkeys.length) {
            updateFieldsFromSettings(restores);
            for (let key of rkeys) {
                delete overrides[key];
            }
        }
        UC.refresh();
    }

    function updateSpeeds(maxSpeed, minSpeed) {
        const { ui } = api;
        ui.speeds.style.display =
            maxSpeed &&
            settings.mode !== 'SLA' &&
            settings.mode !== 'LASER' &&
            viewMode === VIEWS.PREVIEW &&
            ui.showSpeeds.checked ? 'block' : '';
        if (maxSpeed) {
            const colors = [];
            for (let i = 0; i <= maxSpeed; i += maxSpeed / 20) {
                colors.push(Math.round(Math.max(i, 1)));
            }
            kiri.client.colors(colors, maxSpeed, speedColors => {
                const list = [];
                Object.keys(speedColors).map(v => parseInt(v)).sort((a, b) => b - a).forEach(speed => {
                    const color = speedColors[speed];
                    const hex = color.toString(16).padStart(6, 0);
                    const r = (color >> 16) & 0xff;
                    const g = (color >> 8) & 0xff;
                    const b = (color >> 0) & 0xff;
                    const style = `background-color:#${hex}`;
                    list.push(`<label style="${style}">${speed}</label>`);
                });
                ui.speedbar.innerHTML = list.join('');
            });
            api.event.emit('preview.speeds', {
                min: minSpeed,
                max: maxSpeed
            });
        }
    }

    function updateSlider() {
        api.event.emit("slider.set", {
            start: (api.var.layer_lo / api.var.layer_max),
            end: (api.var.layer_hi / api.var.layer_max)
        });
        updateFieldsFromRange();
    }

    function setVisibleLayer(h, l) {
        h = h >= 0 ? h : api.var.layer_hi;
        l = l >= 0 ? l : api.var.layer_lo;
        api.var.layer_hi = bound(h, 0, api.var.layer_max);
        api.var.layer_lo = bound(l, 0, h);
        api.event.emit("slider.label");
        updateSlider();
        showSlices();
    }

    function setWireframe(bool, color, opacity) {
        api.widgets.each(function(w) { w.setWireframe(bool, color, opacity) });
        SPACE.update();
    }

    function updateSliderMax(set) {
        let max = STACKS.getRange().tallest - 1;
        api.var.layer_max = UI.sliderMax.innerText = max;
        if (set || max < api.var.layer_hi) {
            api.var.layer_hi = api.var.layer_max;
            api.event.emit("slider.label");
            updateSlider();
        }
    }

    function hideSlices() {
        STACKS.clear();
        api.widgets.opacity(COLOR.model_opacity);
        api.widgets.each(function(widget) {
            widget.setWireframe(false);
        });
    }

    function setWidgetVisibility(bool) {
        api.widgets.each(w => {
            if (bool) {
                w.show();
            } else {
                w.hide();
            }
        });
    }

    /**
     * hide or show slice-layers and their sub-elements
     *
     * @param {number} [layer]
     */
    function showSlices(layer) {
        if (viewMode === VIEWS.ARRANGE) {
            return;
        }

        showSlider();

        if (typeof(layer) === 'string' || typeof(layer) === 'number') {
            layer = parseInt(layer);
        } else {
            layer = api.var.layer_hi;
        }

        layer = bound(layer, 0, api.var.layer_max);
        if (layer < api.var.layer_lo) api.var.layer_lo = layer;
        api.var.layer_hi = layer;
        api.event.emit("slider.label");

        let cam = MODE === MODES.CAM,
            sla = MODE === MODES.SLA,
            hi = cam ? api.var.layer_max - api.var.layer_lo : api.var.layer_hi,
            lo = cam ? api.var.layer_max - api.var.layer_hi : api.var.layer_lo;

        updateSlider();
        STACKS.setRange(api.var.layer_lo, api.var.layer_hi);

        SPACE.update();
    }

    function showSlider() {
        UI.layers.style.display = 'flex';
        UI.slider.style.display = 'flex';
    }

    function hideSlider() {
        UI.layers.style.display = 'none';
        UI.slider.style.display = 'none';
        UI.speeds.style.display = 'none';
    }

    function loadImageDialog(image, name, force) {
        if (!force && image.byteLength > 2500000) {
            return UC.confirm("Large images may fail to import<br>Consider resizing under 1000 x 1000<br>Proceed with import?").then(ok => {
                if (ok) {
                    loadImageDialog(image, name, true);
                }
            });
        }
        const opt = {pre: [
            "<div class='f-col a-center'>",
            "  <h3>Image Conversion</h3>",
            "  <p class='t-just' style='width:300px;line-height:1.5em'>",
            "  This will create a 3D model from a 2D PNG image. Photos must",
            "  be blurred to be usable. Values from 0=off to 50=high are suggested.",
            "  Higher values incur more processing time.",
            "  </p>",
            "  <div class='f-row t-right'><table>",
            "  <tr><th>blur value</th><td><input id='png-blur' value='0' size='3'></td>",
            "      <th>&nbsp;invert image</th><td><input id='png-inv' type='checkbox'></td></tr>",
            "  <tr><th>base size</th><td><input id='png-base' value='0' size='3'></td>",
            "      <th>&nbsp;invert alpha</th><td><input id='alpha-inv' type='checkbox'></td></tr>",
            "  <tr><th>border size</th><td><input id='png-border' value='0' size='3'></td>",
            "      <th></th><td></td></tr>",
            "  </table></div>",
            "</div>"
        ]};
        UC.confirm(undefined, {convert:true, cancel:false}, undefined, opt).then((ok) => {
            if (ok) {
                loadImage(image, {
                    file: name,
                    blur: parseInt($('png-blur').value) || 0,
                    base: parseInt($('png-base').value) || 0,
                    border: parseInt($('png-border').value) || 0,
                    inv_image: $('png-inv').checked,
                    inv_alpha: $('alpha-inv').checked
                });
            }
        });
    }

    function loadImage(image, opt = {}) {
        const info = Object.assign({settings, png:image}, opt);
        kiri.client.image2mesh(info, progress => {
            api.show.progress(progress, "converting");
        }, output => {
            api.show.progress(0);
            const { bigv, verts, index } = output;
            const widget = newWidget().loadVertices(bigv)
            widget.meta.file = opt.file;
            platform.add(widget);
        });
    }

    /** ******************************************************************
     * Selection Functions
     ******************************************************************* */

    function groupMerge() {
        Widget.Groups.merge(selection.widgets(true));
    }

    function groupSplit() {
        Widget.Groups.split(selection.widgets(false));
    }

    /** ******************************************************************
     * Settings Functions
     ******************************************************************* */

    // given a settings region, update values of matching bound UI fields
    function updateFieldsFromSettings(setrec, uirec = UI, trace) {
        if (!setrec) {
            return console.trace("missing scope");
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
                    let opt = DOC.createElement('option');
                    opt.appendChild(DOC.createTextNode(el.name));
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

    /**
     * @returns {Object}
     */
    function updateSettingsFromFields(setrec, uirec = UI, changes) {
        if (!setrec) {
            return console.trace("missing scope");
        }

        let lastChange = UC.lastChange();

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
                    if (src === 'tools') {
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

    function updateFields() {
        updateFieldsFromSettings(settings.device);
        updateFieldsFromSettings(settings.process);
        updateFieldsFromSettings(settings.controller);
        updateExtruderFields(settings.device);
    }

    function updateExtruderFields(device) {
        if (device.extruders && device.extruders[device.internal]) {
            updateFieldsFromSettings(device.extruders[device.internal]);
            UI.extruder.firstChild.innerText = `${LANG.dv_gr_ext} [${device.internal+1}/${device.extruders.length}]`;
            UI.extPrev.disabled = device.internal === 0;
            UI.extPrev.onclick = function() {
                device.internal--;
                updateExtruderFields(device);
            };
            UI.extNext.disabled = device.internal === device.extruders.length - 1;
            UI.extNext.onclick = function() {
                device.internal++;
                updateExtruderFields(device);
            };
            UI.extDel.disabled = UI.extDel.disabled || device.extruders.length < 2;
            UI.extDel.onclick = function() {
                device.extruders.splice(device.internal,1);
                device.internal = Math.min(device.internal, device.extruders.length-1);
                updateExtruderFields(device);
            };
            UI.extAdd.onclick = function() {
                let copy = clone(device.extruders[device.internal]);
                copy.extSelect = [`T${device.extruders.length}`];
                copy.extDeselect = [];
                device.extruders.push(copy);
                device.internal = device.extruders.length - 1;
                updateExtruderFields(device);
            };
        }
    }

    function updateSettings(opt = {}) {
        let { controller, device, process, mode, sproc, cproc } = settings;
        updateSettingsFromFields(controller);
        switch (controller.units) {
            case 'mm': UC.setUnits(1); break;
            case 'in': UC.setUnits(25.4); break;
        }
        if (opt.controller) {
            return;
        }
        updateSettingsFromFields(device, undefined, undefined, true);
        // range-specific values
        if (settings.mode === 'FDM' && viewMode === VIEWS.SLICE) {
            let changes = {};
            let values = process;
            let { layer_lo, layer_hi, layer_max } = api.var;
            let range = { lo: layer_lo, hi: layer_hi };
            let add = false;
            if (layer_lo > 0 || layer_hi < layer_max) {
                values = Object.clone(process);
                add = true;
            }
            updateSettingsFromFields(values, undefined, changes);
            if (range) {
                updateRange(range.lo, range.hi, changes, add);
            }
        } else {
            updateSettingsFromFields(process);
        }
        if (device.extruders && device.extruders[device.internal]) {
            updateSettingsFromFields(device.extruders[device.internal]);
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

    function saveSettings() {
        const view = SPACE.view.save();
        if (view.left || view.up) {
            settings.controller.view = view;
        }
        const mode = settings.mode;
        settings.sproc[mode].default = settings.process;
        settings.sproc[mode][settings.process.processName] = settings.process;
        settings.device.bedBelt = UI.deviceBelt.checked;
        settings.device.bedRound = UI.deviceRound.checked;
        settings.device.originCenter = UI.deviceOrigin.checked || UI.deviceRound.checked;
        settings.device.fwRetract = UI.fwRetract.checked;
        SDB.setItem('ws-settings', JSON.stringify(settings));
        api.event.emit('settings.saved', settings);
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
        let map = {};
        try {
            data.split('\n')
                .filter(l => l.charAt(0) !== '#')
                .map(l => l.split('=').map(v => v.trim()))
                .map(l => {
                    // convert gcode string into a string array
                    if (l[0].indexOf('_gcode') > 0) {
                        l[1] = l[1].replaceAll('\\n','\n').split('\n');
                    }
                    return l;
                })
                .forEach(l => {
                    map[l[0]] = l[1];
                });
        } catch (e) {
            return UC.alert('invalid file');
        }
        // device setup
        let device = Object.clone(kiri.conf.defaults.fdm.d);
        let dname = device.deviceName = map.printer_model;
        if (dname) {
            let mode = "FDM";
            device.mode = mode;
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
        let process = Object.clone(kiri.conf.defaults.fdm.p);
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
        UC.confirm(`Import "${dname}"?`).then(yes => {
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

    function settingsImport(data, ask) {
        if (typeof(data) === 'string') {
            try {
                data = api.util.b64dec(data);
            } catch (e) {
                UC.alert('invalid import format');
                console.log('data',data);
                return;
            }
        }
        if (LOCAL) console.log('import',data);
        let isSettings = (data.settings && data.version && data.time);
        let isProcess = (data.process && data.version && data.time && data.mode && data.name);
        let isDevice = (data.device && data.version && data.time);
        let isWork = (data.work);
        if (!isSettings && !isDevice && !isProcess) {
            UC.alert('invalid settings or device format');
            console.log('data',data);
            return;
        }
        function doit() {
            if (isDevice) {
                if (settings.devices[data.device]) {
                    UC.confirm(`Replace device ${data.device}?`).then(yes => {
                        if (yes) {
                            settings.devices[data.device] = data.code;
                            api.show.devices();
                        }
                    });
                } else {
                    settings.devices[data.device] = data.code;
                    api.show.devices();
                }
            }
            if (isProcess) {
                if (settings.sproc[data.mode][data.name]) {
                    UC.confirm(`Replace process ${data.name}?`).then(yes => {
                        if (yes) {
                            settings.sproc[data.mode][data.name] = data.process;
                            api.conf.show();
                        }
                    });
                } else {
                    settings.sproc[data.mode][data.name] = data.process;
                    api.conf.show();
                }
            }
            if (isSettings) {
                clearWorkspace();
                settings = CONF.normalize(data.settings);
                SDB.setItem('ws-settings', JSON.stringify(settings));
                if (LOCAL) console.log('settings',Object.clone(settings));
                if (isWork) {
                    api.platform.clear();
                    kiri.codec.decode(data.work).forEach(widget => {
                        platform.add(widget, 0, true);
                    });
                    if (data.view) {
                        SPACE.view.load(data.view);
                    }
                }
                restoreSettings();
                restoreWorkspace(() => {
                    UI.sync();
                }, true);
            }
        }
        if (ask) {
            let opt = {};
            let prompt = isDevice ?
                `Import device "${data.device}"?` : isProcess ?
                `Import process "${data.name}"?` :
                `Import settings made in Kiri:Moto version ${data.version} on<br>${new Date(data.time)}?`;
            if (data.screen) {
                opt.pre = [
                    '<div class="f-col a-center">',
                    `<img src="${data.screen}" style="width:300px"/>`,
                    '</div>'
                ];
            }
            UC.confirm(prompt,undefined,undefined,opt).then((yes) => {
                if (yes) doit();
            });
        } else {
            doit();
        }
    }

    function settingsExport(opts = {}) {
        const WIDGETS = api.widgets.all();
        const note = opts.node || undefined;
        const shot = opts.work || opts.screen ? SPACE.screenshot() : undefined;
        const work = opts.work ? kiri.codec.encode(WIDGETS,{_json_:true}) : undefined;
        const view = opts.work ? SPACE.view.save() : undefined;
        const setn = Object.clone(settings);
        // stuff in legacy annotations for re-import
        for (let w of WIDGETS) {
            setn.widget[w.id] = w.anno;
        }
        const xprt = {
            settings: setn,
            version: kiri.version,
            screen: shot,
            space: SPACE.info,
            note: note,
            work: work,
            view: view,
            moto: moto.id,
            init: SDB.getItem('kiri-init'),
            time: Date.now()
        };
        return opts.clear ? xprt : api.util.b64enc(xprt);
    }

    function loadImageConvert(res, name) {
        let url = URL.createObjectURL(new Blob([res]));

        $('mod-any').innerHTML = `<img id="xsrc" src="${url}"><canvas id="xdst"></canvas>`;

        let img = $('xsrc');
        let can = $('xdst');

        img.onload = () => {
            can.width = img.width;
            can.height = img.height;
            let ctx = can.getContext('2d');
            ctx.drawImage(img, 0, 0);
            fetch(can.toDataURL()).then(r => r.arrayBuffer()).then(data => {
                loadImageDialog(data, name);
            });
        };
    }

    function loadFile() {
        $('load-file').onchange = function(event) {
            console.log(event);
            api.platform.load_files(event.target.files);
        };
        $('load-file').click();
        // alert2("drag/drop STL files onto platform to import\nreload page to return to last saved state");
    }

    function saveWorkspace(quiet) {
        api.conf.save();
        const newWidgets = [];
        const oldWidgets = js2o(SDB.getItem('ws-widgets'), []);
        api.widgets.each(function(widget) {
            if (widget.synth) return;
            newWidgets.push(widget.id);
            oldWidgets.remove(widget.id);
            widget.saveState();
            let ann = api.widgets.annotate(widget.id);
            ann.file = widget.meta.file;
            ann.url = widget.meta.url;
        });
        SDB.setItem('ws-widgets', o2js(newWidgets));
        oldWidgets.forEach(function(wid) {
            Widget.deleteFromState(wid);
        });
        // eliminate dangling saved widgets
        FILES.deleteFilter(key => newWidgets.indexOf(key.substring(8)) < 0, "ws-save-", "ws-savf");
        if (!quiet) {
            alert2("workspace saved", 1);
        }
    }

    function restoreSettings(save) {
        const WIDGETS = api.widgets.all();
        const newset = ls2o('ws-settings') || settings;
        // extract legacy widget annotations into widgets
        if (newset.widget) {
            for (let id of Object.keys(newset.widget)) {
                let anno = newset.widget[id];
                let wid = WIDGETS.filter(w => w.id === id)[0];
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
        settings = CONF.normalize(newset);
        // override camera from settings
        if (settings.controller.view) {
            SDB.removeItem('ws-camera');
        }
        // merge custom filters from localstorage into settings
        localFilters.forEach(function(fname) {
            let fkey = "gcode-filter-"+fname, ov = ls2o(fkey);
            if (ov) settings.devices[fname] = ov;
            SDB.removeItem(fkey)
        });
        SDB.removeItem(localFilterKey);
        // save updated settings
        if (save) api.conf.save();

        return newset;
    }

    function restoreWorkspace(ondone, skip_widget_load) {
        let newset = restoreSettings(false),
            camera = newset.controller.view,
            toload = ls2o('ws-widgets',[]),
            loaded = 0,
            position = true;

        updateFields();
        platform.update_size();

        SPACE.view.reset();
        if (camera) {
            SPACE.view.load(camera);
        } else {
            SPACE.view.home();
        }

        if (skip_widget_load) {
            if (ondone) {
                ondone();
            }
            return;
        }

        // remove any widgets from platform
        api.widgets.each(function(widget) {
            platform.delete(widget);
        });

        // remove widget keys if they are not going to be restored (TODO: remove in 3.1)
        if (settings.widget)
        Object.keys(settings.widget).filter(k => toload.indexOf(k) < 0).forEach(k => {
            delete settings.widget[k];
        });

        // load any widget by name that was saved to the workspace
        toload.forEach(function(widgetid) {
            Widget.loadFromState(widgetid, function(widget) {
                if (widget) {
                    platform.add(widget, 0, position);
                    let ann = api.widgets.annotate(widgetid);
                    widget.meta.file = ann.file;
                    widget.meta.url = ann.url;
                }
                if (++loaded === toload.length) {
                    platform.deselect();
                    if (ondone) {
                        ondone();
                        setTimeout(() => {
                            platform.update_top_z();
                            SPACE.update();
                        }, 1);
                    }
                }
            }, position);
        });

        return toload.length > 0;
    }

    function clearWorkspace() {
        // free up worker cache/mem
        kiri.work.clear();
        platform.select_all();
        platform.delete(selection.meshes());
    }

    function modalShowing() {
        return UI.modal.style.display === 'flex';
    }

    function showModal(which) {
        let mod = UI.modal,
            style = mod.style,
            visible = modalShowing(),
            info = { pct: 0 };

        ["help","setup","tools","prefs","saves","files","print","local","any"].forEach(function(name) {
            UI[name].style.display = name === which ? 'flex' : '';
        });

        function ondone() {
            api.event.emit('modal.show', which);
        }

        if (visible) {
            return ondone();
        }

        style.height = '0';
        style.display = 'flex';

        new TWEEN.Tween(info).
            easing(TWEEN.Easing.Quadratic.InOut).
            to({ pct: 100 }, 100).
            onUpdate(() => { style.height = `${info.pct}%` }).
            onComplete(ondone).
            start();
    }

    function hideModal() {
        if (!modalShowing()) {
            return;
        }
        let mod = UI.modal, style = mod.style, info={pct:100};
        new TWEEN.Tween(info).
            easing(TWEEN.Easing.Quadratic.InOut).
            to({pct:0}, 100).
            onUpdate(() => { style.height = `${info.pct}%` }).
            onComplete(() => { style.display = '' }).
            start();
    }

    function showCatalog() {
        showModal("files");
    }

    function getSettings() {
        return settings;
    }

    function putSettings(newset) {
        settings = CONF.normalize(newset);
        api.conf.save()
        api.space.restore(null, true);
    }

    function editSettings(e) {
        let mode = getMode(),
            name = e.target.getAttribute("name"),
            load = settings.sproc[mode][name],
            edit = prompt(`settings for "${name}"`, JSON.stringify(load));
        if (edit) {
            try {
                settings.sproc[mode][name] = JSON.parse(edit);
                if (name === settings.process.processName) {
                    api.conf.load(null, name);
                }
                api.conf.save();
            } catch (e) {
                UC.alert('malformed settings object');
            }
        }
    }

    function exportSettings(e) {
        let mode = getMode(),
            name = e.target.getAttribute("name"),
            data = api.util.b64enc({
                process: settings.sproc[mode][name],
                version: kiri.version,
                moto: moto.id,
                time: Date.now(),
                mode,
                name
            });
        UC.prompt("Export Process Filename", name).then(name => {
            if (name) {
                api.util.download(data, `${name}.km`);
            }
        });
    }

    function loadSettings(e, named) {
        let mode = getMode(),
            name = e ? e.target.getAttribute("load") : named || currentProcessName() || "default",
            load = settings.sproc[mode][name];

        if (!load) return;

        // cloning loaded process into settings requires user to save
        // process before switching devices or risk losing any changes
        settings.process = clone(load);
        // update process name
        settings.process.processName = name;
        // save named process with the current device
        settings.devproc[currentDeviceName()] = name;
        // preserve name of last library loaded
        if (name !== 'default') {
            settings.cproc[mode] = name;
        }
        // allow mode driver to take any necessary actions
        api.event.emit("settings.load", settings);

        // update UI fields to reflect current settings
        updateFields();
        api.conf.update();

        if (e) triggerSettingsEvent();
    }

    function deleteSettings(e) {
        let name = e.target.getAttribute("del");
        delete settings.sproc[getMode()][name];
        updateSettingsList();
        api.conf.save();
        triggerSettingsEvent();
    }

    function updateSettingsList() {
        let list = [], s = settings, sp = s.sproc[getMode()] || {}, table = UI.settingsList;
        table.innerHTML = '';
        for (let k in sp) {
            if (sp.hasOwnProperty(k)) list.push(k);
        }
        list.filter(n => n !=='default').sort().forEach(function(sk) {
            let row = DOC.createElement('div'),
                load = DOC.createElement('button'),
                edit = DOC.createElement('button'),
                xprt = DOC.createElement('button'),
                del = DOC.createElement('button'),
                name = sk;

            load.setAttribute('load', sk);
            load.onclick = (ev) => {
                api.conf.load(undefined, sk);
                updateSettingsList();
                hideModal();
            }
            load.appendChild(DOC.createTextNode(sk));
            if (sk == settings.process.processName) {
                load.setAttribute('class', 'selected')
            }
            UI.settingsName.value = settings.process.processName;

            del.setAttribute('del', sk);
            del.setAttribute('title', "remove '"+sk+"'");
            del.innerHTML = '<i class="far fa-trash-alt"></i>';
            del.onclick = deleteSettings;

            edit.setAttribute('name', sk);
            edit.setAttribute('title', 'edit');
            edit.innerHTML = '<i class="far fa-edit"></i>';
            edit.onclick = editSettings;

            xprt.setAttribute('name', sk);
            xprt.setAttribute('title', 'export');
            xprt.innerHTML = '<i class="fas fa-download"></i>';
            xprt.onclick = exportSettings;

            row.setAttribute("class", "flow-row");
            row.appendChild(edit);
            row.appendChild(load);
            row.appendChild(xprt);
            row.appendChild(del);
            table.appendChild(row);
        });
    }

    function showSettings() {
        updateSettingsList();
        showModal("saves");
        UI.settingsName.focus();
    }

    function showHelp() {
        showHelpFile(`local`,() => {});
    }

    function showHelpFile(local,then) {
        if (!local) {
            WIN.open("//docs.grid.space/", "_help");
            return;
        }
        $('kiri-version').innerHTML = `${LANG.version} ${kiri.version}`;
        showModal('help');
        api.event.emit('help.show', local);
    }

    function showLocal() {
        showModal('local');
        api.probe.local((err,data) => {
            let devc = 0;
            let bind = [];
            let html = ['<table>'];
            html.push(`<thead><tr><th>device</th><th>type</th><th>status</th><th></th></tr></thead>`);
            html.push(`<tbody>`);
            let recs = [];
            for (let k in data) {
                recs.push(data[k].stat);
            }
            recs.sort((a,b) => {
                return a.device.name < b.device.name ? -1 : 1;
            });
            for (let r of recs) {
                bind.push({uuid: r.device.uuid, host: r.device.addr[0], port: r.device.port});
                html.push(`<tr>`);
                html.push(`<td>${r.device.name}</td>`);
                html.push(`<td>${r.device.mode}</td>`);
                html.push(`<td>${r.state}</td>`);
                html.push(`<td><button id="${r.device.uuid}">admin</button></td>`);
                html.push(`</tr>`);
                devc++;
            }
            html.push(`</tbody>`);
            html.push(`</table>`);
            if (devc) {
                $('mod-local').innerHTML = html.join('');
            } else {
                $('mod-local').innerHTML = `<br><b>no local devices</b>`;
            }
            bind.forEach(rec => {
                $(rec.uuid).onclick = () => {
                    window.open(`http://${rec.host}:${rec.port||4080}/`);
                };
            });
        });
    }

    function setViewMode(mode) {
        const oldMode = viewMode;
        const isCAM = settings.mode === 'CAM';
        viewMode = mode;
        platform.deselect();
        selection.update_info();
        // disable clear in non-arrange modes
        $('view-clear').style.display = mode === VIEWS.ARRANGE ? '' : 'none';
        switch (mode) {
            case VIEWS.ARRANGE:
                api.function.clear_progress();
                UI.back.style.display = '';
                UI.render.style.display = '';
                kiri.client.clear();
                STACKS.clear();
                hideSlider();
                updateSpeeds();
                setVisibleLayer();
                setWidgetVisibility(true);
                api.widgets.opacity(1);
                break;
            case VIEWS.SLICE:
                UI.back.style.display = 'flex';
                if (!isCAM) UI.render.classList.remove('lt-enabled');
                updateSpeeds();
                updateSliderMax();
                setWidgetVisibility(true);
                break;
            case VIEWS.PREVIEW:
                UI.back.style.display = 'flex';
                if (!isCAM) UI.render.classList.remove('lt-enabled');
                setWidgetVisibility(true);
                break;
            default:
                console.log("invalid view mode: "+mode);
                return;
        }
        api.event.emit('view.set', mode);
        DOC.activeElement.blur();
    }

    function getMode() {
        return settings.mode;
    }

    function getModeLower() {
        return getMode().toLowerCase();
    }

    function switchMode(mode) {
        setMode(mode, platform.update_size);
    }

    function setMode(mode, lock, then) {
        if (!MODES[mode]) {
            console.log("invalid mode: "+mode);
            mode = 'FDM';
        }
        // change mode constants
        settings.mode = mode;
        MODE = MODES[mode];
        DRIVER = kiri.driver[mode];
        // update mode display
        $('app-mode-name').innerHTML = mode === 'CAM' ? 'CNC' : mode;
        // highlight relevant device mode button
        ["fdm","sla","cam","laser"].forEach(dev => {
            let cl = $(`mode-${dev}`).classList;
            if (dev === mode.toLowerCase()) {
                cl.add("dev-sel");
            } else {
                cl.remove("dev-sel");
            }
        });
        // restore cached device profile for this mode
        if (settings.cdev[mode]) {
            settings.device = clone(settings.cdev[mode]);
            api.event.emit('device.set', currentDeviceName());
        }
        // really belongs in CAM driver (lots of work / abstraction needed)
        // updateStockVisibility();
        // updates right-hand menu by enabling/disabling fields
        setViewMode(VIEWS.ARRANGE);
        UC.setMode(MODE);
        // sanitize and persist settings
        api.conf.load();
        api.conf.save();
        // other housekeeping
        triggerSettingsEvent();
        platform.update_selected();
        selection.update_bounds(api.widgets.all());
        updateFields();
        // because device dialog, if showing, needs to be updated
        if (modalShowing()) {
            api.show.devices();
        }
        api.space.restore(null, true);
        api.event.emit("mode.set", mode);
        if (then) {
            then();
        }
    }

    function currentDeviceName() {
        return settings.filter[getMode()];
    }

    function currentDeviceCode() {
        return settings.devices[currentDeviceName()];
    }

    function currentProcessName() {
        return settings.cproc[getMode()];
    }

    function currentProcessCode() {
        return settings.sproc[getMode()][currentProcessName()];
    }

    function setControlsVisible(show) {
        $('mid-lcol').style.display = show ? 'flex' : 'none';
        $('mid-rcol').style.display = show ? 'flex' : 'none';
    }

    function downloadBlob(data, filename) {
        let url = WIN.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
        $('mod-any').innerHTML = `<a id="_dexport_" href="${url}" download="${filename}">x</a>`;
        $('_dexport_').click();
    }

    // prevent safari from exiting full screen mode
    DOC.onkeydown = function (evt) { if (evt.keyCode == 27) evt.preventDefault() }

    // complete module loading
    kiri.load_exec();

    // upon restore, seed presets
    api.event.emit('preset', api.conf.dbo());
})();
