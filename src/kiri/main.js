/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function () {

    let iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent),
        // ---------------
        MOTO    = moto,
        KIRI    = self.kiri,
        BASE    = self.base,
        UTIL    = BASE.util,
        DBUG    = BASE.debug,
        LANG    = KIRI.lang.current,
        WIN     = self.window,
        DOC     = self.document,
        LOC     = self.location,
        HOST    = LOC.host.split(':'),
        SETUP   = parseOpt(LOC.search.substring(1)),
        SECURE  = isSecure(LOC.protocol),
        LOCAL   = self.debug && !SETUP.remote,
        SDB     = MOTO.KV,
        ODB     = KIRI.odb = new MOTO.Storage(SETUP.d ? SETUP.d[0] : 'kiri'),
        SPACE   = KIRI.space = MOTO.Space,
        WIDGETS = KIRI.widgets = [],
        CATALOG = KIRI.catalog = KIRI.openCatalog(ODB),
        STATS   = new Stats(SDB),
        SEED    = 'kiri-seed',
        // ---------------
        CONF    = KIRI.conf,
        MODES   = CONF.MODES,
        VIEWS   = CONF.VIEWS,
        clone   = Object.clone,
        settings = clone(CONF.template),
        // ---------------
        Widget    = kiri.Widget,
        newWidget = kiri.newWidget,
        // ---------------
        UI = {},
        UC = KIRI.ui.prefix('kiri').inputAction(updateSettings),
        MODE = MODES.FDM,
        STACKS = KIRI.stacks,
        DRIVER = undefined,
        complete = {},
        onEvent = {},
        selectedMeshes = [],
        localFilterKey ='kiri-gcode-filters',
        localFilters = js2o(SDB.getItem(localFilterKey)) || [],
        // ---------------
        viewMode = VIEWS.ARRANGE,
        local = SETUP.local,
        topZD = 0,
        topZ = 0,
        busy = 0,
        showFavorites = SDB.getItem('dev-favorites') === 'true',
        alerts = [],
        grouping = false,
        saveTimer = null;

    DBUG.enable();

    // remove version, preserve other settings
    WIN.history.replaceState({},'','/kiri/' + encodeOpt(SETUP) + LOC.hash);

    // add show() to catalog for API
    CATALOG.show = showCatalog;

    const feature = {
        seed: true,
        meta: true, // show selected widget metadata
        controls: true, // show or not side menus
        drop_group: undefined, // optional array to group multi drop
        drop_layout: true, // layout on new drop
        preview: true, // allow bypassing preview generation
        hover: false, // when true fires mouse hover events
    };

    const selection = {
        opacity: setOpacity,
        move: moveSelection,
        scale: scaleSelection,
        rotate: rotateSelection,
        meshes: function() { return selectedMeshes.slice() },
        widgets: function() { return selectedMeshes.slice().map(m => m.widget) },
        for_groups: forSelectedGroups,
        for_meshes: forSelectedMeshes,
        for_widgets: forSelectedWidgets,
        delete: function() { platform.delete(selection.widgets()) }
    };

    const platform = {
        add: platformAdd,
        delete: platformDelete,
        layout: platformLayout,
        load: platformLoad,
        load_stl: platformLoadSTL,
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
        update_speeds: updateSpeeds,
        load_files: platformLoadFiles,
        group: platformGroup,
        group_done: platformGroupDone,
        set_font: SPACE.platform.setFont,
        set_axes: SPACE.platform.setAxes,
        set_volume: SPACE.platform.setVolume,
        top_z: () => { return topZ },
        clear: () => { clearWorkspace(); saveWorkspace(true)  }
    };

    const color = {
        wireframe: 0x444444,
        wireframe_opacity: 0.25,
        selected: [ 0xbbff00, 0xbbee00, 0xbbdd00 ],
        deselected: [ 0xffff00, 0xffdd00, 0xffbb00 ],
        slicing: 0xffaaaa,
        preview_opacity: 0.0,
        model_opacity: 1.0,
        slicing_opacity: 0.5,
        sliced_opacity: 0.0,
        cam_preview: 0x0055bb,
        cam_preview_opacity: 0.25,
        cam_sliced_opacity: 0.25
    };

    const lists = {
        shell: [
            { name: "in-out" },
            { name: "out-in" },
        ],
        infill: [
            { name: "vase" },
            { name: "hex" },
            { name: "grid" },
            { name: "gyroid" },
            { name: "triangle" },
            { name: "linear" },
            { name: "bubbles" }
        ],
        units: [
            { name: "mm" },
            { name: "in" }
        ],
        antialias: [
            { name: "1", id: 1 },
            { name: "2", id: 2 },
            { name: "4", id: 4 },
            { name: "8", id: 8 }
        ],
        drillreg: [
            { name: "none" },
            { name: "x axis" },
            { name: "y axis" }
        ],
        detail: [
            { name: "best" },
            { name: "good" },
            { name: "fair" },
            { name: "poor" },
        ],
        linetype: [
            { name: "path" },
            { name: "flat" },
            { name: "line" }
        ],
        animesh: [
            { name: "100" },
            { name: "200" },
            { name: "300" },
            { name: "400" },
            { name: "500" }
        ]
    };

    const tweak = {
        line_precision: (v) => { API.work.config({base:{clipperClean: v}}) },
        gcode_decimals: (v) => { API.work.config({base:{gcode_decimals: v}}) }
    };

    const API = KIRI.api = {
        ui: UI,
        uc: UC,
        sdb: SDB,
        o2js: o2js,
        js2o: js2o,
        ajax: ajax,
        clone: clone,
        focus: () => {},
        stats: STATS,
        catalog: CATALOG,
        busy: {
            val: () => { return busy },
            inc: () => { kiri.api.event.emit("busy", ++busy) },
            dec: () => { kiri.api.event.emit("busy", --busy) }
        },
        conf: {
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
        color,
        const: {
            SEED,
            LANG,
            LOCAL,
            MODES,
            VIEWS,
            SETUP,
            SECURE,
            STACKS,
            SPACE
        },
        var: {
            layer_lo: 0,
            layer_hi: 0,
            layer_max: 0
        },
        device: {
            get: currentDeviceName,
            set: undefined, // set during init
            clone: undefined // set during init
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
            on: addOnEvent,
            emit: sendOnEvent,
            import: loadFile,
            alerts: updateAlerts,
            settings: triggerSettingsEvent
        },
        feature,
        function: {
            slice: prepareSlices,
            print: preparePreview,
            prepare: preparePreview,
            export: prepareExport,
            cancel: cancelWorker,
            clear: KIRI.client.clear
        },
        hide: {
            alert: function(rec) { alert2cancel(rec) },
            import: function() { },
            slider: hideSlider
        },
        language: KIRI.lang,
        lists,
        modal: {
            show: showModal,
            hide: hideModal,
            visible: modalShowing
        },
        mode: {
            get_lower: getModeLower,
            get_id: function() { return MODE },
            get: getMode,
            set: setMode,
            switch: switchMode,
            set_expert: setExpert
        },
        probe: {
            live : "https://live.grid.space",
            grid : function() { return false },
            local : function() { return false }
        },
        platform,
        selection,
        show: {
            alert: alert2,
            devices: undefined, // set during init
            progress: setProgress,
            controls: setControlsVisible,
            favorites: getShowFavorites,
            slices: showSlices,
            layer: setVisibleLayer,
            local: showLocal,
            import: function() { UI.import.style.display = '' }
        },
        space: {
            reload: reload,
            restore: restoreWorkspace,
            clear: clearWorkspace,
            save: saveWorkspace
        },
        tweak,
        util: {
            isSecure
        },
        view: {
            get: function() { return viewMode },
            set: setViewMode,
            update_slider: updateSlider,
            update_fields: updateFields,
            wireframe: setWireframe,
            snapshot: null,
            unit_scale: unitScale
        },
        widgets: {
            new: newWidget,
            all: function() { return WIDGETS.slice() },
            for: forAllWidgets,
            load: Widget.loadFromCatalog,
            meshes: meshArray,
            opacity: setOpacity,
            annotate: (id) => {
                // add per widget annotation
                // for things like extruder and supports
                return settings.widget[id] = ( settings.widget[id] || {} );
            }
        },
        work: KIRI.work
    };

    function reload() {
        API.event.emit('reload');
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
            API.space.save(true);
        }, 1000);
    }

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
            API.event.emit('stats', this.obj);
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

    /** ******************************************************************
     * Utility Functions
     ******************************************************************* */

     function unitScale() {
         return MODE === MODES.CAM &&
            settings.controller.units === 'in' ? 25.4 : 1;
     }

     function alert2(message, time) {
         if (message === undefined) {
             return updateAlerts(true);
         }
         let rec = [message, Date.now(), time, true];
         alerts.push(rec);
         updateAlerts();
         return rec;
     }

     function alert2cancel(rec) {
         rec[3] = false;
         updateAlerts();
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

     function sendOnEvent(name, data) {
         if (name && onEvent[name]) {
             onEvent[name].forEach(function(fn) {
                 fn(data, name);
             });
         }
     }

     function addOnEvent(name, handler) {
         if (Array.isArray(name)) {
             return name.forEach(n => addOnEvent(n, handler));
         }
         if (name && typeof(name) === 'string' && typeof(handler) === 'function') {
             onEvent[name] = onEvent[name] || [];
             onEvent[name].push(handler);
         }
         return API.event;
     }

     function triggerSettingsEvent() {
         API.event.emit('settings', settings);
     }

    function isSecure(proto) {
         return proto.toLowerCase().indexOf("https") === 0;
    }

    function parseOpt(ov) {
        let opt = {}, kv, kva;
        // handle kiri legacy and proper url encoding better
        ov.replace(/&/g,',').split(',').forEach(function(el) {
            kv = decodeURIComponent(el).split(':');
            if (kv.length === 2) {
                kva = opt[kv[0]] = opt[kv[0]] || [];
                kva.push(decodeURIComponent(kv[1]));
            }
        });
        return opt;
    }

    function encodeOpt(opt) {
        let out = [];
        Object.keys(opt).forEach(key => {
            if (key === 'ver') return;
            let val = opt[key];
            out.push(encodeURIComponent(key) + ":" + encodeURIComponent(val));
        });
        return out.length ? '?' + out.join(',') : '';
    }

    function ajax(url, fn, rt, po, hd) {
        return new MOTO.Ajax(fn, rt).request(url, po, hd);
    }

    function o2js(o,def) {
        return o ? JSON.stringify(o) : def || null;
    }

    function js2o(s,def) {
        try {
            return s ? JSON.parse(s) : def || null;
        } catch (e) {
            console.log({malformed_json:s});
            return def || null;
        }
    }

    function ls2o(key,def) {
        return js2o(SDB.getItem(key),def);
    }

    function setProgress(value, msg) {
        if (value) {
            value = UTIL.round(value*100,4);
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

    function updateSlider() {
        API.event.emit("slider.set", {
            start: (API.var.layer_lo / API.var.layer_max),
            end: (API.var.layer_hi / API.var.layer_max)
        });
    }

    function setVisibleLayer(h, l) {
        h = h >= 0 ? h : API.var.layer_hi;
        l = l >= 0 ? l : API.var.layer_lo;
        API.var.layer_hi = bound(h, 0, API.var.layer_max);
        API.var.layer_lo = bound(l, 0, h);
        API.event.emit("slider.label");
        updateSlider();
        showSlices();
    }

    function meshArray() {
        let out = [];
        forAllWidgets(function(widget) {
            out.push(widget.mesh);
            out.appendAll(widget.adds);
        });
        return out;
    }

    function forAllWidgets(f) {
        WIDGETS.slice().forEach(function(widget) {
            f(widget);
        });
    }

    function forSelectedGroups(f) {
        let m = selectedMeshes;
        if (m.length === 0 && WIDGETS.length === 1) m = [ WIDGETS[0].mesh ];
        let v = [];
        m.slice().forEach(function (mesh) {
            if (v.indexOf(mesh.widget.group) < 0) f(mesh.widget);
            v.push(mesh.widget.group);
        });
    }

    function forSelectedWidgets(f,noauto) {
        let m = selectedMeshes;
        if (m.length === 0 && WIDGETS.length === 1) {
            m = noauto ? [] : [ WIDGETS[0].mesh ];
        }
        m.slice().forEach(function (mesh) { f(mesh.widget) });
    }

    function forSelectedMeshes(f) {
        selectedMeshes.slice().forEach(function (mesh) { f(mesh) });
    }

    function setWireframe(bool, color, opacity) {
        forAllWidgets(function(w) { w.setWireframe(bool, color, opacity) });
        SPACE.update();
    }

    function updateSliderMax(set) {
        let max = STACKS.getRange().tallest - 1;
        API.var.layer_max = UI.sliderMax.innerText = max;
        if (set || max < API.var.layer_hi) {
            API.var.layer_hi = API.var.layer_max;
            API.event.emit("slider.label");
            updateSlider();
        }
    }

    function hideSlices() {
        STACKS.clear();
        setOpacity(color.model_opacity);
        forAllWidgets(function(widget) {
            widget.setWireframe(false);
        });
    }

    function setWidgetVisibility(bool) {
        forAllWidgets(w => {
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
            layer = API.var.layer_hi;
        }

        layer = bound(layer, 0, API.var.layer_max);
        if (layer < API.var.layer_lo) API.var.layer_lo = layer;
        API.var.layer_hi = layer;
        API.event.emit("slider.label");

        let cam = MODE === MODES.CAM,
            sla = MODE === MODES.SLA,
            hi = cam ? API.var.layer_max - API.var.layer_lo : API.var.layer_hi,
            lo = cam ? API.var.layer_max - API.var.layer_hi : API.var.layer_lo;

        updateSlider();
        STACKS.setRange(API.var.layer_lo, API.var.layer_hi);

        SPACE.update();
    }

    function cancelWorker() {
        if (KIRI.work.isSlicing()) KIRI.work.restart();
    }

    function showSlider() {
        UI.layers.style.display = 'flex';
        UI.slider.style.display = 'flex';
    }

    function hideSlider(andmenu) {
        UI.layers.style.display = 'none';
        UI.slider.style.display = 'none';
        UI.speeds.style.display = 'none';
    }

    function updateSpeeds(maxSpeed) {
        UI.speeds.style.display =
            settings.mode !== 'SLA' &&
            settings.mode !== 'LASER' &&
            viewMode === VIEWS.PREVIEW &&
            UI.showSpeeds.checked ? 'block' : '';
        if (maxSpeed) {
            const colors = [];
            for (let i=0; i<= maxSpeed; i += maxSpeed/20) {
                colors.push(Math.round(Math.max(i,1)));
            }
            KIRI.client.colors(colors, maxSpeed, speedColors => {
                const list = [];
                Object.keys(speedColors).map(v => parseInt(v)).sort((a,b) => b-a).forEach(speed => {
                    const color = speedColors[speed];
                    const hex = color.toString(16).padStart(6,0);
                    const r = (color >> 16) & 0xff;
                    const g = (color >>  8) & 0xff;
                    const b = (color >>  0) & 0xff;
                    const style = `background-color:#${hex}`;
                    list.push(`<label style="${style}">${speed}</label>`);
                });
                UI.speedbar.innerHTML = list.join('');
            });
        }
    }

    function prepareSlices(callback) {
        if (viewMode == VIEWS.ARRANGE) {
            let snap = SPACE.screenshot();
            API.view.snapshot = snap.substring(snap.indexOf(",")+1);
            KIRI.work.snap(API.view.snapshot);
        }
        if (MODE === MODES.SLA && !callback) {
            callback = preparePreview;
        }

        // clear completion marks
        complete = {};

        hideSlider(true);
        platform.deselect();
        setViewMode(VIEWS.SLICE);

        API.conf.save();
        API.event.emit('slice.begin', getMode());

        let countdown = WIDGETS.length,
            totalProgress,
            track = {},
            mode = settings.mode,
            now = Date.now();

        // require topo be sent back from worker for local printing
        settings.synth.sendTopo = false;

        setOpacity(color.slicing_opacity);

        STACKS.clear();

        // for each widget, slice
        forAllWidgets(function(widget) {
            let segtimes = {},
                segNumber = 0,
                errored = false,
                startTime = Date.now(),
                lastMsg,
                camOrLaser = mode === 'CAM' || mode === 'LASER',
                stack = STACKS.create(widget.id, widget.mesh);

            widget.stats.progress = 0;
            widget.setColor(color.slicing);
            widget.slice(settings, function(sliced, error) {
                let mark = Date.now();
                // update UI info
                if (sliced) {
                    // update segment time
                    if (lastMsg) {
                        segtimes[`${segNumber++}_${lastMsg}`] = mark - startTime;
                    }
                    API.event.emit('slice', getMode());
                }
                // on done
                segtimes[`${segNumber}_draw`] = widget.render(stack);
                updateSliderMax(true);
                setVisibleLayer(-1, 0);
                // clear wireframe
                widget.setWireframe(false, color.wireframe, color.wireframe_opacity);
                widget.setOpacity(camOrLaser ? color.cam_sliced_opacity : color.sliced_opacity);
                widget.setColor(color.deselected);
                // on the last exit, update ui and call the callback
                if (--countdown === 0 || error || errored) {
                    // mark slicing complete for prep/preview
                    complete.slice = true;
                    API.show.progress(0);
                    SPACE.scene.active();
                    API.event.emit('slice.end', getMode());
                    // print stats
                    segtimes.total = Date.now() - now;
                    DBUG.log(segtimes);
                    if (callback && typeof callback === 'function') {
                        callback();
                    }
                }
                // handle slicing errors
                if (error && !errored) {
                    errored = true;
                    setViewMode(VIEWS.ARRANGE);
                    setOpacity(color.model_opacity);
                    platform.deselect();
                    alert2(error);
                }
            }, function(update, msg) {
                if (msg && msg !== lastMsg) {
                    let mark = Date.now();
                    if (lastMsg) {
                        segtimes[`${segNumber++}_${lastMsg}`] = mark - startTime;
                    }
                    lastMsg = msg;
                    startTime = mark;
                }
                // on update
                track[widget.id] = update;
                totalProgress = 0;
                forAllWidgets(function(w) {
                    totalProgress += (track[w.id] || 0);
                });
                API.show.progress((totalProgress / WIDGETS.length), msg);
            });
        });
    }

    function preparePreview(callback) {
        if (complete.preview) {
            return;
        }
        if (!complete.slice) {
            prepareSlices(() => {
                preparePreview(callback);
            });
            return;
        }

        hideSlider(true);

        let isCam = MODE === MODES.CAM, pMode = getMode();

        if (feature.preview) {
            setViewMode(VIEWS.PREVIEW);
        }
        API.conf.save();
        API.event.emit('preview.begin', pMode);

        if (isCam) {
            setOpacity(color.cam_preview_opacity);
            forAllWidgets(function(widget) {
                widget.setColor(color.cam_preview);
            });
        } else if (feature.preview) {
            setOpacity(color.preview_opacity);
        }

        let segtimes = {},
            segNumber = 0,
            startTime,
            lastMsg,
            now = Date.now(),
            output = [];

        KIRI.client.prepare(settings, function(progress, message, layer) {
            if (layer) {
                output.push(KIRI.codec.decode(layer));
            }
            if (message && message !== lastMsg) {
                let mark = Date.now();
                if (lastMsg) {
                    segtimes[`${segNumber++}_${lastMsg}`] = mark - startTime;
                }
                lastMsg = message;
                startTime = mark;
            }
            API.show.progress(progress, message);
        }, function (oldout, maxSpeed) {
            if (lastMsg) {
                segtimes[`${segNumber++}_${lastMsg}`] = Date.now() - startTime;
            }

            API.show.progress(0);
            if (!isCam) setOpacity(0);

            // output = KIRI.codec.decode(output);
            if (feature.preview && output.length) {
                startTime = Date.now();
                STACKS.clear();
                const stack = STACKS.create('print', SPACE.platform.world)
                output.forEach(layer => {
                    stack.add(layer);
                });
                segtimes[`${segNumber}_draw`] = Date.now() - startTime;
            }

            // print stats
            segtimes.total = Date.now() - now;
            DBUG.log(segtimes);

            API.event.emit('print', pMode);
            API.event.emit('preview.end', pMode);

            if (feature.preview) {
                SPACE.update();
                updateSliderMax(true);
                setVisibleLayer(-1, 0);
                updateSpeeds(maxSpeed);
            }

            // mark preview complete for export
            complete.preview = true;

            if (typeof(callback) === 'function') {
                callback();
            }
        });
    }

    function prepareExport() {
        const argsave = arguments;
        if (!complete.preview) {
            preparePreview(() => {
                prepareExport(...argsave);
            });
            return;
        }
        complete.export = true;
        KIRI.export(...argsave);
    }

    function loadCode(code, type) {
        setViewMode(VIEWS.PREVIEW);
        setOpacity(0);

        API.event.emit("code.load", {code, type});
        KIRI.client.parse({code, type, settings}, progress => {
            API.show.progress(progress, "parsing");
        }, (layers, maxSpeed) => {
            API.show.progress(0);
            STACKS.clear();
            const stack = STACKS.create('parse', SPACE.platform.world);
            layers.forEach(layer => stack.add(layer));
            updateSliderMax(true);
            updateSpeeds(maxSpeed);
            showSlices();
            SPACE.update();
            API.event.emit("code.loaded", {code, type});
        });
    }

    function loadImageDialog(image, name) {
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
        let info = Object.assign({settings, png:image}, opt);
        KIRI.client.image2mesh(info, progress => {
            API.show.progress(progress, "converting");
        }, output => {
            API.show.progress(0);
            let {bigv, verts, index} = output;
            // let mat = new THREE.MeshPhongMaterial({
            //     shininess: 0x101010,
            //     specular: 0x101010,
            //     transparent: true,
            //     opacity: 1,
            //     color: 0x999999,
            //     side: THREE.DoubleSide
            // });
            //
            // let geo = new THREE.BufferGeometry();
            // geo.setAttribute('position', new THREE.BufferAttribute(bigv, 3));
            // // geo.setIndex([...index]); // doesn't like the Uint32Array
            // geo.computeFaceNormals();
            // geo.computeVertexNormals();
            //
            // let mesh = new THREE.Mesh(geo, mat);
            // mesh.castShadow = true;
            // mesh.receiveShadow = true;
            //
            // SPACE.platform.world.add(mesh);
            let widget = newWidget().loadVertices(bigv)
            widget.meta.file = opt.file;
            platform.add(widget);
        });
    }

    /** ******************************************************************
     * Selection Functions
     ******************************************************************* */

    function updateSelectedInfo() {
        let bounds = new THREE.Box3(), track;
        forSelectedMeshes(mesh => {
            bounds = bounds.union(mesh.getBoundingBox());
            track = mesh.widget.track;
        });
        if (bounds.min.x === Infinity) {
            if (selectedMeshes.length === 0) {
                UI.sizeX.value = 0;
                UI.sizeY.value = 0;
                UI.sizeZ.value = 0;
                UI.scaleX.value = 1;
                UI.scaleY.value = 1;
                UI.scaleZ.value = 1;
            }
            return;
        }
        let dx = bounds.max.x - bounds.min.x,
            dy = bounds.max.y - bounds.min.y,
            dz = bounds.max.z - bounds.min.z,
            scale = unitScale();
        UI.sizeX.value = UI.sizeX.was = UTIL.round(dx/scale,2);
        UI.sizeY.value = UI.sizeY.was = UTIL.round(dy/scale,2);
        UI.sizeZ.value = UI.sizeZ.was = UTIL.round(dz/scale,2);
        UI.scaleX.value = UI.scaleX.was = track.scale.x;
        UI.scaleY.value = UI.scaleY.was = track.scale.y;
        UI.scaleZ.value = UI.scaleZ.was = track.scale.z;
        updateSelectedBounds();
    }

    function updateSelectedBounds() {
        // update bounds on selection for drag limiting
        let bounds_sel = new THREE.Box3();
        forSelectedWidgets(function(widget) {
            let wp = widget.track.pos;
            let wb = widget.mesh.getBoundingBox().clone();
            wb.min.x += wp.x;
            wb.max.x += wp.x;
            wb.min.y += wp.y;
            wb.max.y += wp.y;
            bounds_sel.union(wb);
        });
        settings.bounds_sel = bounds_sel;
    }

    function setOpacity(value) {
        forAllWidgets(function (w) { w.setOpacity(value) });
        SPACE.update();
    }

    function moveSelection(x, y, z, abs) {
        if (viewMode !== VIEWS.ARRANGE) return;
        forSelectedGroups(function (w) {
            w.move(x, y, z, abs);
        });
        updateSelectedBounds();
        API.event.emit('selection.move', {x, y, z, abs});
        SPACE.update();
        auto_save();
    }

    function scaleSelection() {
        if (viewMode !== VIEWS.ARRANGE) return;
        let args = arguments;
        forSelectedGroups(function (w) {
            w.scale(...args);
        });
        platform.compute_max_z();
        updateSelectedBounds();
        API.event.emit('selection.scale', [...arguments]);
        // skip update if last argument is strictly 'false'
        if ([...arguments].pop() === false) {
            return;
        }
        updateSelectedInfo();
        SPACE.update();
        auto_save();
    }

    function rotateSelection(x, y, z) {
        if (viewMode !== VIEWS.ARRANGE) return;
        forSelectedGroups(function (w) {
            w.rotate(x, y, z);
            API.event.emit('widget.rotate', {widget: w, x, y, z});
        });
        updateSelectedBounds();
        platform.compute_max_z();
        API.event.emit('selection.rotate', {x, y, z});
        updateSelectedInfo();
        SPACE.update();
        auto_save();
    }

    /** ******************************************************************
     * Platform Functions
     ******************************************************************* */

     function platformUpdateOrigin() {
         platform.update_bounds();

         let dev = settings.device;
         let proc = settings.process;
         let ruler = settings.controller.showRulers;
         let stock = settings.stock;
         let stockCenter = stock.center || {};
         let hasStock = stock.x && stock.y && stock.z;
         let center = MODE === MODES.FDM ? dev.originCenter :
            MODE === MODES.SLA ? false :
            MODE === MODES.CAM ? proc.outputOriginCenter :
            dev.originCenter || proc.outputOriginCenter;
         let x = 0;
         let y = 0;
         let z = 0;
         if (MODE === MODES.CAM && proc.camOriginTop) {
             z = (topZ + topZD) + 0.01;
         }
         if (!center) {
             if (hasStock) {
                 x = (-stock.x / 2) + stockCenter.x;
                 y = (stock.y / 2) - stockCenter.y;
             } else {
                 if (MODE === MODES.LASER && proc.outputOriginBounds) {
                     let b = settings.bounds;
                     x = b.min.x,
                     y = -b.min.y
                 } else {
                     x = -dev.bedWidth / 2;
                     y = dev.bedDepth / 2;
                 }
             }
         } else if (hasStock) {
             x = stockCenter.x;
             y = -stockCenter.y;
         }
         settings.origin = {x, y, z};
         SPACE.platform.setRulers(ruler, ruler, center, 1/unitScale());
         if (settings.controller.showOrigin && MODE !== MODES.SLA) {
             SPACE.platform.setOrigin(x,y,z);
         } else {
             SPACE.platform.setOrigin();
         }
     }

     function platformUpdateTopZ(zdelta) {
         topZD = zdelta !== undefined ? zdelta : topZD;
         let stock = settings.stock;
         let hasStock = stock.x && stock.y && stock.z;
         let alignTopOk = WIDGETS.length > 1 && settings.controller.alignTop;
         let camz = (MODE === MODES.CAM) && (hasStock || alignTopOk);
         let czto = hasStock ? settings.process.camZTopOffset : 0;
         let ztop = camz ? (topZ + topZD) - czto : 0;
         forAllWidgets(function(widget) {
             widget.setTopZ(ztop);
         });
     }

    function platformUpdateSize() {
        let frozen = SPACE.scene.freeze(true);
        let dev = settings.device,
            width, depth,
            height = Math.round(Math.max(dev.bedHeight, dev.bedWidth/100, dev.bedDepth/100));
        SPACE.platform.setRound(dev.bedRound);
        SPACE.platform.setSize(
            width = parseInt(dev.bedWidth),
            depth = parseInt(dev.bedDepth),
            height = parseFloat(dev.bedHeight),
            parseFloat(dev.maxHeight)
        );
        let proc = settings.process,
            ctrl = settings.controller,
            ruler = ctrl.showRulers,
            unitMM = ctrl.units === 'mm',
            gridMajor = unitMM ? 25 : 25.4,
            gridMinor = unitMM ? 5 : 25.4 / 10;
        if (ctrl.dark) {
            SPACE.platform.setGrid(gridMajor, gridMinor, 0x999999, 0x333333);
            SPACE.platform.opacity(0.8);
            SPACE.setSkyColor(0);
            DOC.body.classList.add('dark');
        } else {
            SPACE.platform.setGrid(gridMajor, gridMinor, 0x999999, 0xcccccc);
            SPACE.platform.opacity(0.3);
            SPACE.setSkyColor(0xffffff);
            DOC.body.classList.remove('dark');
        }
        SPACE.platform.setRulers(ruler, ruler, proc.outputOriginCenter, 1/unitScale());
        SPACE.platform.setGZOff(height/2 - 0.1);
        platform.update_origin();
        SPACE.scene.freeze(frozen);
    }

    function platformUpdateBounds() {
        let bounds = new THREE.Box3();
        forAllWidgets(function(widget) {
            let wp = widget.track.pos;
            let wb = widget.mesh.getBoundingBox().clone();
            wb.min.x += wp.x;
            wb.max.x += wp.x;
            wb.min.y += wp.y;
            wb.max.y += wp.y;
            bounds.union(wb);
        });
        return settings.bounds = bounds;
    }

    function platformSelect(widget, shift) {
        if (viewMode !== VIEWS.ARRANGE) {
            return;
        }
        let mesh = widget.mesh,
            sel = (selectedMeshes.indexOf(mesh) >= 0);
        if (sel) {
            if (shift) {
                platform.deselect(widget)
            } else if (selectedMeshes.length > 1) {
                platform.deselect();
                platform.select(widget, false);
            }
        } else {
            // prevent selection in slice view
            if (!mesh.material.visible) return;
            if (!shift) platform.deselect();
            selectedMeshes.push(mesh);
            API.event.emit('widget.select', widget);
            widget.setColor(color.selected, settings);
            updateSelectedInfo();
        }
        platformUpdateSelected();
        SPACE.update();
    }

    function platformSelectedCount() {
        return viewMode === VIEWS.ARRANGE ? selectedMeshes.length : 0;
    }

    function platformUpdateSelected() {
        let selcount = platform.selected_count();
        let extruders = settings.device.extruders;
        let menu_show = selcount ? 'flex': '';
        $('winfo').style.display = 'none';
        if (selcount) {
            UI.scale.classList.add('lt-enabled');
            UI.rotate.classList.add('lt-enabled');
            UI.nozzle.classList.add('lt-enabled');
            UI.trash.style.display = 'flex';
            if (feature.meta && selcount === 1) {
                let sel = selection.widgets()[0];
                let name = sel.meta.file || sel.meta.url;
                if (name) {
                    name = name
                        .toLowerCase()
                        .replace(/_/g,' ')
                        .replace(/.png/,'')
                        .replace(/.stl/,'');
                    let sp = name.indexOf('/');
                    if (sp >= 0) {
                        name = name.substring(sp + 1);
                    }
                    $('winfo').style.display = 'flex';
                    $('winfo').innerHTML = `${UTIL.comma(sel.meta.vertices)}<br>${name}`;
                }
            }
        } else {
            UI.scale.classList.remove('lt-enabled');
            UI.rotate.classList.remove('lt-enabled');
            UI.nozzle.classList.remove('lt-enabled');
            UI.trash.style.display = '';
        }
        UI.nozzle.style.display = extruders && extruders.length > 1 ? 'flex' : '';
        if (extruders) {
            for (let i=0; i<extruders.length; i++) {
                let b = $(`sel-ext-${i}`);
                if (b) b.classList.remove('pop-sel');
            }
            forSelectedWidgets(w => {
                w.setColor(color.selected, settings);
                let ext = API.widgets.annotate(w.id).extruder || 0;
                let b = $(`sel-ext-${ext}`);
                if (b) b.classList.add('pop-sel');
            }, true);
        }
    }

    function platformDeselect(widget) {
        if (viewMode !== VIEWS.ARRANGE) {
            // don't de-select and re-color widgets in,
            // for example, sliced or preview modes
            return;
        }
        if (!widget) {
            forAllWidgets(function(widget) {
                platform.deselect(widget);
            });
            return;
        }
        let mesh = widget.mesh,
            si = selectedMeshes.indexOf(mesh),
            sel = (si >= 0);
        if (sel) {
            selectedMeshes.splice(si,1);
            API.event.emit('widget.deselect', widget);
        }
        widget.setColor(color.deselected, settings);
        platformUpdateSelected();
        SPACE.update();
        updateSelectedInfo();
    }

    function platformLoad(url, onload) {
        if (url.toLowerCase().indexOf(".stl") > 0) {
            platform.load_stl(url, onload);
        } else {
            ajax(url, function(vertices) {
                vertices = js2o(vertices).toFloat32();
                let widget = newWidget().loadVertices(vertices);
                widget.meta.url = url;
                platform.add(widget);
                if (onload) onload(vertices, widget);
            });
        }
    }

    function platformLoadSTL(url, onload, formdata) {
        new MOTO.STL().load(url, function(vertices, filename) {
            if (vertices) {
                let widget = newWidget().loadVertices(vertices);
                widget.meta.file = filename;
                platform.add(widget);
                if (onload) {
                    onload(vertices, widget);
                }
            }
        }, formdata);
    }

    function platformComputeMaxZ() {
        topZ = 0;
        forAllWidgets(function(widget) {
            topZ = Math.max(topZ, widget.mesh.getBoundingBox().max.z);
        });
        SPACE.platform.setMaxZ(topZ);
    }

    function platformGroup() {
        grouping = true;
    }

    // called after all new widgets are loaded to update group positions
    function platformGroupDone(skipLayout) {
        grouping = false;
        Widget.Groups.loadDone();
        if (feature.drop_layout && !skipLayout) platform.layout();
    }

    function platformAdd(widget, shift, nolayout) {
        if (!settings.widget[widget.id]) {
            settings.widget[widget.id] = {extruder: 0};
        }
        WIDGETS.push(widget);
        SPACE.platform.add(widget.mesh);
        platform.select(widget, shift);
        platform.compute_max_z();
        API.event.emit('widget.add', widget);
        auto_save();
        if (nolayout) {
            return;
        }
        if (!grouping) {
            platformGroupDone();
        } else if (feature.drop_layout) {
            platform.layout();
        }
    }

    function platformDelete(widget) {
        if (!widget) {
            return;
        }
        if (Array.isArray(widget)) {
            let mc = widget.slice(), i;
            for (i=0; i<mc.length; i++) {
                platform.delete(mc[i].widget || mc[i]);
            }
            return;
        }
        KIRI.work.clear(widget);
        delete settings.widget[widget.id];
        WIDGETS.remove(widget);
        Widget.Groups.remove(widget);
        SPACE.platform.remove(widget.mesh);
        selectedMeshes.remove(widget.mesh);
        updateSliderMax();
        platform.compute_max_z();
        if (MODE !== MODES.FDM) {
            platform.layout();
        }
        SPACE.update();
        platformUpdateSelected();
        if (feature.drop_layout) platform.layout();
        API.event.emit('widget.delete', widget);
        auto_save();
    }

    function platformSelectAll() {
        forAllWidgets(function(w) { platform.select(w, true) })
    }

    function platformLayout(event, space) {
        let auto = UI.autoLayout.checked,
            proc = settings.process,
            oldmode = viewMode,
            layout = (viewMode === VIEWS.ARRANGE && auto);

        switch (MODE) {
            case MODES.SLA:
                space = space || (proc.slaSupportLayers && proc.slaSupportDensity ? 2 : 1);
                break;
            case MODES.CAM:
            case MODES.LASER:
                space = space || proc.outputTileSpacing || 1;
                break;
            case MODES.FDM:
                space = space || ((proc.sliceSupportExtra || 0) * 2) + 1;
                break;
        }

        setViewMode(VIEWS.ARRANGE);
        hideSlices();
        auto_save();

        // only auto-layout when in arrange mode
        if (oldmode !== VIEWS.ARRANGE) {
            API.event.emit('platform.layout');
            return SPACE.update();
        }

        // do not layout when switching back from slice view
        if (!auto || (!space && !layout)) {
            API.event.emit('platform.layout');
            return SPACE.update();
        }

        let gap = space;

        // in CNC mode with >1 widget, force layout with spacing @ 1.5x largest tool diameter
        if (MODE === MODES.CAM && WIDGETS.length > 1) {
            let spacing = space || 1, CAM = KIRI.driver.CAM;
            if (proc.camRoughOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, proc.camRoughTool));
            if (proc.camOutlineOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, proc.camOutlineTool));
            gap = spacing * 1.5;
        }

        let i, m, sz = SPACE.platform.size(),
            mp = [sz.x, sz.y],
            ms = [mp[0] / 2, mp[1] / 2],
            c = Widget.Groups.blocks().sort(MOTO.Sort),
            p = new MOTO.Pack(ms[0], ms[1], gap).fit(c);

        while (!p.packed) {
            ms[0] *= 1.1;
            ms[1] *= 1.1;
            p = new MOTO.Pack(ms[0], ms[1], gap).fit(c);
        }

        for (i = 0; i < c.length; i++) {
            m = c[i];
            m.fit.x += m.w / 2 + p.pad;
            m.fit.y += m.h / 2 + p.pad;
            m.move(p.max.w / 2 - m.fit.x, p.max.h / 2 - m.fit.y, 0, true);
            // m.material.visible = true;
        }

        platform.update_origin();

        API.event.emit('platform.layout');
        SPACE.update();
    }

    /** ******************************************************************
     * Settings Functions
     ******************************************************************* */

    // given a settings region, update values of matching bound UI fields
    function updateFieldsFromSettings(scope) {
        if (!scope) return console.trace("missing scope");
        for (let key in scope) {
            if (!scope.hasOwnProperty(key)) continue;
            let val = scope[key];
            if (UI.hasOwnProperty(key)) {
                let uie = UI[key], typ = uie ? uie.type : null;
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
                        list = settings[source] || lists[source],
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
    }

    /**
     * @returns {Object}
     */
    function updateSettingsFromFields(scope) {
        if (!scope) return console.trace("missing scope");

        let key, changed = false;

        // for each key in scope object
        for (key in scope) {
            if (!scope.hasOwnProperty(key)) {
                continue;
            }
            if (UI.hasOwnProperty(key)) {
                let nval = null, uie = UI[key];
                // skip empty UI values
                if (!uie || uie === '') {
                    continue;
                }
                if (uie.type === 'text') {
                    nval = UI[key].convert();
                } else if (uie.type === 'checkbox') {
                    nval = UI[key].checked;
                } else if (uie.type === 'select-one') {
                    if (uie.selectedIndex >= 0) {
                        nval = uie.options[uie.selectedIndex].value;
                        let src = uie.parentNode.getAttribute('source');
                        if (src === 'tools') {
                            nval = parseInt(nval);
                        }
                    } else {
                        nval = scope[key];
                    }
                } else if (uie.type === 'textarea') {
                    nval = uie.value.trim().split('\n').filter(v => v !== '');
                } else {
                    continue;
                }
                if (scope[key] != nval) {
                    scope[key] = nval;
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
            UI.extDel.disabled = device.extruders.length < 2;
            UI.extDel.onclick = function() {
                device.extruders.splice(device.internal,1);
                device.internal = Math.min(device.internal, device.extruders.length-1);
                updateExtruderFields(device);
            };
            UI.extAdd.onclick = function() {
                let copy = clone(device.extruders[device.internal]);
                copy.extSelect = [`T${device.extruders.length}`];
                device.extruders.push(copy);
                device.internal = device.extruders.length - 1;
                updateExtruderFields(device);
            };
        }
    }

    function updateSettings(opt = {}) {
        updateSettingsFromFields(settings.controller);
        switch (settings.controller.units) {
            case 'mm': UC.setUnits(1); break;
            case 'in': UC.setUnits(25.4); break;
        }
        if (opt.controller) {
            return;
        }
        updateSettingsFromFields(settings.device);
        updateSettingsFromFields(settings.process);
        let device = settings.device;
        if (device.extruders && device.extruders[device.internal]) {
            updateSettingsFromFields(device.extruders[device.internal]);
        }
        API.conf.save();
        $('mode-device').innerText = settings.device.deviceName;
        $('mode-profile').innerText = settings.process.processName;
    }

    function saveSettings() {
        const view = SPACE.view.save();
        if (view.left || view.up) {
            settings.controller.view = view;
        }
        const mode = settings.mode;
        settings.sproc[mode].default = settings.process;
        settings.device.bedRound = UI.deviceRound.checked;
        settings.device.originCenter = UI.deviceOrigin.checked;
        SDB.setItem('ws-settings', JSON.stringify(settings));
        API.event.emit('settings.saved', settings);
    }

    function settingsImport(data, ask) {
        if (typeof(data) === 'string') {
            try {
                data = JSON.parse(atob(data));
            } catch (e) {
                UC.alert('invalid settings format');
                console.log('data',data);
                return;
            }
        }
        if (LOCAL) console.log('import',data);
        let isSettings = (data.settings && data.version && data.time);
        let isDevice = (data.device && data.version && data.time);
        let isWork = (data.work);
        if (!isSettings && !isDevice) {
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
                            API.show.devices();
                        }
                    });
                } else {
                    settings.devices[data.device] = data.code;
                    API.show.devices();
                }
            }
            if (isSettings) {
                settings = CONF.normalize(data.settings);
                SDB.setItem('ws-settings', JSON.stringify(settings));
                if (LOCAL) console.log('settings',Object.clone(settings));
                restoreSettings();
                if (isWork) {
                    API.platform.clear();
                    KIRI.codec.decode(data.work).forEach(widget => {
                        platform.add(widget, 0, true);
                    });
                    if (data.view) {
                        SPACE.view.load(data.view);
                    }
                }
                restoreWorkspace(() => {
                    UI.sync();
                }, true);
            }
        }
        if (ask) {
            let opt = {};
            let prompt = isDevice ?
                `Import device "${data.device}"?` :
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

    function settingsExport(options) {
        const opts = options || {};
        const note = opts.node || undefined;
        const shot = opts.work || opts.screen ? SPACE.screenshot() : undefined;
        const work = opts.work ? KIRI.codec.encode(WIDGETS,{_json_:true}) : undefined;
        const view = opts.work ? SPACE.view.save() : undefined;
        return btoa(JSON.stringify({
            settings: settings,
            version: KIRI.version,
            screen: shot,
            space: SPACE.info,
            note: note,
            work: work,
            view: view,
            moto: MOTO.id,
            init: SDB.getItem('kiri-init'),
            time: Date.now()
        }));
    }

    function platformLoadFiles(files,group) {
        let loaded = files.length;
        platform.group();
        for (let i=0; i<files.length; i++) {
            const file = files[i],
                reader = new FileReader(),
                lower = files[i].name.toLowerCase(),
                israw = lower.indexOf(".raw") > 0 || lower.indexOf('.') < 0,
                isstl = lower.indexOf(".stl") > 0,
                issvg = lower.indexOf(".svg") > 0,
                ispng = lower.indexOf(".png") > 0,
                isgcode = lower.indexOf(".gcode") > 0 || lower.indexOf(".nc") > 0,
                isset = lower.indexOf(".b64") > 0 || lower.indexOf(".km") > 0;
            reader.file = files[i];
            reader.onloadend = function (e) {
                if (israw) platform.add(
                    newWidget(undefined,group)
                    .loadVertices(JSON.parse(e.target.result).toFloat32())
                );
                if (isstl) {
                    if (API.feature.on_add_stl) {
                        API.feature.on_add_stl(e.target.result, file);
                    } else {
                        platform.add(
                            newWidget(undefined,group)
                            .loadVertices(new MOTO.STL().parse(e.target.result))
                            .saveToCatalog(e.target.file.name)
                        );
                    }
                }
                if (isgcode) loadCode(e.target.result, 'gcode');
                if (issvg) loadCode(e.target.result, 'svg');
                if (isset) settingsImport(e.target.result, true);
                if (ispng) loadImageDialog(e.target.result, e.target.file.name);
                if (--loaded === 0) platform.group_done(isgcode);
            };
            if (isstl || ispng) {
                reader.readAsArrayBuffer(reader.file);
            } else {
                reader.readAsBinaryString(reader.file);
            }
        }
    }

    function loadFile() {
        $('load-file').onchange = function(event) {
            DBUG.log(event);
            platformLoadFiles(event.target.files);
        };
        $('load-file').click();
        // alert2("drag/drop STL files onto platform to import\nreload page to return to last saved state");
    }

    function saveWorkspace(quiet) {
        API.conf.save();
        let newWidgets = [],
            oldWidgets = js2o(SDB.getItem('ws-widgets'), []);
        forAllWidgets(function(widget) {
            newWidgets.push(widget.id);
            oldWidgets.remove(widget.id);
            widget.saveState();
            let ann = API.widgets.annotate(widget.id);
            ann.file = widget.meta.file;
            ann.url = widget.meta.url;
        });
        SDB.setItem('ws-widgets', o2js(newWidgets));
        oldWidgets.forEach(function(wid) {
            Widget.deleteFromState(wid);
        });
        // eliminate dangling saved widgets
        ODB.keys(keys => {
            keys.forEach(key => {
                if (newWidgets.indexOf(key.substring(8)) < 0) {
                    ODB.remove(key);
                }
            })
        }, "ws-save-" ,"ws-savf");
        if (!quiet) {
            alert2("workspace saved", 1);
        }
    }

    function restoreSettings(save) {
        let newset = ls2o('ws-settings') || settings;

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
        if (save) API.conf.save();

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

        let fz = SPACE.scene.freeze(true);
        SPACE.view.reset();
        if (camera) {
            SPACE.view.load(camera);
        } else {
            SPACE.view.home();
        }
        SPACE.scene.freeze(fz);

        if (skip_widget_load) {
            if (ondone) {
                ondone();
            }
            return;
        }

        // remove any widgets from platform
        forAllWidgets(function(widget) {
            platform.delete(widget);
        });

        // remove widget keys if they are not going to be restored
        Object.keys(settings.widget).filter(k => toload.indexOf(k) < 0).forEach(k => {
            delete settings.widget[k];
        });

        // load any widget by name that was saved to the workspace
        toload.forEach(function(widgetid) {
            Widget.loadFromState(widgetid, function(widget) {
                if (widget) {
                    platform.add(widget, 0, position);
                    let ann = API.widgets.annotate(widgetid);
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
        KIRI.work.clear();
        platform.select_all();
        platform.delete(selectedMeshes);
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
            API.event.emit('modal.show', which);
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
        API.conf.save()
        API.space.restore(null, true);
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
                    API.conf.load(null, name);
                }
                API.conf.save();
            } catch (e) {
                UC.alert('malformed settings object');
            }
        }
    }

    function loadSettings(e, named) {
        let mode = getMode(),
            name = e ? e.target.getAttribute("load") : named || "default",
            load = settings.sproc[mode][name];

        if (!load) return;

        // clone loaded process into settings
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
        API.event.emit("settings.load", settings);

        // update UI fields to reflect current settings
        updateFields();
        API.conf.update();

        if (e) triggerSettingsEvent();
    }

    function deleteSettings(e) {
        let name = e.target.getAttribute("del");
        delete settings.sproc[getMode()][name];
        updateSettingsList();
        API.conf.save();
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
                del = DOC.createElement('button'),
                name = sk;

            load.setAttribute('load', sk);
            load.onclick = (ev) => {
                API.conf.load(undefined, sk);
                updateSettingsList();
                hideModal();
            }
            load.appendChild(DOC.createTextNode(sk));
            if (sk == settings.process.processName) {
                load.setAttribute('class', 'selected')
            }

            del.setAttribute('del', sk);
            del.setAttribute('title', "remove '"+sk+"'");
            del.innerHTML = '<i class="far fa-trash-alt"></i>';
            del.onclick = deleteSettings;

            edit.setAttribute('name', sk);
            edit.setAttribute('title', 'edit');
            edit.innerHTML = '<i class="far fa-edit"></i>';
            edit.onclick = editSettings;

            row.setAttribute("class", "flow-row");
            row.appendChild(edit);
            row.appendChild(load);
            row.appendChild(del);
            table.appendChild(row);
        });
    }

    function showSettings() {
        updateSettingsList();
        showModal("saves");
    }

    function showHelp() {
        showHelpFile(`/kiri/lang/${KIRI.lang.get()}-help.html?${KIRI.version}`,() => {
            const sel = $('help-sel');
            const labels = [...sel.getElementsByTagName('div')];
            const tabs = [];
            const click = (label, tab) => {
                labels.forEach(l => l.classList.remove('sel'));
                label.classList.add('sel');
                tabs.forEach(t => t.style.display = 'none');
                tab.style.display = 'flex';
            };
            labels.forEach(label => {
                const name = label.getAttribute('tab');
                const tab = $(`help-tab-${name}`);
                tabs.push(tab);
                label.onclick = () => { click(label, tab) };
            });
            click(labels[1], tabs[1]);
        });
    }

    function showHelpFile(local,then) {
        if (!local) {
            WIN.open("//wiki.grid.space/wiki/Kiri:Moto", "_help");
            return;
        }
        ajax(local, function(html) {
            UI.help.innerHTML = html;
            try {
                $('kiri-version').innerHTML = `${LANG.version} ${KIRI.version}`;
                // $('kiri-version').innerHTML = `${KIRI.version}`;
            } catch (e) { }
            if (then) {
                then();
            }
            showModal('help');
        });
        API.event.emit('help.show', local);
    }

    function showLocal() {
        showModal('local');
        API.probe.local((err,data) => {
            let devc = 0;
            let bind = [];
            let html = ['<table>'];
            html.push(`<thead><tr><th>device</th><th>type</th><th>status</th><th></th></tr></thead>`);
            html.push(`<tbody>`);
            for (let k in data) {
                let r = data[k].stat;
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
        updateSelectedInfo();
        // disable clear in non-arrange modes
        $('view-clear').style.display = mode === VIEWS.ARRANGE ? '' : 'none';
        switch (mode) {
            case VIEWS.ARRANGE:
                complete = {};
                UI.back.style.display = '';
                UI.render.style.display = '';
                UI.render.classList.add('lt-enabled');
                KIRI.work.clear();
                STACKS.clear();
                hideSlider();
                updateSpeeds();
                setVisibleLayer();
                setWidgetVisibility(true);
                setOpacity(1);
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
                DBUG.log("invalid view mode: "+mode);
                return;
        }
        API.event.emit('view.set', mode);
        DOC.activeElement.blur();
    }

    function setExpert(bool) {
        UC.setExpert(UI.expert.checked = settings.controller.expert = bool);
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
            DBUG.log("invalid mode: "+mode);
            mode = 'FDM';
        }
        // change mode constants
        settings.mode = mode;
        MODE = MODES[mode];
        DRIVER = KIRI.driver[mode];
        // update mode display
        $('app-mode-name').innerHTML = mode;
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
            API.event.emit('device.set', currentDeviceName());
        }
        // really belongs in CAM driver (lots of work / abstraction needed)
        // updateStockVisibility();
        // updates right-hand menu by enabling/disabling fields
        setViewMode(VIEWS.ARRANGE);
        UC.setMode(MODE);
        // sanitize and persist settings
        API.conf.load();
        API.conf.save();
        // other housekeeping
        triggerSettingsEvent();
        platformUpdateSelected();
        updateFields();
        // because device dialog, if showing, needs to be updated
        if (modalShowing()) {
            API.show.devices();
        }
        API.space.restore(null, true);
        API.event.emit("mode.set", mode);
        if (then) {
            then();
        }
    }

    function currentDeviceName() {
        return settings.filter[getMode()];
    }

    function setControlsVisible(show) {
        $('mid-lcol').style.display = show ? 'flex' : 'none';
        $('mid-rcol').style.display = show ? 'flex' : 'none';
    }

    // prevent safari from exiting full screen mode
    DOC.onkeydown = function (evt) { if (evt.keyCode == 27) evt.preventDefault() }

    // run optional module functions NOW before kiri-init has run
    if (Array.isArray(self.kirimod)) {
        kirimod.forEach(function(mod) { mod(kiri.api) });
    }
    // new module loading
    kiri.loader.forEach(mod => { mod(kiri.api)} );

})();
