/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: main.kiri
// dep: moto.license
// dep: geo.base
// dep: kiri.ui
// dep: kiri.api
// dep: kiri.conf
// dep: kiri.lang
// dep: kiri.utils
// dep: kiri.files
// dep: kiri.consts
// dep: kiri.widget
// dep: kiri.stats
// dep: kiri.stacks
// dep: kiri.devices
// dep: kiri.function
// dep: kiri.platform
// dep: kiri.selection
// dep: kiri.settings
// use: kiri.alerts
// use: kiri.files
// use: kiri.frame
// use: moto.ajax
gapp.register("kiri.main", (root, exports) => {

    let { data, kiri, moto, noop } = root,
        { api, consts, lang, Widget, newWidget, utils, stats } = kiri,
        { parseOpt, encodeOpt, o2js, js2o, ls2o } = utils,
        { platform, selection, settings } = api,
        { COLOR, MODES, VIEWS } = consts,
        LANG    = lang.current,
        WIN     = self.window,
        DOC     = self.document,
        LOC     = self.location,
        SETUP   = parseOpt(LOC.search.substring(1)),
        SECURE  = isSecure(LOC.protocol),
        LOCAL   = self.debug && !SETUP.remote,
        EVENT   = kiri.broker = gapp.broker,
        SDB     = data.local,
        SPACE   = kiri.space = moto.space,
        FILES   = kiri.catalog = kiri.openFiles(new data.Index(SETUP.d ? SETUP.d[0] : 'kiri')),
        clone   = Object.clone,
        UI = {},
        UC = kiri.ui.prefix('kiri').inputAction(api.conf.update),
        MODE = MODES.FDM,
        STACKS = kiri.stacks,
        DRIVER = undefined,
        viewMode = VIEWS.ARRANGE,
        autoSaveTimer = null,
        busy = 0,
        { assign } = Object;

    // extend API
    assign(api, {
        ui: UI = assign(api.ui, UI),
        uc: UC = assign(api.uc, UC),
        stats,
        catalog: FILES,
        busy: assign(api.busy, {
            val() { return busy },
            inc() { kiri.api.event.emit("busy", ++busy) },
            dec() { kiri.api.event.emit("busy", --busy) }
        }),
        color: COLOR,
        const: assign(api.const, {
            LANG,
            LOCAL,
            SETUP,
            SECURE,
            STACKS,
        }),
        dialog: assign(api.dialog, {
            show: showModal,
            hide: hideModal,
            update_process_list: updateProcessList
        }),
        help: assign(api.help, {
            show: showHelp,
            file: showHelpFile
        }),
        event: assign(api.event, {
            on(t,l) { return EVENT.on(t,l) },
            emit(t,m,o) { return EVENT.publish(t,m,o) },
            bind(t,m,o) { return EVENT.bind(t,m,o) },
            alerts(clr) { api.alerts.update(clr) },
            import: loadFile,
            settings: triggerSettingsEvent
        }),
        group: assign(api.group, {
            merge: groupMerge,
            split: groupSplit,
        }),
        hide: assign(api.hide, {
            alert(rec, recs) { api.alerts.hide(...arguments) },
            import: noop,
            slider: hideSlider
        }),
        image: assign(api.image, {
            dialog: loadImageDialog,
            convert: loadImageConvert
        }),
        language: kiri.lang,
        modal: assign(api.modal, {
            show: showModal,
            hide: hideModal,
            visible: modalShowing
        }),
        mode: assign(api.mode, {
            get_id() { return MODE },
            get_lower: getModeLower,
            get: getMode,
            set: setMode,
            switch: switchMode,
            set_expert: noop,
            is_fdm() { return MODE === MODES.FDM },
            is_cam() { return MODE === MODES.CAM },
            is_sla() { return MODE === MODES.SLA },
            is_drag() { return MODE === MODES.DRAG },
            is_wedm() { return MODE === MODES.WEDM },
            is_wjet() { return MODE === MODES.WJET },
            is_laser() { return MODE === MODES.LASER },
            is_2d() { return false ||
                api.mode.is_drag() ||
                api.mode.is_wedm() ||
                api.mode.is_wjet() ||
                api.mode.is_laser()
            }
        }),
        probe: assign(api.probe, {
            live: "https://live.grid.space",
            grid: noop,
            local: noop
        }),
        process: assign(api.process, {
            code: currentProcessCode,
            get: currentProcessName
        }),
        show: assign(api.show, {
            alert() { return api.alerts.show(...arguments) },
            progress: setProgress,
            controls: setControlsVisible,
            slices: showSlices,
            layer: setVisibleLayer,
            local: showLocal,
            import: function() { UI.import.style.display = '' }
        }),
        space: assign(api.space, {
            reload,
            auto_save,
            restore: restoreWorkspace,
            clear: clearWorkspace,
            save: saveWorkspace,
            set_focus: setFocus,
            update: SPACE.update,
            is_dark() { return settings.ctrl().dark }
        }),
        util: assign(api.util, {
            isSecure,
            download: downloadBlob,
            ui2rec() { api.conf.update_from(...arguments) },
            rec2ui() { api.conf.update_fields(...arguments) },
            b64enc(obj) { return base64js.fromByteArray(new TextEncoder().encode(JSON.stringify(obj))) },
            b64dec(obj) { return JSON.parse(new TextDecoder().decode(base64js.toByteArray(obj))) }
        }),
        view: assign(api.view, {
            get() { return viewMode },
            set() { setViewMode(...arguments) },
            set_arrange() { api.view.set(VIEWS.ARRANGE) },
            set_slice() { api.view.set(VIEWS.SLICE) },
            set_preview() { api.view.set(VIEWS.PREVIEW) },
            set_animate() { api.view.set(VIEWS.ANIMATE) },
            is_arrange() { return viewMode === VIEWS.ARRANGE },
            is_slice() { return viewMode === VIEWS.SLICE },
            is_preview() { return viewMode === VIEWS.PREVIEW },
            is_animate() { return viewMode === VIEWS.ANIMATE },
            update_stack_labels: updateStackLabelState,
            update_slider_max: updateSliderMax,
            update_slider: updateSlider,
            update_speeds: updateSpeeds,
            hide_slices: hideSlices,
            snapshot: null,
            edges: setEdges,
            unit_scale: unitScale,
            wireframe: setWireframe,
        }),
        work: kiri.client
    });

    // add show() to catalog for API
    FILES.show = showCatalog;

    // patch broker for api backward compatibility
    EVENT.on = (topic, listener) => {
        EVENT.subscribe(topic, listener);
        return EVENT;
    };

    function updateStackLabelState() {
        const settings = api.conf.get();
        const { stacks } = kiri;
        // match label checkboxes to preference
        for (let label of stacks.getLabels()) {
            let check = `${settings.mode}-${api.view.get()}-${label}`;
            stacks.setVisible(label, settings.labels[check] !== false);
        }
    }

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
        let cam_index = api.conf.get().process.camStockIndexed || false;
        let focus_z = cam_index ? 0 : platform.top_z() / 2;
        SPACE.platform.setCenter(pos.x, -pos.y, focus_z);
        SPACE.view.setFocus(new THREE.Vector3(pos.x, focus_z, -pos.y));
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
        if (!settings.ctrl().autoSave) {
            return;
        }
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            api.space.save(true);
        }, 1000);
    }

    // update version and init count
    let inits = parseInt(SDB.getItem('kiri-init') || stats.get('init') || 0) + 1;
    SDB.setItem('kiri-init', inits);
    stats.set('init', inits);
    stats.set('kiri', kiri.version || gapp.version);

    // remove version from url, preserve other settings
    WIN.history.replaceState({},'','/kiri/' + encodeOpt(SETUP) + LOC.hash);

    /** ******************************************************************
     * Utility Functions
     ******************************************************************* */

    function unitScale() {
        return api.mode.is_cam() && settings.ctrl().units === 'in' ? 25.4 : 1;
    }

    function triggerSettingsEvent() {
        api.event.emit('settings', settings.get());
    }

    function isSecure(proto) {
         return proto.toLowerCase().indexOf("https") === 0;
    }

    function setProgress(value = 0, msg) {
        value = (value * 100).round(4);
        UI.progress.width = value+'%';
        if (self.debug) {
            // console.log(msg, value.round(2));
            UI.prostatus.style.display = 'flex';
            if (msg) {
                UI.prostatus.innerHTML = msg;
            } else {
                UI.prostatus.innerHTML = '';
            }
        }
    }

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
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
        api.conf.update_fields_from_range();
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

    function setEdges(bool) {
        if (bool && bool.toggle) {
            api.local.toggle('model.edges');
        } else {
            api.local.set('model.edges', bool);
        }
        bool = api.local.getBoolean('model.edges');
        api.widgets.each(w => w.setEdges(bool));
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
        const info = assign({settings: settings.get(), png:image}, opt);
        kiri.client.image2mesh(info, progress => {
            api.show.progress(progress, "converting");
        }, vertices => {
            api.show.progress(0);
            const widget = newWidget().loadVertices(vertices);
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

    // convert any image type to png
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

    function loadFile(ev) {
        // use modern Filesystem api when available
        if (false && window.showOpenFilePicker) {
            window.showOpenFilePicker().then(files => {
                return Promise.all(files.map(fh => fh.getFile()))
            }).then(files => {
                if (files.length) {
                    api.platform.load_files(files);
                }
            }).catch(e => { /* ignore cancel */ });
            return;
        }
        api.ui.load.click();
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
        oldWidgets.forEach(wid => {
            Widget.deleteFromState(wid);
        });
        // eliminate dangling saved widgets
        FILES.deleteFilter(key => newWidgets.indexOf(key.substring(8)) < 0, "ws-save-", "ws-savf");
        if (!quiet) {
            api.show.alert("workspace saved", 1);
        }
    }

    function restoreWorkspace(ondone, skip_widget_load) {
        let newset = api.conf.restore(false),
            camera = newset.controller.view,
            toload = ls2o('ws-widgets',[]),
            loaded = 0,
            position = true;

        api.conf.update_fields();
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

        // load any widget by name that was saved to the workspace
        toload.forEach(function(widgetid) {
            Widget.loadFromState(widgetid, function(widget) {
                if (widget) {
                    platform.add(widget, 0, position, true);
                    let ann = api.widgets.annotate(widgetid);
                    widget.meta.file = ann.file;
                    widget.meta.url = ann.url;
                }
                if (++loaded === toload.length) {
                    platform.deselect();
                    if (ondone) {
                        ondone();
                        setTimeout(() => {
                            platform.update_bounds();
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
        kiri.client.clear();
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

        // hide all modals befroe showing another
        Object.keys(UI.modals).forEach(name => {
            UI.modals[name].style.display = name === which ? 'flex' : '';
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
            onComplete(() => {
                style.display = '';
                api.event.emit('modal.hide');
            }).
            start();
    }

    function showCatalog() {
        showModal("files");
    }

    function editSettings(e) {
        let current = settings.get(),
            mode = getMode(),
            name = e.target.getAttribute("name"),
            load = current.sproc[mode][name],
            loadstr = JSON.stringify(load,null,4).split('\n');
        UC.prompt(`settings for "${name}"`, loadstr).then(edit => {
            if (edit) {
                try {
                    current.sproc[mode][name] = JSON.parse(edit);
                    if (name === settings.proc().processName) {
                        api.conf.load(null, name);
                    }
                    api.conf.save();
                    api.settings.sync.put();
                } catch (e) {
                    console.log({ malformed_settings: e });
                    UC.alert('malformed settings object');
                }
            }
        });
    }

    function exportSettings(e) {
        let current = settings.get(),
            mode = getMode(),
            name = e.target.getAttribute("name"),
            data = api.util.b64enc({
                process: current.sproc[mode][name],
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

    function deleteSettings(e) {
        let current = settings.get();
        let name = e.target.getAttribute("del");
        delete current.sproc[getMode()][name];
        api.settings.sync.put();
        updateProcessList();
        api.conf.save();
        triggerSettingsEvent();
    }

    function updateProcessList() {
        let current = settings.get();
        let list = [], s = current, sp = s.sproc[getMode()] || {}, table = UI.settingsList;
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
                updateProcessList();
                hideModal();
            }
            load.appendChild(DOC.createTextNode(sk));
            if (sk == settings.proc().processName) {
                load.setAttribute('class', 'selected')
            }
            UI.settingsName.value = settings.proc().processName;

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
        const isCAM = settings.mode() === 'CAM';
        viewMode = mode;
        platform.deselect();
        selection.update_info();
        // clear any bounds forced by, for example, WireEDM previews
        api.platform.set_bounds();
        // disable clear in non-arrange modes
        ['view-arrange','act-slice','act-preview','act-animate'].forEach(el => {
            $(el).classList.remove('selected')
        });
        $('render-tools').classList.add('hide');
        switch (mode) {
            case VIEWS.ARRANGE:
                $('view-arrange').classList.add('selected');
                $('render-tools').classList.remove('hide');
                api.function.clear_progress();
                kiri.client.clear();
                STACKS.clear();
                hideSlider();
                updateSpeeds();
                setVisibleLayer();
                setWidgetVisibility(true);
                api.widgets.opacity(1);
                api.view.edges(api.local.getBoolean('model.edges'));
                break;
            case VIEWS.SLICE:
                $('act-slice').classList.add('selected');
                updateSpeeds();
                updateSliderMax();
                setWidgetVisibility(true);
                !isCAM && api.view.edges(false);
                break;
            case VIEWS.PREVIEW:
                $('act-preview').classList.add('selected');
                setWidgetVisibility(true);
                !isCAM && api.view.edges(false);
                break;
            case VIEWS.ANIMATE:
                $('act-animate').classList.add('selected');
                !isCAM && api.view.edges(false);
                break;
            default:
                console.log("invalid view mode: "+mode);
                return;
        }
        api.event.emit('view.set', mode);
        DOC.activeElement.blur();
    }

    function getMode() {
        return settings.mode();
    }

    function getModeLower() {
        return getMode().toLowerCase();
    }

    function switchMode(mode) {
        setMode(mode, null, platform.update_size);
    }

    function setMode(mode, lock, then) {
        if (!MODES[mode]) {
            console.log("invalid mode: "+mode);
            mode = 'FDM';
        }
        const current = settings.get();
        // change mode constants
        current.mode = mode;
        MODE = MODES[mode];
        DRIVER = kiri.driver[mode];
        kiri.driver.current = DRIVER;
        // gcode edit area for any non-SLA mode
        api.uc.setVisible($('gcode-edit'), mode !== 'SLA');
        // highlight selected mode menu item
        ["FDM","CAM","SLA","LASER","DRAG","WJET","WEDM"].forEach(sm => {
            const cl = $(`mode-${sm.toLowerCase()}`).classList;
            if (sm === mode) {
                cl.add('selected');
            } else {
                cl.remove('selected');
            }
        });
        // restore cached device profile for this mode
        if (current.cdev[mode]) {
            current.device = clone(current.cdev[mode]);
            api.event.emit('device.select', api.device.get());
        }
        // hide/show
        api.uc.setVisible($('set-tools'), mode === 'CAM');
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
        api.conf.update_fields();
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

    function currentProcessName() {
        return settings.get().cproc[getMode()];
    }

    function currentProcessCode() {
        return settings.get().sproc[getMode()][currentProcessName()];
    }

    function setControlsVisible(show) {
        // TODO fix
        // $('mid-left').style.display = show ? 'flex' : 'none';
        // $('mid-right').style.display = show ? 'flex' : 'none';
    }

    function downloadBlob(data, filename) {
        let url = WIN.URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
        $('mod-any').innerHTML = `<a id="_dexport_" href="${url}" download="${filename}">x</a>`;
        $('_dexport_').click();
    }

    // prevent safari from exiting full screen mode
    DOC.onkeydown = function (evt) { if (evt.keyCode == 27) evt.preventDefault() }

    // upon restore, seed presets
    api.event.emit('preset', api.conf.dbo());

});
