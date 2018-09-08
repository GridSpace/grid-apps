/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */

"use strict";

self.kiri = (self.kiri || {});
self.kiri.version = exports.VERSION;
self.kiri.copyright = exports.COPYRIGHT;
self.kiri.license = exports.LICENSE;

(function () {
    if (kiri.init) return;

    function genID() {
        while (true) {
            var k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    var iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent),
        // ---------------
        MODES = {
            FDM: 1,   // fused deposition modeling (also FFF)
            LASER: 2, // laser cutting
            CAM: 3    // 3 axis milling/machining
        },
        VIEWS = {
            ARRANGE: 1,
            SLICE: 2,
            PREVIEW: 3
        },
        // --------------- settings filters (for loading/saving)
        sf = {
            fdm:{
                // fields permitted in FDM:Device
                d:{
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    maxHeight: 1,
                    extrudeAbs: 1,
                    filamentSize: 1,
                    nozzleSize: 1,
                    gcodePre: 1,
                    gcodePost: 1,
                    gcodeProc: 1,
                    gcodePause: 1,
                    gcodeFExt: 1,
                    gcodeFan: 1,
                    gcodeTrack: 1,
                    gcodeLayer: 1
                },
                // fields permitted in FDM:Process
                p:{
                    processName: 1,
                    sliceHeight: 1,
                    sliceShells: 1,
                    sliceShellSpacing: 1,
                    sliceFillAngle: 1,
                    sliceFillOverlap: 1,
                    sliceFillSpacing: 1,
                    sliceFillSparse: 1,
                    sliceSupportEnable: 1,
                    sliceSupportDensity: 1,
                    sliceSupportOffset: 1,
                    sliceSupportGap: 1,
                    sliceSupportSize: 1,
                    sliceSupportArea: 1,
                    sliceSupportExtra: 1,
                    sliceSupportSpan: 1,
                    sliceSolidMinArea: 1,
                    sliceSolidLayers: 1,
                    sliceBottomLayers: 1,
                    sliceTopLayers: 1,
                    sliceVase: 1,
                    firstSliceHeight: 1,
                    firstLayerRate: 1,
                    firstLayerFillRate: 1,
                    firstLayerPrintMult: 1,
                    outputRaft: 1,
                    outputRaftSpacing: 1,
                    outputTemp: 1,
                    outputFanMax: 1,
                    outputBedTemp: 1,
                    outputFeedrate: 1,
                    outputFinishrate: 1,
                    outputSeekrate: 1,
                    outputShellMult: 1,
                    outputFillMult: 1,
                    outputSparseMult: 1,
                    outputRetractDist: 1,
                    outputRetractSpeed: 1,
                    outputRetractDwell: 1,
                    outputBrimCount: 1,
                    outputBrimOffset: 1,
                    outputShortPoly: 1,
                    outputShortDistance: 1,
                    outputShortFactor: 1,
                    outputFinishFactor: 1,
                    sliceMinHeight: 1,
                    outputCooling: 1,
                    // detectThinWalls: 1,
                    antiBacklash: 1,
                    zHopDistance: 1,
                    gcodeKFactor: 1,
                    gcodePauseLayers: 1,
                    outputClockwise: 1,
                    outputOriginCenter: 1,
                    outputInvertX: 1,
                    outputInvertY: 1
                }
            },
            cam:{
                // fields permitted in CAM:Device
                d:{
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    spindleMax: 1,
                    gcodePre: 1,
                    gcodePost: 1,
                    gcodeDwell: 1,
                    gcodeChange: 1,
                    gcodeSpindle: 1,
                    gcodeFExt: 1,
                    gcodeSpace: 1,
                    gcodeStrip: 1
                },
                // fields permitted in CAM:Process
                p:{
                    processName: 1,
                    roughingTool: 1,
                    roughingSpindle: 1,
                    roughingDown: 1,
                    roughingOver: 1,
                    roughingSpeed: 1,
                    roughingPlunge: 1,
                    roughingStock: 1,
                    roughingOn: 1,
                    finishingTool: 1,
                    finishingSpindle: 1,
                    finishingDown: 1,
                    finishingOver: 1,
                    finishingAngle: 1,
                    finishingSpeed: 1,
                    finishingPlunge: 1,
                    finishingOn: 1,
                    finishingXOn: 1,
                    finishingYOn: 1,
                    finishCurvesOnly: 1,
                    drillTool: 1,
                    drillSpindle: 1,
                    drillDownSpeed: 1,
                    drillDown: 1,
                    drillDwell: 1,
                    drillLift: 1,
                    drillingOn: 1,
                    camTabsWidth: 1,
                    camTabsHeight: 1,
                    camTabsOn: 1,
                    camPocketOnly: 1,
                    camDepthFirst: 0,
                    camEaseDown: 1,
                    camOriginTop: 1,
                    camTolerance: 1,
                    camZTopOffset: 1,
                    camZBottom: 1,
                    camZClearance: 1,
                    camStockX: 1,
                    camStockY: 1,
                    camStockZ: 1,
                    outputClockwise: 1,
                    outputOriginCenter: 1,
                    outputInvertX: 1,
                    outputInvertY: 1
                }
            },
            laser: {
                // fields permitted in Laser:Device
                d:{
                    bedWidth: 1,
                    bedDepth: 1,
                },
                // fields permitted in Laser:Process
                p:{
                    processName: 1,
                    laserOffset: 1,
                    laserSliceHeight: 1,
                    outputTileSpacing: 1,
                    outputTileScaling: 1,
                    outputLaserPower: 1,
                    outputLaserSpeed: 1,
                    outputOriginCenter: 1,
                    outputInvertX: 1,
                    outputInvertY: 1
                }
            }
        },
        // --------------- (default)
        settings = {
            // CAM only
            tools:[
                {
                    id: 1000,
                    number: 1,
                    type: "endmill",
                    name: "end 1/4",
                    metric: false,
                    flute_diam: 0.25,
                    flute_len: 0,
                    shaft_diam: 0.25,
                    shaft_len: 0
                },
                {
                    id: 1001,
                    number: 2,
                    type: "endmill",
                    name: "end 1/8",
                    metric: false,
                    flute_diam: 0.125,
                    flute_len: 0,
                    shaft_diam: 0.125,
                    shaft_len: 0
                },
                {
                    id: 1002,
                    number: 3,
                    type: "endmill",
                    name: "end 1/16",
                    metric: false,
                    flute_diam: 0.0625,
                    flute_len: 0,
                    shaft_diam: 0.0625,
                    shaft_len: 0
                }
            ],
            // FDM/CAM/Laser
            device:{
                bedWidth: 300,      // FDM/CAM/Laser
                bedDepth: 175,      // FDM/CAM/Laser
                bedHeight: 2.5,     // display only (deprecate)
                maxHeight: 150,     // FDM
                filamentSize: 1.75, // FDM
                nozzleSize: 0.4,    // FDM
                spindleMax: 0,      // CAM
                gcodePre: [],       // FDM/CAM header script
                gcodePost: [],      // FDM/CAM footer script
                gcodeProc: "",      // FDM post processor script (encoding, etc)
                gcodePause: [],     // FDM pause script
                gcodeFan: "",       // FDM fan command
                gcodeTrack: "",     // FDM progress command
                gcodeLayer: "",     // FDM layer output
                gcodeDwell: ["G4 P{time}"],     // CAM dwell script
                gcodeChange: ["M6 T{tool}"],    // CAM tool change script
                gcodeSpindle: ["M3 S{speed}"],  // CAM spindle speed
                gcodeFExt: "",      // CAM file extension
                gcodeSpace: "",     // CAM token spacing
                gcodeStrip: true    // CAM strip comments
            },
            // FDM/CAM/Laser
            process:{
                processName: "default",

                // --- FDM ---

                sliceHeight: 0.25,
                sliceShells: 2,
                sliceShellSpacing: 1.0,
                sliceFillAngle: 45,
                sliceFillOverlap: 0.3,
                sliceFillSpacing: 1.0,
                sliceFillSparse: 0.5,

                sliceSupportEnable: false,
                sliceSupportDensity: 0.25,
                sliceSupportOffset: 1.0,
                sliceSupportGap: 1,
                sliceSupportSize: 10,
                sliceSupportArea: 1,
                sliceSupportExtra: 0,
                sliceSupportSpan: 6,

                sliceSolidMinArea: 5,
                sliceSolidLayers: 3,
                sliceBottomLayers: 2,
                sliceTopLayers: 3,
                sliceVase: false,

                firstSliceHeight: 0.25,
                firstLayerRate: 30,
                firstLayerFillRate: 40,
                firstLayerPrintMult: 1.0,
                outputRaft: false,
                outputRaftSpacing: 0.2,

                outputTemp: 220,
                outputFanMax: 255,
                outputBedTemp: 0,
                outputFeedrate: 80,
                outputFinishrate: 60,
                outputSeekrate: 100,
                outputShellMult: 1.1,
                outputFillMult: 1.2,
                outputSparseMult: 1.3,
                outputRetractDist: 1.0,
                outputRetractSpeed: 40,
                outputRetractDwell: 30,
                outputBrimCount: 2,
                outputBrimOffset: 2,
                outputShortPoly: 15.0,
                outputShortDistance: 0.0,
                outputShortFactor: 0.2,
                outputFinishFactor: 0,
                sliceMinHeight: 0,
                detectThinWalls: false,
                antiBacklash: 2,
                zHopDistance: 0,
                gcodeKFactor: 0,
                gcodePauseLayers: "",
                outputCooling: true,

                // --- LASER ---

                laserOffset: 0.25,
                laserSliceHeight: 1,

                outputTileSpacing: 1,   // LASER
                outputTileScaling: 1,   // LASER
                outputLaserPower: 100,  // LASER
                outputLaserSpeed: 1000, // LASER

                // --- CAM ---

                roughingTool: 1000,
                roughingSpindle: 1000,
                roughingDown: 2,
                roughingOver: 0.5,
                roughingSpeed: 1000,
                roughingPlunge: 250,
                roughingStock: 0,
                roughingOn: true,

                finishingTool: 1000,
                finishingSpindle: 1000,
                finishingDown: 3,
                finishingOver: 0.5,
                finishingAngle: 85,
                finishingSpeed: 800,
                finishingPlunge: 250,
                finishingOn: true,
                finishingXOn: true,
                finishingYOn: true,
                finishCurvesOnly: false,

                drillTool: 1000,
                drillSpindle: 1000,
                drillDownSpeed: 250,
                drillDown: 5,
                drillDwell: 250,
                drillLift: 2,
                drillingOn: false,

                camTabsWidth: 5,
                camTabsHeight: 5,
                camTabsOn: false,

                camPocketOnly: false,
                camDepthFirst: false,
                camEaseDown: false,
                camOriginTop: true,
                camTolerance: 0.15,
                camZTopOffset: 0,
                camZBottom: 0,
                camZClearance: 1,

                camStockX: 0,
                camStockY: 0,
                camStockZ: 0,

                outputClockwise: true,

                // --- shared FDM/Laser/CAM ---

                outputOriginCenter: true,
                outputInvertX: false,
                outputInvertY: false
            },
            // saved processes by name
            sproc:{
                FDM: {},
                CAM: {},
                LASER: {}
            },
            // current process name
            cproc:{
                FDM: null,
                CAM: null,
                LASER: null
            },
            // cached device settings by mode
            cdev: {
                FDM: null,
                CAM: null
            },
            // now they're called devices instead of gcode filters
            filter:{
                FDM: "Any.Generic.Marlin",
                CAM: "Any.Generic.Grbl"
            },
            // custom devices by name
            devices:{
            },
            // map of device to last process setting (name)
            devproc: {
            },
            layers:{
                layerOutline: true,
                layerTrace: true,
                layerFacing: true,
                layerRough: true,
                layerFinish: true,
                layerFinishX: true,
                layerFinishY: true,
                layerDelta: false,
                layerSolid: false,
                layerSparse: true,
                layerFill: true,
                layerSupport: true,
                layerPrint: false
            },
            synth: {
                // set in updateSettingsFromFields()
                fillOffsetMult: 0,
                diffOffsetMult: 0
            },
            controller:{
                view: null,
                zoomSpeed: 1.0,
                reverseZoom: true
            },
            mode: 'FDM',
            id: genID(),
            ver: 1
        },
        settingsDefault = settings,
        autoDecimate = true,
        // ---------------
        SELF = self,
        MOTO = moto,
        KIRI = SELF.kiri,
        BASE = SELF.base,
        UTIL = BASE.util,
        DBUG = BASE.debug,
        // ---------------
        WIN    = SELF.window,
        DOC    = SELF.document,
        LOC    = SELF.location,
        SETUP  = parseOpt(LOC.search.substring(1)),
        LOCAL  = LOC.host.indexOf('localhost') === 0,
        SECURE = isSecure(LOC.protocol),
        // ---------------
        SDB     = MOTO.KV,
        ODB     = KIRI.odb = new MOTO.Storage(SETUP.d ? SETUP.d[0] : 'kiri'),
        SPACE   = KIRI.space = MOTO.Space,
        WIDGETS = KIRI.widgets = [],
        CATALOG = KIRI.catalog = KIRI.openCatalog(ODB,autoDecimate),
        STATS   = new Stats(SDB),
        // ACTIVE  = 'kiri-active',
        // IDLE    = 'kiri-idle',
        SEED    = 'kiri-seed',
        // ---------------
        Widget = kiri.Widget,
        newWidget = kiri.newWidget,
        // ---------------
        UI = {},
        UC = MOTO.ui.prefix('kiri').inputAction(updateSettings).hideAction(onControlResize),
        DEFMODE = SETUP.dm && SETUP.dm.length === 1 ? SETUP.dm[0] : 'FDM',
        STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
        MODE = MODES.FDM,
        onEvent = {},
        screenShot = null,
        currentPrint = null,
        selectedMeshes = [],
        localFilterKey ='kiri-gcode-filters',
        localFilters = js2o(SDB.getItem(localFilterKey)) || [],
        OCTOPRINT = null,
        // ---------------
        wireframe_color = 0x444444,
        wireframe_model_opacity = 0.25,
        widget_selected_color = 0xbbff00,
        widget_deselected_color = 0xffff00,
        widget_slicing_color = 0xffaaaa,
        widget_cam_preview_color = 0x0055bb,
        preview_opacity_cam = 0.25,
        preview_opacity = 0.0,
        model_opacity = 1.0,
        slicing_opacity = 0.5,
        sliced_opacity = 0.0,
        sliced_opacity_cam = 0.25,
        // ---------------
        printSeq = parseInt(SDB['print-seq'] || "0") + 1,
        catalogSize = 0,
        showLayerRange = 0,
        showLayerValue = 0,
        showLayerMax = 0,
        renderMode = 4,
        viewMode = VIEWS.ARRANGE,
        layoutOnAdd = true,
        deviceLock = false,
        local = SETUP.local,
        mouseMoved = false,
        camStock = null,
        camTopZ = 0;

    DBUG.enable();

    if (SETUP.rm) renderMode = parseInt(SETUP.rm[0]);

    KIRI.api = {
        ui : UI,
        on : addOnEvent,
        sdb : SDB,
        o2js : o2js,
        js2o : js2o,
        ajax : ajax,
        help : showHelp,
        load : loadWidget,
        focus : takeFocus,
        stats : STATS,
        import : loadFile,
        catalog : CATALOG,
        getMode : getMode,
        setMode : setMode,
        showModal : showModal,
        hideModal : hideModal,
        showDialog : showDialog,
        hideDialog : hideDialog,
        showCatalog : showCatalog,
        addWidget : platformAdd,
        selectAll : platformSelectAll,
        selectNone : widgetDeselect,
        showProgress : setProgress,
        clearWorker : KIRI.work.clear,
        getSettings : getSettings,
        putSettings : putSettings,
        ghostDetect : function() { return false },
        hideImport : function() { UI.import.style.display = 'none' },
        mouse : {
            moved : function() { return mouseMoved },
            movedSet : function(b) { mouseMoved = b }
        }
    };

    /** ******************************************************************
     * Stats accumulator
     ******************************************************************* */

    function sendOnEvent(name, data) {
        if (name && onEvent[name]) onEvent[name].forEach(function(fn) {
            fn(data);
        });
    }

    function addOnEvent(name, handler) {
        if (name && typeof(name) === 'string' && typeof(handler) === 'function') {
            onEvent[name] = onEvent[name] || [];
            onEvent[name].push(handler);
        }
    }

    function triggerSettingsEvent() {
        sendOnEvent('settings', settings);
    }

    function oremap(o,k,p) {
        try {
            var ov = o[k];
            delete o[k];
            o[p+(k.split('-')[1].toLowerCase())] = ov;
        } catch (e) {
            console.log(e)
        }
    }

    function Stats(db) {
        this.db = db;
        this.obj = js2o(db['stats'] || '{}');
        var o = this.obj, k;
        for (k in o) {
            if (!o.hasOwnProperty(k)) continue;
            if (k.indexOf('slice-') === 0) oremap(o,k,'s-');
            if (k.indexOf('prep-') === 0) oremap(o,k,'p-');
            if (k.indexOf('export-') === 0) oremap(o,k,'e-');
            if (k.indexOf('show-') === 0) oremap(o,k,'d-');
        }
    }
    Stats.prototype.save = function() {
        this.db['stats'] = o2js(this.obj);
        return this;
    };
    Stats.prototype.get = function(k) {
        return this.obj[k];
    }
    Stats.prototype.set = function(k,v) {
        this.obj[k] = v;
        this.save();
        return this;
    };
    Stats.prototype.add = function(k,v) {
        this.obj[k] = (this.obj[k] || 0) + (v || 1);
        this.save();
        return this;
    };
    Stats.prototype.del = function(k) {
        delete this.obj[k];
        this.save();
        return this;
    }

    STATS.set('upgrade', kiri.version !== STATS.get('kiri') && STATS.get('init') > 0);
    STATS.set('kiri', kiri.version);

    /** ******************************************************************
     * Utility Functions
     ******************************************************************* */

    function isSecure(proto) {
         return proto.toLowerCase().indexOf("https") === 0;
    }

    function parseOpt(ov) {
        var opt = {}, kv, kva;
        ov.split(',').forEach(function(el) {
            kv = el.split(':');
            if (kv.length === 2) {
                kva = opt[kv[0]] = opt[kv[0]] || [];
                kva.push(decodeURIComponent(kv[1]));
            }
        });
        return opt;
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

    function set(to, from) {
        for (var k in from) {
            if (from.hasOwnProperty(k)) to[k] = from[k];
        }
    }

    function cull(o, f) {
        for (var k in o) {
            if (!o.hasOwnProperty(k)) continue;
            if (!f.hasOwnProperty(k)) delete o[k];
        }
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

    function setVisibleLayer(v) {
        showSlices(showLayerValue = bound(v, 0, showLayerMax));
    }

    function meshArray() {
        var out = [];
        forWidgets(function(widget) {
            out.push(widget.mesh);
        });
        return out;
    }

    function forWidgets(f) {
        WIDGETS.slice().forEach(function(widget) {
            f(widget);
        });
    }

    function forSelectedWidgets(f) {
        var m = selectedMeshes;
        if (m.length === 0 && WIDGETS.length === 1) m = [ WIDGETS[0].mesh ];
        m.slice().forEach(function (mesh) { f(mesh.widget) });
    }

    function forSelectedMeshes(f) {
        selectedMeshes.slice().forEach(function (mesh) { f(mesh) });
    }

    function toggleWireframe(color, opacity) {
        forWidgets(function(w) { w.toggleWireframe(color, opacity) });
        SPACE.update();
    }

    function updateSliderMax(set) {
        var max = 0;
        if (viewMode === VIEWS.PREVIEW && currentPrint) {
            max = currentPrint.getLayerCount();
        } else {
            forWidgets(function(widget) {
                if (!widget.slices) return;
                max = Math.max(max, widget.slices.length);
            });
        }
        max = Math.max(0, max - 1);
        showLayerMax = max;
        if (UI.layerID.convert() > max || showLayerValue > max) {
            showLayerValue = max;
            UI.layerID.value = max;
            UI.layerSlider.value = showLayerMax;
        }
        UI.layerSlider.max = max;
        if (set) {
            showLayerValue = showLayerMax;
            UI.layerSlider.value = showLayerMax;
        }
    }

    function hideSlices() {
        var showing = false;
        setOpacity(model_opacity);
        forWidgets(function(widget) {
            widget.setWireframe(false);
            showing = widget.hideSlices() || showing;
        });
        clearPrint();
        return showing;
    }

    function showSlice(index, range, layer) {
        if (range) {
            return index <= layer && index > layer-range;
        } else {
            return index <= layer;
        }
    }

    /**
     * hide or show slice-layers and their sub-elements
     *
     * @param {number} [layer]
     */
    function showSlices(layer) {
        if (typeof(layer) === 'string' || typeof(layer) === 'number') {
            layer = parseInt(layer);
        } else {
            layer = showLayerValue;
        }

        layer = bound(layer, 0, showLayerMax);

        UI.layerID.value = layer;
        UI.layerSlider.value = layer;

        var j,
            slice,
            slices,
            layers,
            range = UI.layerRange.checked ? UI.layerSpan.convert() || 1 : 0,
            print = UI.layerPrint.checked;

        if (MODE === MODES.CAM && showLayerRange !== range && range && layer === showLayerMax) {
            layer = 0;
        }

        showLayerRange = range;
        showLayerValue = layer;

        forWidgets(function(widget) {
            if (print) return widget.hideSlices();

            slices = widget.slices;
            if (!slices) return;

            for (j = 0; j < slices.length; j++) {
                slice = slices[j];
                slice.view.visible = showSlice(j, range, layer);
                layers = slice.layers;
                layers.outline.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerOutline.checked && LOCAL :
                        UI.layerOutline.checked
                );
                layers.trace.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerRough.checked :
                        UI.layerTrace.checked
                );
                layers.bridge.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerFinishX.checked :
                        UI.layerDelta.checked
                );
                layers.flat.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerFinishY.checked :
                        UI.layerDelta.checked
                );
                layers.solid.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerFinish.checked :
                        UI.layerSolid.checked
                );
                layers.fill.setVisible(
                    MODE === MODES.CAM ?
                        UI.layerFacing.checked :
                        UI.layerFill.checked
                );
                layers.sparse.setVisible(UI.layerSparse.checked);
                layers.support.setVisible(UI.layerSupport.checked);
            }
        });

        if (currentPrint) {
            for (j = 0; j < currentPrint.layerView.length; j++) {
                currentPrint.showLayer(j, print && showSlice(j, range, layer));
            }
        }

        SPACE.update();
    }

    function newButton(name,action) {
        var b = DOC.createElement("button");
        b.appendChild(DOC.createTextNode(name));
        b.onclick = action;
        return b;
    }

    function loadGCode(gcode) {
        setViewMode(VIEWS.PREVIEW);
        clearPrint();
        setOpacity(0);
        currentPrint = kiri.newPrint(settings, []);
        currentPrint.parseGCode(gcode, settings.process.outputOriginCenter ? null : {
            x: -settings.device.bedWidth / 2,
            y: -settings.device.bedDepth / 2,
        });
        currentPrint.render();
        SPACE.platform.add(currentPrint.group);
        SPACE.update();
        UI.layerPrint.checked = true;
        updateSliderMax(true);
        showSlices();
        exportGCode(gcode);
    }

    function preparePrint(callback) {
        // kick off slicing it hasn't been done already
        for (var i=0; i < WIDGETS.length; i++) {
            if (!WIDGETS[i].slices || WIDGETS[i].isModified()) {
                prepareSlices(function() { preparePrint(callback) });
                return;
            }
        }

        setViewMode(VIEWS.PREVIEW);

        clearPrint();
        saveSettings();

        if (MODE === MODES.CAM) {
            setOpacity(preview_opacity_cam);
            forWidgets(function(widget) {
                widget.setColor(widget_cam_preview_color);
            });
        } else {
            setOpacity(preview_opacity);
        }

        currentPrint = kiri.newPrint(settings, WIDGETS);
        currentPrint.setup(true, function(update, status) {
            // on update
            setProgress(update, status);
        }, function() {
            setProgress(0);
            currentPrint.render();

            // on done
            STATS.add('p-'+getMode().toLowerCase());
            SPACE.platform.add(currentPrint.group);
            SPACE.update();

            UI.layerPrint.checked = true;
            updateSliderMax(true);
            showSlices();

            if (typeof(callback) === 'function') callback();
        })
    }

    function exportPrint() {
        if (!currentPrint) {
            preparePrint(exportPrint);
            return;
        }
        STATS.add('e-'+getMode().toLowerCase());
        switch (settings.mode) {
            case 'LASER': return exportPrintLaser();
            case 'FDM': return exportPrintGCODE();
            case 'CAM': return exportPrintGCODE();
        }
    }

    function exportPrintGCODE() {
        if (!currentPrint) {
            preparePrint(exportPrint);
            return;
        }
        currentPrint.exportGCode(true, function(gcode) {
            exportGCode(gcode);
        });
    }

    function exportPrintLaser() {
        if (!currentPrint) {
            preparePrint(exportPrintLaser);
            return;
        }

        var filename = "laser-"+(new Date().getTime().toString(36));

        function download_svg() {
            saveAs(new Blob(
                [currentPrint.exportSVG($('print-color').value)],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".svg");
        }

        function download_dxf() {
            saveAs(new Blob(
                [currentPrint.exportDXF()],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".dxf");
        }

        function download_gcode() {
            saveAs(new Blob(
                [currentPrint.exportLaserGCode()],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".gcode");
        }

        ajax("/kiri/output-laser.html", function(html) {
            UI.print.innerHTML = html;
            $('print-filename').value = filename;
            $('print-lines').value = currentPrint.lines;
            $('print-close').onclick = hideModal;
            $('print-svg').onclick = download_svg;
            $('print-dxf').onclick = download_dxf;
            $('print-lg').onclick = download_gcode;
            showModal('print');
        });
    }

    function exportGCode(gcode) {
        if (MODE === MODES.CAM) {
            KIRI.serial.setGCode(gcode, currentPrint.bounds);
        }

        SDB['print-seq'] = printSeq++;

        var pre = (MODE === MODES.CAM ? "cnc-" : "print-") + (printSeq.toString().padStart(3,"0")),
            filename = pre,// + (new Date().getTime().toString(36)),
            fileext = settings.device.gcodeFExt || "gcode",
            codeproc = settings.device.gcodeProc,
            octo_host,
            octo_apik,
            grid_host,
            grid_apik,
            grid_target,
            grid_targets = {};

        // run gcode post processor function (when supplied and valid)
        if (codeproc && self[codeproc]) {
            gcode = self[codeproc](gcode);
        }

        function getBlob() {
            return new Blob(
                [gcode],
                {type:"application/octet-stream"});
        }

        function sendto_octoprint() {
            if (!(octo_host && octo_apik)) return;

            var form = new FormData(),
                ajax = new XMLHttpRequest(),
                host = octo_host.value.toLowerCase(),
                apik = octo_apik.value;

            if (host.indexOf("http") !== 0) {
                alert("host missing protocol (http:// or https://)");
                return;
            }
            if (SECURE && !isSecure(host)) {
                alert("host must begin with 'https' on a secure site");
                return;
            }

            SDB['octo-host'] = host.trim();
            SDB['octo-apik'] = apik.trim();

            filename = $('print-filename').value;
            form.append("file", getBlob(), filename+"."+fileext);
            ajax.onreadystatechange = function() {
                if (ajax.readyState === 4) {
                    var status = ajax.status;
                    STATS.add('op-'+status);
                    if (status >= 200 && status < 300) {
                        hideModal();
                    } else {
                        alert("octoprint error\nstatus: "+status+"\nmessage: "+ajax.responseText);
                    }
                }
            };
            ajax.upload.addEventListener('progress', function(evt) {
                setProgress(Math.ceil(evt.loaded/evt.total), "sending");
            });
            ajax.open("POST", host+"/api/files/local");
            ajax.setRequestHeader("X-Api-Key", apik);
            ajax.send(form);
        }

        function gridhost_tracker(host,key) {
            ajax(host+"/api/check?key="+key, function(data) {
                data = js2o(data);
                DBUG.log(data);
                if (!data.done && !data.error) setTimeout(function() { gridhost_tracker(host,key) }, 1000);
            });
        }

        function gridhost_probe(ev, host) {
            if (ev && ev.code !== 'Enter') return;
            if (!(grid_host && grid_apik)) return;

            if (host) grid_host.value = host;

            var xhtr = new XMLHttpRequest(),
                host = grid_host.value,
                apik = grid_apik.value,
                target = grid_target.value;

            if (!apik) $('gpapik').style.display = 'none';

            if (!host && KIRI.api.ghostDetect(gridhost_probe)) return;

            xhtr.onreadystatechange = function() {
                if (xhtr.readyState === 4) {
                    if (xhtr.status >= 200 && xhtr.status < 300) {
                        SDB['grid-host'] = host;
                        SDB['grid-apik'] = apik;
                        var res = JSON.parse(xhtr.responseText);
                        var sel = false;
                        var html = [];
                        grid_targets = {};
                        for (var key in res) {
                            if (!SDB['grid-target']) {
                                SDB['grid-target'] = key;
                                sel = true;
                            } else {
                                sel = SDB['grid-target'] === key;
                            }
                            grid_targets[html.length] = key;
                            html.push(
                                "<option id='gpo-'" + key + " value='" +key + "'" +
                                (sel ? " selected" : "") +
                                ">" +
                                (res[key].comment || key) +
                                "</option>"
                            );
                        }
                        grid_target.innerHTML = html.join('\n');
                    } else if (xhtr.status === 401) {
                        $('gpapik').style.display = '';
                    } else {
                        SDB.removeItem('grid-host');
                        SDB.removeItem('grid-apik');
                        console.log("invalid grid:host url");
                    }
                }
            };

            xhtr.open("GET", host + "/api/targets?key=" + apik);
            xhtr.send();
        }

        function sendto_gridhost() {
            if (!(grid_host && grid_apik)) return;

            var xhtr = new XMLHttpRequest(),
                host = grid_host.value,
                apik = grid_apik.value,
                target = SDB['grid-target'] || '';

            if (target === '') {
                alert('invalid or missing target');
                return;
            }
            if (host.indexOf("http") !== 0) {
                alert("host missing protocol (http:// or https://)");
                return;
            }
            if (host.indexOf("://") < 0) {
                alert("host:port malformed");
                return;
            }
            if (SECURE && !isSecure(host)) {
                alert("host must begin with 'https' on a secure site");
                return;
            }

            SDB['grid-host'] = host.trim();
            SDB['grid-apik'] = apik.trim();

            xhtr.onreadystatechange = function() {
                if (xhtr.readyState === 4) {
                    var status = xhtr.status;
                    STATS.add('gp-'+status);
                    if (status >= 200 && status < 300) {
                        var json = js2o(xhtr.responseText);
                        gridhost_tracker(host,json.key);
                        ajax(host+"/api/wait?key="+json.key, function(data) {
                            data = js2o(data);
                            DBUG.log(data);
                            alert("print to "+target+": "+data.status);
                        });
                    } else {
                        alert("grid:host error\nstatus: "+status+"\nmessage: "+xhtr.responseText);
                    }
                    setProgress(0);
                }
            };
            xhtr.upload.addEventListener('progress', function(evt) {
                setProgress(Math.ceil(evt.loaded/evt.total), "sending");
            });
            filename = $('print-filename').value;
            xhtr.open("POST",
                host + "/api/print?" +
                "filename=" + filename +
                "&target=" + target +
                "&key=" + apik +
                "&time=" + Math.round(currentPrint.time) +
                "&length=" + Math.round(currentPrint.distance) +
                "&image=" + filename
            );
            xhtr.setRequestHeader("Content-Type", "text/plain");
            xhtr.send(screenShot ? [gcode,screenShot].join("\0") : gcode);
            hideModal();
        }

        function download() {
            filename = $('print-filename').value;
            saveAs(getBlob(), filename + "." + fileext);
        }

        function pad(v) {
            v = v.toString();
            return v.length < 2 ? '0' + v : v;
        }

        function calcWeight() {
            $('print-weight').value = (
                UTIL.round(
                    (Math.PI * UTIL.sqr(currentPrint.settings.device.filamentSize/2)) * currentPrint.distance * parseFloat($('print-weight').value || 1.25) / 1000, 2)
            );
        }

        function calcTime() {
            var floor = Math.floor,
                time = floor(currentPrint.time),
                hours = floor(time / 3600),
                newtime = time - hours * 3600,
                mins = floor(newtime / 60),
                secs = newtime - mins * 60;

            $('mill-time').value = $('print-time').value = [pad(hours),pad(mins),pad(secs)].join(':');
        }

        ajax("/kiri/output-gcode.html", function(html) {
            UI.print.innerHTML = html;
            $('print-close').onclick = hideModal;
            $('print-download').onclick = download;
            $('print-octoprint').onclick = sendto_octoprint;
            $('print-gridhost').onclick = sendto_gridhost;
            $('print-serial').onclick = showSerial;
            $('print-serial').style.display = MODE === MODES.CAM ? '' : 'none';
            $('print-filament-row').style.display = MODE === MODES.FDM ? '' : 'none';
            $('mill-info').style.display = MODE === MODES.CAM ? '' : 'none';
            $('print-filename').value = filename;
            $('print-filesize').value = currentPrint.bytes;
            $('print-filament').value = Math.round(currentPrint.distance);
            $('grid-host').onkeyup = gridhost_probe;
            $('grid-apik').onkeyup = gridhost_probe;
            calcTime();
            calcWeight();
            octo_host = $('octo-host');
            octo_apik = $('octo-apik');
            if (OCTOPRINT) {
                $('ophost').style.display = 'none';
                $('opapik').style.display = 'none';
                $('ophint').style.display = 'none';
                $('send-to-gridhost').style.display = 'none';
            }
            octo_host.value = SDB['octo-host'] || '';
            octo_apik.value = SDB['octo-apik'] || '';
            grid_host = $('grid-host');
            grid_apik = $('grid-apik');
            grid_target = $('grid-target');
            grid_target.onchange = function(ev) {
                SDB['grid-target'] = grid_targets[grid_target.selectedIndex];
            };
            grid_host.value = SDB['grid-host'] || '';
            grid_apik.value = SDB['grid-apik'] || '';
            gridhost_probe();
            showModal('print');
        });
    }

    function clearWidgetCache() {
        hideSlices();
        clearSlices();
        clearPrint();
    }

    function clearPrint() {
        if (currentPrint) {
            SPACE.platform.remove(currentPrint.group);
            currentPrint = null;
        }
        UI.layerPrint.checked = false;
    }

    function clearSlices() {
        forWidgets(function(widget) {
            widget.slices = null;
        });
    }

    /**
     * incrementally slice all meshes then incrementally update them
     *
     * @param {Function} callback
     */
    function prepareSlices(callback) {
        if (viewMode == VIEWS.ARRANGE) {
            screenShot = SPACE.screenshot();
            screenShot = screenShot.substring(screenShot.indexOf(",")+1);
        }

        setViewMode(VIEWS.SLICE);

        var selectSave = selectedMeshes.slice();

        clearPrint();
        saveSettings();
        widgetDeselect();

        var firstMesh = true,
            countdown = WIDGETS.length,
            preserveMax = showLayerMax,
            preserveLayer = showLayerValue,
            totalProgress,
            track = {};

        // require topo be sent back from worker for local printing
        settings.synth.sendTopo = false;

        setOpacity(slicing_opacity);

        // for each widget, slice
        forWidgets(function(widget) {
            var segtimes = {},
                segNumber = 0,
                errored = false,
                startTime,
                lastMsg;

            // skip non-selected widgets in CAM mode when any widget is selected
            if (MODE === MODES.CAM && selectSave.length > 0 && selectSave.indexOf(widget.mesh) < 0) return --countdown;

            widget.stats.progress = 0;
            widget.setColor(widget_slicing_color);
            widget.slice(settings, function(sliced, error) {
                var mark = UTIL.time();
                // on done
                widget.render(renderMode, MODE === MODES.CAM);
                // clear wireframe
                widget.setWireframe(false, wireframe_color, wireframe_model_opacity);
                widget.setOpacity(settings.mode === 'CAM' ? sliced_opacity_cam : sliced_opacity);
                widget.setColor(widget_deselected_color);
                // update UI info
                if (sliced) {
                    // update segment time
                    if (lastMsg) segtimes[segNumber+"_"+lastMsg] = mark - startTime;
                    DBUG.log(segtimes);
                    STATS.add('s-'+getMode().toLowerCase());
                    updateSliderMax(true);
                    if (preserveMax != showLayerMax) {
                        preserveLayer = showLayerMax;
                    }
                    firstMesh = false;
                }
                // on the last exit, update ui and call the callback
                if (--countdown === 0 || error || errored) {
                    setProgress(0);
                    showSlices(preserveLayer);
                    setOpacity(settings.mode === 'CAM' ? sliced_opacity_cam : sliced_opacity);
                    if (callback && typeof callback === 'function') callback();
                }
                // update slider window
                onControlResize();
                // handle slicing errors
                if (error && !errored) {
                    errored = true;
                    setViewMode(VIEWS.ARRANGE);
                    setOpacity(model_opacity);
                    widgetDeselect();
                    alert(error);
                }
            }, function(update, msg) {
                if (msg !== lastMsg) {
                    var mark = UTIL.time();
                    if (lastMsg) segtimes[segNumber+"_"+lastMsg] = mark - startTime;
                    lastMsg = msg;
                    startTime = mark;
                    segNumber++;
                }
                // on update
                track[widget.id] = update;
                totalProgress = 0;
                forWidgets(function(w) {
                    totalProgress += (track[w.id] || 0);
                });
                setProgress(totalProgress / WIDGETS.length, msg);
            }, true);
        });
    }

    function fillOffsetMult() {
        return 1.0-bound(settings.process.sliceFillOverlap, 0, 0.8);
    }

    function diffOffset() {
        return (settings.device.nozzleSize / 2) * fillOffsetMult();
    }

    function meshUpdateInfo(mesh) {
        UI.selection.style.display = selectedWidgetCount() ? 'block' : 'none';
        if (!mesh) {
            if (selectedMeshes.length === 0) {
                UI.selWidth.innerHTML = '0';
                UI.selDepth.innerHTML = '0';
                UI.selHeight.innerHTML = '0';
                UI.scaleX.value = '';
                UI.scaleY.value = '';
                UI.scaleZ.value = '';
            }
            return
        }
        UI.selWidth.innerHTML = UTIL.round(mesh.w,2);
        UI.selDepth.innerHTML = UTIL.round(mesh.h,2);
        UI.selHeight.innerHTML = UTIL.round(mesh.d,2);
        UI.scaleX.value = 1;
        UI.scaleY.value = 1;
        UI.scaleZ.value = 1;
    }

    function setOpacity(value) {
        forWidgets(function (w) { w.setOpacity(value) });
        UI.viewModelOpacity.value = value * 100;
        SPACE.update();
    }

    function moveSelection(x, y, z, abs) {
        forSelectedWidgets(function (w) { w.move(x, y, z, abs) });
        SPACE.update();
    }

    function scaleSelection(ev) {
        var dv = parseFloat(ev.target.value || 1);
        if (UI.scaleUniform.checked) {
            UI.scaleX.value = dv;
            UI.scaleY.value = dv;
            UI.scaleZ.value = dv;
        }
        var x = parseFloat(UI.scaleX.value || dv),
            y = parseFloat(UI.scaleY.value || dv),
            z = parseFloat(UI.scaleZ.value || dv);
        forSelectedWidgets(function (w) {
            w.scale(x,y,z);
            meshUpdateInfo(w.mesh);
        });
        UI.scaleX.value = 1;
        UI.scaleY.value = 1;
        UI.scaleZ.value = 1;
        platformComputeMaxZ();
        SPACE.update();
    }

    function rotateSelection(x, y, z) {
        forSelectedWidgets(function (w) { w.rotate(x, y, z) });
        platformComputeMaxZ();
        SPACE.update();
    }

    function boundsSelection() {
        var bounds = new THREE.Box3();
        forSelectedWidgets(function(widget) {
            bounds.union(widget.mesh.getBoundingBox());
        });
        return bounds;
    }

    function platformComputeMaxZ() {
        var maxZ = 0;
        forWidgets(function(widget) {
            maxZ = Math.max(maxZ, widget.mesh.getBoundingBox().max.z);
        });
        SPACE.platform.setMaxZ(maxZ);
    }

    function platformAdd(widget, shift, nolayout) {
        WIDGETS.push(widget);
        SPACE.platform.add(widget.mesh);
        widgetSelect(widget, shift);
        platformComputeMaxZ();
        if (nolayout) return;
        if (layoutOnAdd) layoutPlatform();
    }

    function platformDelete(widget) {
        if (Array.isArray(widget)) {
            var mc = widget.slice(), i;
            for (i=0; i<mc.length; i++) {
                platformDelete(mc[i].widget);
            }
            return;
        }
        KIRI.work.clear(widget);
        WIDGETS.remove(widget);
        SPACE.platform.remove(widget.mesh);
        selectedMeshes.remove(widget.mesh);
        updateSliderMax();
        platformComputeMaxZ();
        if (MODE !== MODES.FDM) layoutPlatform();
        SPACE.update();
    }

    function platformSelectAll() {
        forWidgets(function(w) { widgetSelect(w, true) })
    }

    function widgetSelect(widget, shift) {
        if (viewMode !== VIEWS.ARRANGE) return;
        var mesh = widget.mesh,
            sel = (selectedMeshes.indexOf(mesh) >= 0);
        if (sel) {
            if (shift) {
                widgetDeselect(widget)
            } else if (selectedMeshes.length > 1) {
                widgetDeselect();
                widgetSelect(widget, false);
            }
        } else {
            // prevent selection in slice view
            if (!mesh.material.visible) return;
            if (!shift) widgetDeselect();
            selectedMeshes.push(mesh);
            widget.setColor(widget_selected_color);
            meshUpdateInfo(mesh);
        }
        SPACE.update();
    }

    function selectedWidgetCount() {
        return viewMode === VIEWS.ARRANGE ? selectedMeshes.length : 0;
    }

    function widgetDeselect(widget) {
        if (viewMode !== VIEWS.ARRANGE) return;
        if (!widget) {
            forWidgets(function(widget) {
                widgetDeselect(widget);
            });
            return;
        }
        var mesh = widget.mesh,
            si = selectedMeshes.indexOf(mesh),
            sel = (si >= 0);
        if (sel) selectedMeshes.splice(si,1);
        widget.setColor(widget_deselected_color);
        SPACE.update();
        meshUpdateInfo();
    }

    function layoutPlatform(event, space) {
        var layout = (viewMode === VIEWS.ARRANGE),
            proc = settings.process,
            modified = false,
            topZ = MODE === MODES.CAM ? camTopZ : 0;

        switch (MODE) {
            case MODES.CAM:
            case MODES.LASER:
                space = space || proc.outputTileSpacing || 1;
                break;
            case MODES.FDM:
                space = space || (proc.sliceSupportExtra || 0) + 1;
                break;
        }

        setViewMode(VIEWS.ARRANGE);
        hideSlices();

        // do not layout when switching back from slice view
        if (!space && !layout) return SPACE.update();

        // check if any widget has been modified
        forWidgets(function(w) {
            modified |= w.isModified();
        });

        var gap = space;

        // in CNC mode with >1 widget, force layout with spacing @ 1.5x largest tool diameter
        if (MODE === MODES.CAM && WIDGETS.length > 1) {
            var spacing = space || 1, CAM = KIRI.driver.CAM;
            if (proc.roughingOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, proc.roughingTool));
            if (proc.finishingOn || proc.finishingXOn || proc.finishingYOn) spacing = Math.max(spacing, CAM.getToolDiameter(settings, proc.finishingTool));
            gap = spacing * 1.5;
        }

        var i, m, sz = SPACE.platform.size(),
            mp = [sz.x, sz.y],
            ms = [mp[0] / 2, mp[1] / 2],
            mi = mp[0] > mp[1] ? [(mp[0] / mp[1]) * 10, 10] : [10, (mp[1] / mp[1]) * 10],
            c = meshArray().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h) }),
            p = new MOTO.Pack(ms[0], ms[1], gap).fit(c);

        while (!p.packed) {
            ms[0] += mi[0];
            ms[1] += mi[1];
            p = new MOTO.Pack(ms[0], ms[1], gap).fit(c);
        }

        for (i = 0; i < c.length; i++) {
            m = c[i];
            m.fit.x += m.w / 2 + p.pad;
            m.fit.y += m.h / 2 + p.pad;
            m.widget.move(p.max.w / 2 - m.fit.x, p.max.h / 2 - m.fit.y, 0, true);
            m.widget.setTopZ(topZ);
            m.material.visible = true;
        }

        SPACE.update();
    }

    function loadWidget(url, onload) {
        if (url.toLowerCase().indexOf(".stl") > 0) {
            loadSTL(url, onload);
        } else {
            ajax(url, function(vertices) {
                vertices = js2o(vertices).toFloat32();
                platformAdd(newWidget().loadVertices(vertices));
                if (onload) onload(vertices);
            });
        }
    }

    function loadSTL(url, onload) {
        new MOTO.STL().load(url, function(vertices) {
            platformAdd(newWidget().loadVertices(vertices));
            if (onload) onload(vertices);
        })
    }

    function resetSettings(force) {
        if (force || confirm('reset all values to system defaults?')) {
            settings = settingsDefault;
            updateFields();
        };
    }

    /**
     * fill in missing settings from default template to pick up new fields
     * that may have been recently added and expected in the code
     *
     * @param {Object} osrc
     * @param {Object} odst
     */
    function fillMissingSettings(osrc, odst) {
        var key, val;
        for (key in osrc) {
            if (!osrc.hasOwnProperty(key)) continue;
            val = odst[key];
            if (typeof val === 'undefined' || val === null || val === '') {
                odst[key] = osrc[key];
            } else if (typeof osrc[key] === 'object') {
                fillMissingSettings(osrc[key], odst[key]);
            }
        }
    }

    /**
     * @returns {Object}
     */
    function updateFieldsFromSettings(scope) {
        if (!scope) return console.trace("missing scope");

        var key, val;

        fillMissingSettings(settingsDefault, settings);

        for (key in scope) {
            if (!scope.hasOwnProperty(key)) continue;
            val = scope[key];
            if (UI.hasOwnProperty(key)) {
                var uie = UI[key],
                    typ = uie ? uie.type : null;
                if (typ === 'text') {
                    uie.value = val;
                } else if (typ === 'checkbox') {
                    uie.checked = val;
                } else if (typ === 'select-one') {
                    uie.innerHTML = '<option></option>';
                    var chosen = null;
                    settings.tools.forEach(function(tool,index) {
                        if (val === tool.id) chosen = index+1;
                        var opt = DOC.createElement('option');
                        opt.appendChild(DOC.createTextNode(tool.name));
                        opt.setAttribute('value', tool.id);
                        uie.appendChild(opt);
                    });
                    if (chosen) uie.selectedIndex = chosen;
                }
            }
        }

        return settings;
    }

    /**
     * @returns {Object}
     */
    function updateSettingsFromFields(scope) {
        if (!scope) return console.trace("missing scope");

        var key,
            changed = false;

        // for each key in scope object
        for (key in scope) {
            if (!scope.hasOwnProperty(key)) continue;
            if (UI.hasOwnProperty(key)) {
                var nval = null,
                    uie = UI[key];
                // skip empty UI values
                if (!uie || uie === '') continue;
                if (uie.type === 'text') {
                    nval = UI[key].convert();
                } else if (uie.type === 'checkbox') {
                    nval = UI[key].checked;
                } else if (uie.type === 'select-one') {
                    if (uie.selectedIndex > 0) {
                        nval = parseInt(uie.options[uie.selectedIndex].value);
                    }
                }
                if (scope[key] != nval) {
                    scope[key] = nval;
                }
            }
        }

        settings.synth.fillOffsetMult = fillOffsetMult();
        settings.synth.diffOffsetMult = diffOffset();

        return settings;
    }

    function camUpdateWidgetZ() {
        var ztop = MODE === MODES.CAM ? camTopZ : 0;
        forWidgets(function(widget) {
            widget.setTopZ(ztop);
        });
    }

    function updateCamStock() {
        var sd = settings.process;
        // create/inject cam stock if stock size other than default
        if (sd.camStockX && sd.camStockY && sd.camStockZ) {
            if (!camStock) {
                var geo = new THREE.BoxGeometry(1, 1, 1);
                var mat = new THREE.MeshBasicMaterial({ color: 0x777777, opacity: 0.2, transparent: true, side:THREE.DoubleSide });
                var cube = new THREE.Mesh(geo, mat);
                SPACE.platform.add(cube);
                camStock = cube;
            }
            camStock.scale.x = sd.camStockX;
            camStock.scale.y = sd.camStockY;
            camStock.scale.z = sd.camStockZ;
            camStock.position.z = sd.camStockZ / 2;
            camStock.material.visible = settings.mode === 'CAM';
            camTopZ = sd.camStockZ - sd.camZTopOffset;
            camUpdateWidgetZ();
            SPACE.update();
        } else if (camStock) {
            SPACE.platform.remove(camStock);
            SPACE.update();
            camStock = null;
            camTopZ = 0;
            camUpdateWidgetZ();
        }
    }

    function updateFields() {
        updateFieldsFromSettings(settings.device);
        updateFieldsFromSettings(settings.process);
        updateFieldsFromSettings(settings.layers);
    }

    function updateSettings() {
        updateSettingsFromFields(settings.device);
        updateSettingsFromFields(settings.process);
        updateSettingsFromFields(settings.layers, true);
        saveSettings();
        updateCamStock();
    }

    function saveSettings(nocam) {
        // remove settings invalid for a given mode (cleanup)
        cull(settings, settingsDefault);
        switch (settings.mode) {
            case 'FDM':
                cull(settings.device, sf.fdm.d);
                cull(settings.process, sf.fdm.p);
                break;
            case 'CAM':
                cull(settings.device, sf.cam.d);
                cull(settings.process, sf.cam.p);
                break;
            case 'LASER':
                cull(settings.device, sf.laser.d);
                cull(settings.process, sf.laser.p);
                settings.cdev.LASER = settings.device;
                break;
        }
        cull(settings.cdev.FDM, sf.fdm.d);
        cull(settings.cdev.CAM, sf.cam.d);

        // store camera view
        var view = SPACE.view.save();
        if (view.left || view.up) settings.controller.view = view;

        SDB.setItem('ws-settings', JSON.stringify(settings));
    }

    function saveWorkspace() {
        saveSettings();
        var newWidgets = [],
            oldWidgets = js2o(SDB.getItem('ws-widgets'), []);
        forWidgets(function(widget) {
            newWidgets.push(widget.id);
            oldWidgets.remove(widget.id);
            widget.saveState();
        });
        SDB.setItem('ws-widgets', o2js(newWidgets));
        oldWidgets.forEach(function(wid) {
            Widget.deleteFromState(wid);
        });
    }

    function loadFiles(files) {
        for (var i=0; i<files.length; i++) {
            var lower = files[i].name.toLowerCase(),
                reader = new FileReader(),
                isstl = lower.indexOf(".stl") > 0,
                isgcode = lower.indexOf(".gcode") > 0 || lower.indexOf(".nc") > 0;
            reader.file = files[i];
            reader.onloadend = function (e) {
                if (isstl)
                platformAdd(
                    newWidget()
                    .loadVertices(new MOTO.STL().parse(e.target.result))
                    .saveToCatalog(e.target.file.name)
                );
                if (isgcode) loadGCode(e.target.result);
            };
            reader.readAsBinaryString(reader.file);
        }
    }

    function loadFile() {
        $('load-file').onchange = function(event) {
            DBUG.log(event);
            loadFiles(event.target.files);
        };
        $('load-file').click();
        // alert("drag/drop STL files onto platform to import\nreload page to return to last saved state");
    }

    // kiri api
    function getSettings() {
        return settings;
    }

    // kiri api
    function putSettings(newset) {
        settings = newset;
        saveSettings()
        restoreWorkspace(null, true);
    }

    function updatePlatformSize() {
        var dev = settings.device,
            width, depth,
            height = Math.round(Math.max(dev.bedHeight, dev.bedWidth/100, dev.bedDepth/100));
        SPACE.platform.setGZOff(height/2 - 0.1);
        SPACE.platform.setSize(
            width = parseInt(dev.bedWidth),
            depth = parseInt(dev.bedDepth),
            height
        );
        SPACE.platform.setHidden(width > 500 || depth > 500);
    }

    function restoreWorkspace(ondone, skipwidgets) {
        var loaded = 0,
            toload = ls2o('ws-widgets',[]),
            newset = ls2o('ws-settings'),
            camera = ls2o('ws-camera'),
            isFDM = (newset || settings).mode === 'FDM';

        if (newset) {
            fillMissingSettings(settingsDefault, newset);
            settings = newset;
            // override camera from settings
            if (settings.controller.view) {
                camera = settings.controller.view;
                SDB.removeItem('ws-camera');
                UI.reverseZoom.checked = settings.controller.reverseZoom;
            }
            // update/integrate old settings
            ["FDM","CAM","LASER"].forEach(function(mode) {
                var key = 'ws-settings-'+mode,
                    oset = ls2o(key, settings);
                SDB.removeItem(key);
                SDB.removeItem('ws-camera-'+mode);
                // create default settings if missing
                if (!settings.cproc[mode]) {
                    // merge bed into device
                    set(oset.device, oset.bed);
                    // merge output into process
                    set(oset.process, oset.output);
                    settings.cproc[mode] = "default";
                    settings.sproc[mode].default = oset.process;
                }
                // copy device into cdev cache if missing
                if (!settings.cdev[mode]) settings.cdev[mode] = oset.device;
                // prefer tools object from CAM settings
                if (mode === 'CAM' && oset.tools) {
                    settings.tools = oset.tools;
                }
                // restore per-mode filter
                settings.filter[mode] = oset.filter[mode];
            });
            // merge custom filters from localstorage into settings
            localFilters.forEach(function(fname) {
                var fkey = "gcode-filter-"+fname, ov = ls2o(fkey);
                if (ov) settings.devices[fname] = ov;
                SDB.removeItem(fkey)
            });
            SDB.removeItem(localFilterKey);
            // save updated settings
            saveSettings();
        }

        updateFields();
        updatePlatformSize();
        updateCamStock();

        SPACE.view.reset();

        if (camera) SPACE.view.load(camera);
        else setTimeout(SPACE.view.home, 100);

        if (skipwidgets) return;

        forWidgets(function(widget) {
            platformDelete(widget);
        });

        toload.forEach(function(widgetid) {
            Widget.loadFromState(widgetid, function(widget) {
                if (widget) platformAdd(widget, 0, isFDM);
                if (++loaded === toload.length) {
                    widgetDeselect();
                    if (ondone) ondone();
                }
            }, isFDM);
        });

        return toload.length > 0;
    }

    function clearWorkspace() {
        // free up worker cache/mem
        KIRI.work.clear();
        platformSelectAll();
        platformDelete(selectedMeshes);
    }

    function modalShowing() {
        var showing = false;
        ["modal","catalog","devices","tools"].forEach(function(dialog) {
            var state = UI[dialog].style.display
            showing = showing || state !== 'none';
        });
        return showing || UC.isPopped();
    }

    function showModal(which) {
        UI.modal.style.display = 'block';
        ["print","help"].forEach(function(modal) {
            UI[modal].style.display = (modal === which ? 'block' : 'none');
        });
    }

    function hideDialog() {
        showDialog(null);
    }

    function showDialog(which, force) {
        if (UC.isPopped()) {
            UC.hidePop();
            return;
        }
        ["catalog","devices","tools","settings"].forEach(function(dialog) {
            var style = UI[dialog].style;
            style.display = (dialog === which && (force || style.display !== 'flex') ? 'flex' : 'none');
        });
    }

    function showCatalog() {
        showDialog("catalog");
    }

    function loadNamedSetting(e, named) {
        var name = e ? e.target.getAttribute("load") : named || settings.cproc[getMode()],
            load = settings.sproc[getMode()][name],
            mode = getMode();
        if (!load) return;
        for (var k in load) {
            if (!load.hasOwnProperty(k)) continue;
            // prevent stored process from overwriting device defaults
            if (k === "outputOriginCenter" && mode == "FDM") continue;
            settings.process[k] = load[k];
        }
        settings.process.processName = name;
        settings.cproc[mode] = name;
        // associate named process with the current device
        settings.devproc[currentDeviceName()] = name;

        updateFields();
        if (!named) {
            hideDialog();
        }
        updateSettings();
        if (e) triggerSettingsEvent();
    }

    function deleteNamedSetting(e) {
        var name = e.target.getAttribute("del");
        delete settings.sproc[getMode()][name];
        updateSettingsList();
        saveSettings();
        triggerSettingsEvent();
    }

    function updateSettingsList() {
        var list = [], s = settings, sp = s.sproc[getMode()] || {}, table = UI.settingsList;
        table.innerHTML = '';
        for (var k in sp) {
            if (sp.hasOwnProperty(k)) list.push(k);
        }
        list.sort().forEach(function(sk) {
            var row = DOC.createElement('div'),
                load = DOC.createElement('button'),
                del = DOC.createElement('button'),
                name = sk;

            load.setAttribute('load', sk);
            load.onclick = loadNamedSetting;
            load.appendChild(DOC.createTextNode(sk));
            if (sk == settings.process.processName) {
                load.setAttribute('class', 'selected')
            }

            del.setAttribute('del', sk);
            del.setAttribute('title', "remove '"+sk+"'");
            del.onclick = deleteNamedSetting;
            del.appendChild(DOC.createTextNode('x'));

            row.setAttribute("class", "flow-row");
            row.appendChild(load);
            row.appendChild(del);
            table.appendChild(row);
        });
        onControlResize();
    }

    function showSettings() {
        updateSettingsList();
        showDialog("settings");
    }

    function onWindowResize() {
        onControlResize();
    }

    function onControlResize() {
        var left = UI.ctrlLeft.getBoundingClientRect(),
            right = UI.ctrlRight.getBoundingClientRect();
        UI.catalog.style.left = (left.width + 5) + 'px';
        UI.devices.style.left = (left.width + 5) + 'px';
        UI.tools.style.left = (left.width + 5) + 'px';
        UI.settings.style.right = (right.width + 5) + 'px';
    }

    function hideModal() {
        UI.modal.style.display = 'none';
    }

    function showSerial(toggle) {
        if (MODE !== MODES.CAM) return;
        hideModal();
        if (toggle === true) {
            KIRI.serial.toggle();
        } else {
            KIRI.serial.show();
        }
        STATS.add('d-sender');
    }

    function showHelpLocal() {
        showHelp("/kiri/help-kiri.html");
    }

    function showHelp(local) {
        hideDialog();
        if (!local) {
            WIN.open("//wiki.grid.space/wiki/Kiri:Moto", "_help");
            STATS.add('d-help');
            return;
        }
        ajax(local, function(html) {
            UI.help.innerHTML = html;
            $('help-close').onclick = hideModal;
            $('kiri-version').innerHTML = '<i>version '+kiri.version+"</i>";
            showModal('help');
            STATS.add('d-help');
        });
    }

    function takeFocus(el) {
        DOC.activeElement.blur();
        el = [ el || DOC.body, UI.ctrlLeft, UI.container, UI.assets, UI.control, UI.modeFDM, UI.reverseZoom, UI.viewModelOpacity, DOC.body ];
        for (var es, i=0; i<el.length; i++) {
            es = el[i];
            es.focus();
            if (DOC.activeElement === es) {
                break;
            }
        }
        UI.ctrlLeft.focus();
        UI.container.focus();
        //console.log({focus: DOC.activeElement});
    }

    function setViewMode(mode) {
        var oldMode = viewMode;
        viewMode = mode;
        widgetDeselect();
        meshUpdateInfo();
        [ UI.modeArrange, UI.modeSlice, UI.modePreview ].forEach(function(b) {
            b.removeAttribute("class");
        });
        switch (mode) {
            case VIEWS.ARRANGE:
                updateSliderMax();
                UI.layerView.style.display = 'none';
                UI.modeArrange.setAttribute("class","buton");
                break;
            case VIEWS.SLICE:
                UI.layerView.style.display = 'block';
                UI.modeSlice.setAttribute("class","buton");
                updateSliderMax();
                break;
            case VIEWS.PREVIEW:
                UI.layerView.style.display = 'block';
                UI.modePreview.setAttribute("class","buton");
                break;
            default:
                DBUG.log("invalid view mode: "+mode);
                return;
        }
    }

    function inMode(mode) {
        return settings.mode === mode;
    }

    function getMode() {
        return settings.mode;
    }

    function setMode(mode, lock, then) {
        hideModal();
        hideDialog();
        if (!MODES[mode]) {
            DBUG.log("invalid mode: "+mode);
            mode = 'FDM';
        }
        settings.mode = mode;
        // restore cached device profile for this mode
        if (settings.cdev[mode]) settings.device = settings.cdev[mode];
        // update device stat for FDM/CAM
        STATS.set('dn', settings.filter[mode] || '.laser.');
        MODE = MODES[mode];
        UC.setMode(MODE);
        loadNamedSetting();
        saveSettings();
        clearWidgetCache();
        SPACE.update();
        UI.modeFDM.setAttribute('class', MODE === MODES.FDM ? 'buton' : '');
        UI.modeLASER.setAttribute('class', MODE === MODES.LASER ? 'buton' : '');
        UI.modeCAM.setAttribute('class', MODE === MODES.CAM ? 'buton' : '');
        UI.mode.style.display = lock ? 'none' : '';
        UI.modeTable.style.display = lock ? 'none' : '';
        if (camStock) camStock.material.visible = settings.mode === 'CAM';
        restoreWorkspace(null,true);
        if (MODE !== MODES.FDM) layoutPlatform();
        if (then) then();
        triggerSettingsEvent();
    }

    function currentDeviceName() {
        return settings.filter[getMode()];
    }

    function setControlsVisible(show) {
        UI.ctrlLeft.style.display = show ? 'block' : 'none';
        UI.ctrlRight.style.display = show ? 'block' : 'none';
    }

    function eat(ev) {
        ev.cancelBubble = true;
        ev.preventDefault();
    }

    /** ******************************************************************
     * LETS_GET_THIS_PARTY_STARTED()
     ******************************************************************* */

    function init() {
        if (kiri.init) return;
        kiri.init = init;

        var assets = $('assets'),
            control = $('control'),
            container = $('container'),
            welcome = $('welcome'),
            selectedTool = null,
            editTools = null,
            ROT = Math.PI/2,
            ROT5 = ROT / 9,
            ALL = [MODES.FDM, MODES.LASER, MODES.CAM],
            CAM = [MODES.CAM],
            FDM = [MODES.FDM],
            FDM_CAM = [MODES.CAM,MODES.FDM],
            FDM_LASER = [MODES.LASER,MODES.FDM],
            CAM_LASER = [MODES.LASER,MODES.CAM],
            LASER = [MODES.LASER];

        WIN.addEventListener("resize", onWindowResize);

        SPACE.showSkyGrid(false);
        SPACE.setSkyColor(0xf8f8f8);
        SPACE.init(container, function (delta) {
            if (showLayerMax === 0) return;
            if (settings.controller.reverseZoom) delta = -delta;
            if (delta > 0) showLayerValue--;
            else if (delta < 0) showLayerValue++;
            showSlices();
        });
        SPACE.platform.onMove(saveSettings);

        set(UI, {
            container: container,
            ctrlLeft: $('control-left'),
            ctrlRight: $('control-right'),
            layerView: $('layer-view'),
            layerSlider: $('layer-slider'),

            assets: assets,
            control: control,
            modal: $('modal'),
            print: $('print'),
            help: $('help'),

            devices: $('devices'),
            deviceAdd: $('device-add'),
            deviceDelete: $('device-del'),
            deviceSave: $('device-save'),
            deviceClose: $('device-close'),
            deviceSelect: $('device-select'),

            device: UC.newGroup("device", $('device')),
            deviceName: UC.newInput("name", {size:20}),
            setDeviceFilament: UC.newInput("filament", {title:"diameter in millimeters", convert:UC.toFloat, modes:FDM}),
            setDeviceNozzle: UC.newInput("nozzle", {title:"diameter in millimeters", convert:UC.toFloat, modes:FDM}),
            setDeviceWidth: UC.newInput("bed width", {title:"millimeters", convert:UC.toInt}),
            setDeviceDepth: UC.newInput("bed depth", {title:"millimeters", convert:UC.toInt}),
            setDeviceHeight: UC.newInput("max height", {title:"max build height\nin millimeters", convert:UC.toInt, modes:FDM}),
            setDeviceMaxSpindle: UC.newInput("max spindle rpm", {title:"max spindle speed\n0 to disable", convert:UC.toInt, modes:CAM}),
            setDeviceExtrusion: UC.newBoolean("extrusion absolute", onBooleanClick, {title:"extrusion moves absolute"}),
            setDeviceOrigin: UC.newBoolean("origin center", onBooleanClick, {title:"bed origin center"}),
            setDeviceOriginTop: UC.newBoolean("origin top", onBooleanClick, {title:"part z origin top", modes:CAM}),

            setDevice: UC.newGroup("gcode", $('device')),
            setDeviceFan: UC.newInput("fan power", {title:"set cooling fan power", modes:FDM, size:15}),
            setDeviceTrack: UC.newInput("progress", {title:"output on each % progress", modes:FDM, size:15}),
            setDeviceLayer: UC.newText("layer", {title:"output at each layer change", modes:FDM, size:14, height: 2}),
            setDeviceToken: UC.newBoolean("token spacing", null, {title:"gcode token spacing", modes:CAM}),
            setDeviceStrip: UC.newBoolean("strip comments", null, {title:"strip gcode comments", modes:CAM}),
            setDeviceFExt: UC.newInput("file ext", {title:"file name exension", modes:CAM, size:5}),
            setDeviceDwell: UC.newText("dwell", {title:"gcode dwell script", modes:CAM, size:14, height:2}),
            setDeviceChange: UC.newText("tool change", {title:"tool change script", modes:CAM, size:14, height:2}),
            setDeviceSpindle: UC.newText("spindle speed", {title:"set spindle speed", modes:CAM, size:14, height:2}),
            setDevicePause: UC.newText("pause", {title:"gcode pause script", modes:FDM, size:14, height:3}),
            setDevicePre: UC.newText("header", {title:"gcode header script", modes:FDM_CAM, size:14, height:3}),
            setDevicePost: UC.newText("footer", {title:"gcode footer script", modes:FDM_CAM, size:14, height:3}),

            tools: $('tools'),
            toolsSave: $('tools-save'),
            toolsClose: $('tools-close'),
            toolSelect: $('tool-select'),
            toolAdd: $('tool-add'),
            toolDelete: $('tool-del'),
            toolType: $('tool-type'),
            toolName: $('tool-name'),
            toolNum: $('tool-num'),
            toolFluteDiam: $('tool-fdiam'),
            toolFluteLen: $('tool-flen'),
            toolShaftDiam: $('tool-sdiam'),
            toolShaftLen: $('tool-slen'),
            toolMetric: $('tool-metric'),

            catalog: $('catalog'),
            catalogBody: $('catalogBody'),
            catalogList: $('catalogList'),

            settings: $('settings'),
            settingsBody: $('settingsBody'),
            settingsList: $('settingsList'),

            layerID: $('layer-id'),
            layerSpan: $('layer-span'),
            layerRange: $('layer-range'),

            loading: $('loading').style,
            progress: $('progress').style,
            prostatus: $('prostatus'),

            selection: $('selection'),
            selWidth: $('sel_width'),
            selHeight: $('sel_height'),
            selDepth: $('sel_depth'),
            scaleX: $('scale_x'),
            scaleY: $('scale_y'),
            scaleZ: $('scale_z'),
            scaleUniform: $('scale_uni'),

            mode: UC.newGroup('mode', assets),
            modeTable: UC.newTableRow([
                [
                    UI.modeFDM =
                    UC.newButton("FDM Printing", function() { setMode('FDM',null,updatePlatformSize) }),
                ],[
                    UI.modeLASER =
                    UC.newButton("Laser Cutting", function() { setMode('LASER',null,updatePlatformSize) }),
                ],[
                    UI.modeCAM =
                    UC.newButton("CNC Milling",   function() { setMode('CAM',null,updatePlatformSize) }, {id:"modeCAM"}),
                ]
            ]),
            system: UC.newGroup('setup'),
            sysTable: UC.newTableRow([
                [
                    UI.setupDevices =
                    UC.newButton("Devices", showDevices, {modes:FDM_CAM})
                ],[
                    UI.setupTools =
                    UC.newButton('Tools',   showTools, {modes:CAM}),
                ],[
                    UI.helpButton =
                    UC.newButton("Help",    showHelp)
                ]
            ]),
            wsFunc: UC.newGroup('function'),
            wsFuncTable: UC.newTableRow([
                [
                    UC.newButton("Import",  function() { KIRI.api.import() }),
                    UI.import =
                    UC.newButton("+")
                ],[
                    UI.modeArrange =
                    UC.newButton("Arrange", layoutPlatform),
                ],[
                    UI.modeSlice =
                    UC.newButton("Slice",   prepareSlices)
                ],[
                    UI.modePreview =
                    UC.newButton("Preview", preparePrint),
                ],[
                    UI.modeExport =
                    UC.newButton("Export",  exportPrint)
                ]
            ]),
            workspace: UC.newGroup('platform'),
            wsTable: UC.newTableRow([
                [
                    UI.saveButton =
                    UC.newButton("Save",    saveWorkspace),
                ],[
                    UC.newButton("Clear",   clearWorkspace)
                ]
            ]),
            camera: UC.newGroup('view'),
            camTable: UC.newTableRow([
                [
                    UC.newButton("home",  SPACE.view.home),
                    UC.newButton("reset", SPACE.view.reset)
                ],[
                    UC.newButton("top",   SPACE.view.top),
                    UC.newButton("front", SPACE.view.front),
                ],[
                    UC.newButton("left",  SPACE.view.left),
                    UC.newButton("right", SPACE.view.right)
                ]
            ]),
            viewOpt: UC.newTableRow([[
                UI.reverseZoom = UC.newBoolean(null, invertMouse, {title:"invert mouse\nscroll zoom"}),
                UI.viewModelOpacity = UC.newRange(null, {title:"change model opacity"})
            ]]),

            layers: UC.setGroup($("layers")),
            layerOutline: UC.newBoolean("outline", onBooleanClick, {modes:LOCAL ? ALL : FDM_LASER}),
            layerTrace: UC.newBoolean("trace", onBooleanClick, {modes:FDM_LASER}),
            layerFacing: UC.newBoolean("facing", onBooleanClick, {modes:CAM}),
            layerRough: UC.newBoolean("roughing", onBooleanClick, {modes:CAM}),
            layerFinish: UC.newBoolean("finishing", onBooleanClick, {modes:CAM}),
            layerFinishX: UC.newBoolean("finish x", onBooleanClick, {modes:CAM}),
            layerFinishY: UC.newBoolean("finish y", onBooleanClick, {modes:CAM}),
            layerDelta: UC.newBoolean("delta", onBooleanClick, {modes:FDM}),
            layerSolid: UC.newBoolean("solids", onBooleanClick, {modes:FDM}),
            layerFill: UC.newBoolean("solid fill", onBooleanClick, {modes:FDM}),
            layerSparse: UC.newBoolean("sparse fill", onBooleanClick, {modes:FDM}),
            layerSupport: UC.newBoolean("support", onBooleanClick, {modes:FDM}),
            layerPrint: UC.newBoolean("print", onBooleanClick),

            settingsGroup: UC.newGroup("settings", control),
            settingsTable: UC.newTableRow([
                [
                    UI.settingsLoad =
                    UC.newButton("load", settingsLoad),
                    UI.settingsSave =
                    UC.newButton("save", settingsSave)
                ]
            ]),

            platform: UC.newGroup("build area", control, {modes:LASER}),
            bedWidth: UC.newInput("width", {title:"millimeters", convert:UC.toInt, modes:LASER}),
            bedDepth: UC.newInput("depth", {title:"millimeters", convert:UC.toInt, modes:LASER}),

            process: UC.newGroup("process", control, {modes:FDM_LASER}),

            // 3d print
            sliceHeight: UC.newInput("layer height", {title:"millimeters", convert:UC.toFloat, modes:FDM}),
            sliceShells: UC.newInput("shell count", {convert:UC.toInt, modes:FDM}),
            sliceShellSpacing: UC.newInput("shell spacing", {title:"as a percentage of nozzle width\n< 1.0 causes shell overlap\nrecommended 0.85 - 1.0", convert:UC.toFloat, bound:UC.bound(0.5,1.0), modes:FDM}),
            sliceFillOverlap: UC.newInput("fill overlap", {title:"overlap with shell\nas % of nozzle width\nhigher bonds better\n0.0 - 1.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            sliceFillSpacing: UC.newInput("fill spacing", {title:"for solid fill areas\nas a percentage of nozzle width\n< 1.0 causes fill overlap\nrecommended 0.85 - 1.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            sliceFillAngle: UC.newInput("fill angle", {title:"base angle in degrees", convert:UC.toFloat, modes:FDM}),
            sliceFillSparse: UC.newInput("fill ratio", {title:"for infill areas\n0.0 - 1.0", convert:UC.toFloat, bound:UC.bound(0.0,1.0), modes:FDM}),
            sliceSolidMinArea: UC.newInput("solid area", {title:"minimum area (cm^2)\nrequired to keep solid\nmust be > 0.1", convert:UC.toFloat, modes:FDM}),
            sliceSolidLayers: UC.newInput("solid layers", {title:"flat area fill projections\nbased on layer deltas", convert:UC.toInt, modes:FDM}),
            sliceBottomLayers: UC.newInput("base layers", {title:"bottom solid layer count", convert:UC.toInt, modes:FDM}),
            sliceTopLayers: UC.newInput("top layers", {title:"top solid layer count", convert:UC.toInt, modes:FDM}),
            sliceVase: UC.newBoolean("vase mode", onBooleanClick, {modes:FDM}),

            // laser
            laserOffset: UC.newInput("cut offset", {title:"millimeters\nadjust for beam width", convert:UC.toFloat, modes:LASER}),
            laserSliceHeight: UC.newInput("layer height", {title:"millimeters\n0 = auto/detect", convert:UC.toFloat, modes:LASER}),

            // cam roughing
            roughing: UC.newGroup("roughing", null, {modes:CAM}),
            roughingTool: UC.newSelectField("tool", {modes:CAM}),
            roughingSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            roughingOver: UC.newInput("step over", {title:"0.1 - 1.0\npercentage of\ntool diameter", convert:UC.toFloat, bound:UC.bound(0.1,1.0), modes:CAM}),
            roughingDown: UC.newInput("step down", {title:"step down depth\nfor each pass\nin millimeters\n0 to disable", convert:UC.toFloat, modes:CAM}),
            roughingSpeed: UC.newInput("feed rate", {title:"max speed while cutting\nmillimeters / minute", convert:UC.toInt, modes:CAM}),
            roughingPlunge: UC.newInput("plunge rate", {title:"max speed on z axis\nmillimeters / minute", convert:UC.toInt, modes:CAM}),
            roughingStock: UC.newInput("leave stock", {title:"horizontal offset from vertical faces\nstock to leave for finishing pass\nin millimeters", convert:UC.toFloat, modes:CAM}),
            roughingOn: UC.newBoolean("enable", onBooleanClick, {modes:CAM}),

            // cam finishing
            finishing: UC.newGroup("finishing", null, {modes:CAM}),
            finishingTool: UC.newSelectField("tool", {modes:CAM}),
            finishingSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            finishingOver: UC.newInput("step over", {title:"0.05 - 1.0\npercentage of\ntool diameter", convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:CAM}),
            finishingDown: UC.newInput("step down", {title:"step down depth\nfor each pass\nin millimeters\n0 to disable", convert:UC.toFloat, modes:CAM}),
            finishingAngle: UC.newInput("max angle", {title:"angles greater than this\nare considered vertical", convert:UC.toFloat, bound:UC.bound(45,90), modes:CAM}),
            finishingSpeed: UC.newInput("feed rate", {title:"max speed while cutting\nmillimeters / minute", convert:UC.toInt, modes:CAM}),
            finishingPlunge: UC.newInput("plunge rate", {title:"max speed on z axis\nmillimeters / minute", convert:UC.toInt, modes:CAM}),
            finishingOn: UC.newBoolean("waterline", onBooleanClick, {title:"contour finishing\ndisabled when pocketing", modes:CAM}),
            finishingXOn: UC.newBoolean("linear x", onBooleanClick, {title:"linear x-axis finishing", modes:CAM}),
            finishingYOn: UC.newBoolean("linear y", onBooleanClick, {title:"linear y-axis finishing", modes:CAM}),
            finishCurvesOnly: UC.newBoolean("curves only", onBooleanClick, {title:"limit linear cleanup\nto curved surfaces\nto reduce time", modes:CAM}),

            // cam drilling
            drilling: UC.newGroup("drilling", null, {modes:CAM}),
            drillTool: UC.newSelectField("tool", {modes:CAM}),
            drillSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            drillDown: UC.newInput("plunge per", {title:"max plunge between\ndwell periods\nin millimeters\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillDownSpeed: UC.newInput("plunge rate", {title:"plunge rate\nin millimeters / minute\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillDwell: UC.newInput("dwell time", {title:"dwell time\nbetween plunges in\nin milliseconds", convert:UC.toFloat, modes:CAM}),
            drillLift: UC.newInput("drill lift", {title:"lift between plunges\nafter dwell period\nin millimeters\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillingOn: UC.newBoolean("enable", onBooleanClick, {modes:CAM}),

            // cam cutout tabs
            camTabs: UC.newGroup("cutout tabs", null, {modes:CAM}),
            camTabsWidth: UC.newInput("width", {title:"width in millimeters\nperpendicular to part", convert:UC.toFloat, bound:UC.bound(1,100), modes:CAM}),
            camTabsHeight: UC.newInput("height", {title:"height in millimeters\nfrom part bottom", convert:UC.toFloat, bound:UC.bound(1,100), modes:CAM}),
            camTabsOn: UC.newBoolean("enable", onBooleanClick, {title:"enable or disable tabs\ntab generation skipped when\npocket only mode enabled", modes:CAM}),

            output: UC.newGroup("output"),
            outputTileSpacing: UC.newInput("spacing", {title:"millimeters\ndistance between layer output", convert:UC.toInt, modes:LASER}),
            outputTileScaling: UC.newInput("scaling", {title:"multiplier (0.1 to 100)", convert:UC.toInt, bound:UC.bound(0.1,100), modes:LASER}),
            outputLaserPower: UC.newInput("power", {title:"0 - 100 %", convert:UC.toInt, bound:UC.bound(1,100), modes:LASER}),
            outputLaserSpeed: UC.newInput("speed", {title:"millimeters / minute", convert:UC.toInt, modes:LASER}),

            outputBedTemp: UC.newInput("bed temp", {title:"degrees celsius", convert:UC.toInt, modes:FDM}),
            outputTemp: UC.newInput("nozzle temp", {title:"degrees celsius", convert:UC.toInt, modes:FDM}),
            outputFeedrate: UC.newInput("print speed", {title:"print move max speed\nmillimeters / minute", convert:UC.toInt, modes:FDM}),
            outputFinishrate: UC.newInput("finish speed", {title:"outermost shell speed\nmillimeters / minute", convert:UC.toInt, modes:FDM}),
            outputSeekrate: UC.newInput("move speed", {title:"non-print move speed\nmillimeters / minute\n0 = enable G0 moves", convert:UC.toInt, modes:FDM}),
            outputShellMult: UC.newInput("shell factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFillMult: UC.newInput("solid factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputSparseMult:  UC.newInput("infill factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputCooling: UC.newBoolean("cooling", onBooleanClick, {title: "enable cooling fan\nafter first layer", modes:FDM}),

            // cam output
            camTolerance: UC.newInput("tolerance", {title:"surface precision\nin millimeters", convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:CAM}),
            camZTopOffset: UC.newInput("z top offset", {title:"offset from stock surface\nto top face of part\nin millimeters", convert:UC.toFloat, modes:CAM}),
            camZBottom: UC.newInput("z bottom", {title:"offset from part bottom\nto limit cutting depth\nin millimeters", convert:UC.toFloat, modes:CAM}),
            camZClearance: UC.newInput("z clearance", {title:"travel offset from z top\nin millimeters", convert:UC.toFloat, bound:UC.bound(1,100), modes:CAM}),
            camPocketOnly: UC.newBoolean("pocket only", onBooleanClick, {title:"constrain to\npart boundaries", modes:CAM}),
            // camEaseDown: UC.newBoolean("ease down", onBooleanClick, {title:"rough plunge cuts\nwill spiral down", modes:CAM}),
            camDepthFirst: UC.newBoolean("depth first", onBooleanClick, {title:"optimize pocket cuts\nwith depth priority", modes:CAM}),
            outputClockwise: UC.newBoolean("clockwise", onBooleanClick, {title:"waterline milling direction", modes:CAM}),

            // cam stock
            camStock: UC.newGroup("stock", null, {modes:CAM}),
            camStockX: UC.newInput("width", {title:"width (x) in millimeters\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockY: UC.newInput("depth", {title:"depth (y) in millimeters\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockZ: UC.newInput("height", {title:"height (z) in millimeters\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            outputOriginCenter: UC.newBoolean("origin center", onBooleanClick, {modes:CAM_LASER}),
            camOriginTop: UC.newBoolean("origin top", onBooleanClick, {modes:CAM}),

            firstLayer: UC.newGroup("first layer", null, {modes:FDM}),
            firstSliceHeight: UC.newInput("layer height", {title:"in millimeters\nshould be >= slice height", convert:UC.toFloat, modes:FDM}),
            firstLayerRate: UC.newInput("shell speed", {title:"print move max speed\nmillimeters / minute", convert:UC.toFloat, modes:FDM}),
            firstLayerFillRate: UC.newInput("fill speed", {title:"fill move max speed\nmillimeters / minute", convert:UC.toFloat, modes:FDM}),
            firstLayerPrintMult: UC.newInput("print factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, modes:FDM}),
            outputBrimCount: UC.newInput("skirt count", {title:"number of skirts", convert:UC.toInt, modes:FDM}),
            outputBrimOffset: UC.newInput("skirt offset", {title:"millimeters", convert:UC.toFloat, modes:FDM}),

            support: UC.newGroup("supports", null, {modes:FDM}),
            sliceSupportDensity: UC.newInput("density", {title:"0.0 - 1.0\nrecommended 0.15\n0 to disable", convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:FDM}),
            sliceSupportSize: UC.newInput("pillar size", {title:"width in millimeters", bound:UC.bound(1.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportOffset: UC.newInput("part offset", {title:"millimeters\noffset from part", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportGap: UC.newInput("gap layers", {title:"number of layers\noffset from part", bound:UC.bound(0,5), convert:UC.toInt, modes:FDM}),
            sliceSupportSpan: UC.newInput("max bridge", {title:"span length that\ntriggers support\nin millimeters", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportArea: UC.newInput("min area", {title:"min area for a\nsupport column\nin millimeters", bound:UC.bound(0.1,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportExtra: UC.newInput("expand", {title:"expand support area\nbeyond part boundary\nin millimeters", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportEnable: UC.newBoolean("enable", onBooleanClick, {modes:FDM}),

            output: UC.newGroup("raft", null, {modes:FDM}),
            outputRaftSpacing:  UC.newInput("spacing", {title:"additional layer spacing\nbetween 1st layer and raft\nin millimeters", convert:UC.toFloat, bound:UC.bound(0.0,3.0), modes:FDM}),
            outputRaft: UC.newBoolean("enable", onBooleanClick, {title:"create a raft under the\nmodel for better adhesion\nuses skirt offset and\ndisables skirt output", modes:FDM}),

            advanced: UC.newGroup("advanced", null, {modes:FDM}),
            outputRetractDist: UC.newInput("retract dist", {title:"amount to retract filament", convert:UC.toFloat, modes:FDM}),
            outputRetractSpeed: UC.newInput("retract rate", {title:"speed of filament\nretraction in mm/s", convert:UC.toInt, modes:FDM}),
            outputRetractDwell: UC.newInput("engage dwell", {title:"time between re-engaging\nfilament and movement\nin milliseconds", convert:UC.toInt, modes:FDM}),
            outputShortPoly: UC.newInput("short outline", {title:"poly perimeter length\ntriggers short slowdown\nin millimeters", bound:UC.bound(0,200), convert:UC.toFloat, modes:FDM}),
            outputShortDistance: UC.newInput("short segment", {title:"segment length cutoff\nfor short segments\nin millimeters", bound:UC.bound(0,200), convert:UC.toFloat, modes:FDM}),
            outputShortFactor: UC.newInput("short factor", {title:"max speed reduction factor\nfor short segments\nas % of print speed", bound:UC.bound(0.05,1), convert:UC.toFloat, modes:FDM}),
            outputFinishFactor: UC.newInput("finish factor", {title:"% of nozzle diameter to\nshorten finish path by\nvalues of 0-1", bound:UC.bound(0.0,1), convert:UC.toFloat, modes:FDM}),
            sliceMinHeight: UC.newInput("min layer", {title: "enables adaptive slicing with\nthis as the min layer height\nin millimeters\n0 to disable", bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM}),
            zHopDistance: UC.newInput("z hop dist", {title: "amount to raise z\non retraction moves\nin millimeters\n0 to disable", bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM}),
            antiBacklash: UC.newInput("anti-backlash", {title: "use micro-movements to cancel\nbacklash during fills\nin millimeters", bound:UC.bound(0,3), convert:UC.toInt, modes:FDM}),
            //detectThinWalls: UC.newBoolean("thin wall fill", onBooleanClick, {title: "detect and fill thin openings\nbetween shells walls", modes:FDM})

            gcodeVars: UC.newGroup("gcode", null, {modes:FDM}),
            gcodeKFactor: UC.newInput("k-factor", {title: "aka linear advance\nuse {kfactor} in gcode", convert:UC.toInt, modes:FDM}),
            gcodePauseLayers: UC.newInput("pause layers", {title: "comma-separated list of layers\nto inject pause commands before", modes:FDM})
        });

        function toolUpdate(a,b,c) {
            DBUG.log(['toolUpdate',a,b,c])
        }

        function invertMouse() {
            settings.controller.reverseZoom = UI.reverseZoom.checked;
            SPACE.view.setZoom(settings.controller.reverseZoom, settings.controller.zoomSpeed);
            saveSettings();
        }

        function onBooleanClick() {
            updateSettings();
            showSlices();
        }

        function keyUpHandler(evt) {
            switch (evt.keyCode) {
                // escape
                case 27:
                    // blur text input focus
                    DOC.activeElement.blur();
                    // dismiss modals
                    hideModal();
                    // deselect widgets
                    widgetDeselect();
                    // hide all dialogs
                    hideDialog();
                    // cancel slicing
                    if (KIRI.work.isSlicing()) KIRI.work.restart();
                    break;
            }
            return false;
        }

        function inputHasFocus() {
            var active = DOC.activeElement;
            return active && (active.nodeName === "INPUT" || active.nodeName === "TEXTAREA");
        }

        function textAreaHasFocus() {
            var active = DOC.activeElement;
            return active && active.nodeName === "TEXTAREA";
        }

        function inputSize() {
            return parseInt(DOC.activeElement.size);
        }

        function keyDownHandler(evt) {
            if (modalShowing()) return false;
            var move = evt.altKey ? 5 : 0,
                deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);
            switch (evt.keyCode) {
                case 8: // apple: delete/backspace
                case 46: // others: delete
                    if (inputHasFocus()) return false;
                    if (selectedMeshes.length > 0) {
                        platformDelete(selectedMeshes);
                    }
                    evt.preventDefault();
                    break;
                case 37: // left arrow
                    if (inputHasFocus()) return false;
                    // if (selectedMeshes.length === 0) return;
                    if (deg) rotateSelection(0, 0, -deg);
                    if (move > 0) moveSelection(-move, 0, 0);
                    evt.preventDefault();
                    break;
                case 39: // right arrow
                    if (inputHasFocus()) return false;
                    // if (selectedMeshes.length === 0) return;
                    if (deg) rotateSelection(0, 0, deg);
                    if (move > 0) moveSelection(move, 0, 0);
                    evt.preventDefault();
                    break;
                case 38: // up arrow
                    if (inputHasFocus()) return false;
                    if (evt.metaKey) return setVisibleLayer(showLayerValue+1);
                    // if (selectedMeshes.length === 0) return;
                    if (deg) rotateSelection(deg, 0, 0);
                    if (move > 0) moveSelection(0, move, 0);
                    evt.preventDefault();
                    break;
                case 40: // down arrow
                    if (inputHasFocus()) return false;
                    if (evt.metaKey) return setVisibleLayer(showLayerValue-1);
                    // if (selectedMeshes.length === 0) return;
                    if (deg) rotateSelection(-deg, 0, 0);
                    if (move > 0) moveSelection(0, -move, 0);
                    evt.preventDefault();
                    break;
                case 65: // 'a' for select all
                    if (evt.metaKey) {
                        if (inputHasFocus()) return false;
                        evt.preventDefault();
                        widgetDeselect();
                        platformSelectAll();
                    }
                    break;
                case 83: // 's' for save workspace
                    if (evt.ctrlKey) {
                        evt.preventDefault();
                        saveSettings();
                        log("settings saved");
                    } else
                    if (evt.metaKey) {
                        evt.preventDefault();
                        saveWorkspace();
                    }
                    break;
                case 76: // 'l' for restore workspace
                    if (evt.metaKey) {
                        evt.preventDefault();
                        restoreWorkspace();
                    }
                    break;
            }
        }

        function cca(c) {
            return c.charCodeAt(0);
        }

        function keyHandler(evt) {
            var handled = true,
                style, sel, i, m, bb,
                ncc = evt.charCode - 48;
            if (modalShowing()) return false;
            if (inputHasFocus() && (inputSize() > 10 || (ncc >= 0 && ncc <= 9))) {
                return false;
            }
            switch (evt.charCode) {
                case cca('`'): showSlices(0); break;
                case cca('0'): showSlices(showLayerMax); break;
                case cca('1'): // toggle control left
                    if (evt.ctrlKey) {
                        style = UI.ctrlLeft.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        showSlices(showLayerMax/10);
                    }
                    break;
                case cca('2'): // toggle control right
                    if (evt.ctrlKey) {
                        style = UI.ctrlRight.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        showSlices(showLayerMax*2/10);
                    }
                    break;
                case cca('3'):
                    if (evt.ctrlKey) {
                        style = !SPACE.platform.isHidden();
                        SPACE.platform.setHidden(style);
                        SPACE.platform.showGrid(!style);
                        SPACE.update();
                    } else {
                        showSlices(showLayerMax*3/10);
                    }
                    break;
                case cca('4'): showSlices(showLayerMax*4/10); break;
                case cca('5'): showSlices(showLayerMax*5/10); break;
                case cca('6'): showSlices(showLayerMax*6/10); break;
                case cca('7'): showSlices(showLayerMax*7/10); break;
                case cca('8'): showSlices(showLayerMax*8/10); break;
                case cca('9'): showSlices(showLayerMax*9/10); break;
                case cca('?'):
                    showHelpLocal();
                    break;
                case cca('Z'): // reset stored state
                    if (confirm('clear all settings?')) {
                        SDB.clear();
                    }
                    break;
                case cca('C'): // refresh catalog
                    CATALOG.refresh();
                    break;
                case cca('c'): // open control window
                    showSerial(true);
                    break;
                case cca('i'): // single settings edit
                    var v = prompt('edit "'+settings.process.processName+'"', JSON.stringify(settings.process));
                    if (v) {
                        try {
                            settings.process = JSON.parse(v);
                            updateFields();
                        } catch (e) {
                            console.log(e);
                            alert("invalid settings format");
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
                    prepareSlices();
                    break;
                case cca('p'): // prepare print
                    preparePrint();
                    break;
                case cca('P'): // position widget
                    positionSelection();
                    break;
                case cca('R'): // position widget
                    rotateInputSelection();
                    break;
                case cca('x'): // export print
                    exportPrint();
                    break;
                case cca('e'): // devices
                    showDevices();
                    break;
                case cca('o'): // tools
                    showTools();
                    break;
                case cca('v'): // toggle single slice view mode
                    UI.layerRange.checked = !UI.layerRange.checked;
                    showSlices();
                    break;
                case cca('d'): // duplicate object
                    sel = selectedMeshes.slice();
                    widgetDeselect();
                    for (i=0; i<sel.length; i++) {
                        m = sel[i].clone();
                        m.geometry = m.geometry.clone();
                        m.material = m.material.clone();
                        bb = m.getBoundingBox();
                        var nw = newWidget().loadGeometry(m.geometry);
                        nw.move(bb.max.x - bb.min.x + 1, 0, 0);
                        platformAdd(nw,true);
                    }
                    break;
                case cca('m'): // mirror object
                    forSelectedWidgets(function(widget) {
                        widget.mirror();
                    });
                    SPACE.update();
                    break;
                case cca('R'): // toggle slice render mode
                    renderMode++;
                    prepareSlices();
                    break;
                case cca('a'): // auto arrange items on platform
                    layoutPlatform();
                    break;
                case cca('w'): // toggle wireframe on widgets
                    toggleWireframe(wireframe_color, wireframe_model_opacity);
                    break;
                default:
                    sendOnEvent('keypress', evt);
                    handled = false;
                    break;
            }
            if (handled) evt.preventDefault();
            return false;
        }

        function keys(o) {
            var key, list = [];
            for (key in o) { if (o.hasOwnProperty(key)) list.push(key) }
            return list.sort();
        }

        function clearSelected(children) {
            for (var i=0; i<children.length; i++) {
                children[i].setAttribute('class','');
            }
        }

        function rotateInputSelection() {
            if (selectedMeshes.length === 0) {
                alert("select object to rotate");
                return;
            }
            var coord = prompt("Enter X,Y,Z degrees of rotation").split(','),
                prod = Math.PI / 360,
                x = parseFloat(coord[0] || 0.0) * prod,
                y = parseFloat(coord[1] || 0.0) * prod,
                z = parseFloat(coord[2] || 0.0) * prod;

            rotateSelection(x, y, z);
        }

        function positionSelection() {
            if (selectedMeshes.length === 0) {
                alert("select object to position");
                return;
            }
            var center = settings.process.outputOriginCenter,
                bounds = boundsSelection(),
                coord = prompt("Enter X,Y coordinates for selection").split(','),
                x = parseFloat(coord[0] || 0.0),
                y = parseFloat(coord[1] || 0.0),
                z = parseFloat(coord[2] || 0.0);

            if (!center) {
                x = x - settings.device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
                y = y - settings.device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
            }

            moveSelection(x, y, z, true);
        }

        function loadSettingsFromServer(tok) {
            var hash = (tok || LOC.hash.substring(1)).split("/");
            if (hash.length === 2) {
                new moto.Ajax(function(reply) {
                    if (reply) {
                        var res = JSON.parse(reply);
                        if (res && res.ver && res.rec) {
                            var set = JSON.parse(atob(res.rec));
                            set.id = res.space;
                            set.ver = res.ver;
                            putSettings(set);
                            triggerSettingsEvent();
                            LOC.hash = '';
                        }
                    }
                }).request("/data/"+ hash[0] + "/" + hash[1]);
            }
        }

        function storeSettingsToServer(display) {
            var set = btoa(JSON.stringify(settings));
            new moto.Ajax(function(reply) {
                if (reply) {
                    var res = JSON.parse(reply);
                    if (res && res.ver) {
                        LOC.hash = res.space + "/" + res.ver;
                        if (display) alert("unique settings id is: " + res.space + "/" + res.ver);
                    }
                } else {
                    updateSpaceState();
                }
            }).request("/data/"+ settings.id + "/" + settings.ver, set);
        }

        function settingsSave() {
            hideDialog();
            var mode = getMode(),
                s = settings,
                def = "default",
                cp = s.process,
                pl = s.sproc[mode],
                pt = sf[mode.toLowerCase()].p, // process field mask
                name = WIN.prompt("Save Settings As", cp ? cp.processName || def : def);
            if (!name) return;
            var np = pl[name] = {};
            cp.processName = name;
            for (var k in cp) {
                if (!cp.hasOwnProperty(k)) continue;
                if (!pt.hasOwnProperty(k)) continue; // mask out invalid fields
                np[k] = cp[k];
            }
            s.cproc[getMode()] = name;
            saveSettings();
            triggerSettingsEvent();
        }

        function settingsLoad() {
            showSettings();
        }

        function putLocalDevice(devicename, code) {
            settings.devices[devicename] = code;
            saveSettings();
        }

        function removeLocalDevice(devicename) {
            delete settings.devices[devicename];
            saveSettings();
        }

        function isLocalDevice(devicename) {
            return settings.devices[devicename] ? true : false;
            // return localFilters.contains(devicename);
        }

        function getSelectedDevice() {
            return UI.deviceSelect.options[UI.deviceSelect.selectedIndex].text;
        }

        function selectDevice(devicename, lock) {
            deviceLock = lock;
            if (lock) UI.setupDevices.style.display = 'none';
            if (inMode('LASER')) return;
            if (isLocalDevice(devicename)) {
                setDeviceCode(settings.devices[devicename], devicename);
            } else {
                ajax("/kiri/filter/"+getMode()+"/"+devicename, function(code) {
                    setDeviceCode(code, devicename);
                });
            }
        }

        function valueOf(val, dv) {
            return typeof(val) !== 'undefined' ? val : dv;
        }

        // only for local filters
        function updateDeviceCode(override) {
            var oldname = getSelectedDevice(),
                newname = override || UI.deviceName.value,
                code = {
                    mode: getMode(),
                    settings: {
                        bed_width: parseInt(UI.setDeviceWidth.value) || 300,
                        bed_depth: parseInt(UI.setDeviceDepth.value) || 175,
                        build_height: parseInt(UI.setDeviceHeight.value) || 150,
                        nozzle_size: parseFloat(UI.setDeviceNozzle.value) || 0.4,
                        filament_diameter: parseFloat(UI.setDeviceFilament.value) || 1.75,
                        origin_center: UI.setDeviceOrigin.checked,
                        origin_top: UI.setDeviceOriginTop.checked,
                        extrude_abs: UI.setDeviceExtrusion.checked,
                        spindle_max: parseInt(UI.setDeviceMaxSpindle.value) || 0
                    },
                    cmd: {
                        fan_power: UI.setDeviceFan.value,
                        progress: UI.setDeviceTrack.value,
                        spindle: UI.setDeviceSpindle.value.split('\n'),
                        layer: UI.setDeviceLayer.value.split('\n')
                    },
                    pre: UI.setDevicePre.value.split('\n'),
                    post: UI.setDevicePost.value.split('\n'),
                    pause: UI.setDevicePause.value.split('\n'),
                    dwell: UI.setDeviceDwell.value.split('\n'),
                    'tool-change': UI.setDeviceChange.value.split('\n'),
                    'file-ext': UI.setDeviceFExt.value,
                    'token-space': UI.setDeviceToken.checked ? ' ' : '',
                    'strip-comments': UI.setDeviceStrip.checked
                };

            if (oldname !== newname && isLocalDevice(oldname)) removeLocalDevice(oldname);

            putLocalDevice(newname, code);
            setDeviceCode(code, newname);
        }

        function setDeviceCode(code, devicename) {
            try {
                STATS.set('dn', devicename);

                if (typeof(code) === 'string') code = js2o(code) || {};

                var cmd = code.cmd || {},
                    set = code.settings || {},
                    local = isLocalDevice(devicename),
                    dproc = settings.devproc[devicename];

                settings.device = {
                    bedHeight: 2.5,
                    bedWidth: valueOf(set.bed_width, 300),
                    bedDepth: valueOf(set.bed_depth, 175),
                    maxHeight: valueOf(set.build_height, 150),
                    nozzleSize: valueOf(set.nozzle_size, 0.4),
                    filamentSize: valueOf(set.filament_diameter, 1.75),
                    extrudeAbs: valueOf(set.extrude_abs, false),
                    spindleMax: valueOf(set.spindle_max, 0),
                    gcodeFan: valueOf(cmd.fan_power, ''),
                    gcodeTrack: valueOf(cmd.progress, ''),
                    gcodeLayer: valueOf(cmd.layer, []),
                    gcodePre: valueOf(code.pre, []),
                    gcodePost: valueOf(code.post, []),
                    gcodeProc: valueOf(code.proc, ''),
                    gcodePause: valueOf(code.pause, []),
                    gcodeDwell: valueOf(code.dwell, []),
                    gcodeSpindle: valueOf(cmd.spindle, []),
                    gcodeChange: valueOf(code['tool-change'], []),
                    gcodeFExt: valueOf(code['file-ext'], 'gcode'),
                    gcodeSpace: valueOf(code['token-space'], ''),
                    gcodeStrip: valueOf(code['strip-comments'], false)
                };

                var dev = settings.device,
                    proc = settings.process;

                proc.outputOriginCenter = valueOf(set.origin_center, true);
                proc.camOriginTop = valueOf(set.origin_top, true);

                UI.deviceName.value = devicename;
                // common
                UI.setDevicePre.value = dev.gcodePre.join('\n');
                UI.setDevicePost.value = dev.gcodePost.join('\n');
                UI.setDevicePause.value = dev.gcodePause.join('\n');
                UI.setDeviceWidth.value = dev.bedWidth;
                UI.setDeviceDepth.value = dev.bedDepth;
                UI.setDeviceHeight.value = dev.maxHeight;
                UI.setDeviceExtrusion.checked = dev.extrudeAbs;
                UI.setDeviceOrigin.checked = proc.outputOriginCenter;
                // FDM
                UI.setDeviceFan.value = dev.gcodeFan;
                UI.setDeviceTrack.value = dev.gcodeTrack;
                UI.setDeviceLayer.value = dev.gcodeLayer.join('\n');
                UI.setDeviceFilament.value = dev.filamentSize;
                UI.setDeviceNozzle.value = dev.nozzleSize;
                // CAM
                UI.setDeviceMaxSpindle.value = dev.spindleMax;
                UI.setDeviceSpindle.value = dev.gcodeSpindle.join('\n');
                UI.setDeviceDwell.value = dev.gcodeDwell.join('\n');
                UI.setDeviceChange.value = dev.gcodeChange.join('\n');
                UI.setDeviceFExt.value = dev.gcodeFExt;
                UI.setDeviceToken.checked = dev.gcodeSpace ? true : false;
                UI.setDeviceStrip.checked = dev.gcodeStrip;

                // disable editing for non-local devices
                [
                 UI.deviceName,
                 UI.setDevicePre,
                 UI.setDevicePost,
                 UI.setDevicePause,
                 UI.setDeviceDepth,
                 UI.setDeviceWidth,
                 UI.setDeviceHeight,
                 UI.setDeviceExtrusion,
                 UI.setDeviceOrigin,
                 UI.setDeviceOriginTop,
                 UI.setDeviceFan,
                 UI.setDeviceTrack,
                 UI.setDeviceLayer,
                 UI.setDeviceFilament,
                 UI.setDeviceNozzle,
                 UI.setDeviceMaxSpindle,
                 UI.setDeviceSpindle,
                 UI.setDeviceDwell,
                 UI.setDeviceChange,
                 UI.setDeviceFExt,
                 UI.setDeviceToken,
                 UI.setDeviceStrip
                 ].forEach(function(e) {
                    e.disabled = !local;
                 });

                // hide spindle fields when device doens't support it
                [
                 UI.roughingSpindle,
                 UI.finishingSpindle,
                 UI.drillSpindle
                ].forEach(function(e) {
                 e.parentNode.style.display = dev.spindleMax ? 'block' : 'none';
                });

                UI.deviceSave.disabled =
                UI.deviceDelete.disabled = !local;

                updateFields();
                updatePlatformSize();

                settings.filter[getMode()] = devicename;
                settings.cdev[getMode()] = dev;

                // restore last process associated with this device
                if (dproc) loadNamedSetting(null, dproc);

                saveSettings();
            } catch (e) {
                console.log({error:e, device:code});
                // alert("invalid or deprecated device. please select a new device.");
                showDevices();
            }
            clearWidgetCache();
            triggerSettingsEvent();
        }

        function renderDevices(devices) {
            UI.devices.onclick = UC.hidePop;
            UC.hidePop();

            var selectedIndex = -1,
                selected = currentDeviceName(),
                devs = settings.devices;

            for (var local in devs) {
                if (!(devs.hasOwnProperty(local) && devs[local])) continue;
                var dev = devs[local],
                    fdmCode = dev.cmd,
                    fdmMode = (getMode() === 'FDM');

                if (dev.mode ? (dev.mode === getMode()) : (fdmCode ? fdmMode : !fdmMode)) {
                    devices.push(local);
                }
            };

            devices = devices.sort();

            UI.deviceClose.onclick = hideDialog;
            UI.deviceSave.onclick = function() {
                clearWidgetCache();
                updateDeviceCode();
                saveSettings();
                showDevices();
            };
            UI.deviceAdd.onclick = function() {
                clearWidgetCache();
                updateDeviceCode(getSelectedDevice()+".copy");
                showDevices();
            };
            UI.deviceDelete.onclick = function() {
                clearWidgetCache();
                removeLocalDevice(getSelectedDevice());
                showDevices();
            };

            UI.deviceSelect.innerHTML = '';
            devices.forEach(function(device, index) {
                var opt = DOC.createElement('option');
                opt.appendChild(DOC.createTextNode(device));
                opt.onclick = function() { selectDevice(device) };
                if (isLocalDevice(device)) opt.setAttribute("local", 1);
                UI.deviceSelect.appendChild(opt);
                if (device === selected) selectedIndex = index;
            });

            if (selectedIndex >= 0) {
                UI.deviceSelect.selectedIndex = selectedIndex;
                selectDevice(selected);
            } else {
                UI.deviceSelect.selectedIndex = 0;
                selectDevice(devices[0]);
            }

            showDialog('devices', true);
            onWindowResize();

            UI.deviceSelect.focus();
        }

        function renderTools() {
            UI.toolSelect.innerHTML = '';
            editTools.forEach(function(tool, index) {
                tool.order = index;
                var opt = DOC.createElement('option');
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
            UI.toolMetric.checked = tool.metric;
            UI.toolType.selectedIndex = (
                tool.type === 'endmill' ? 0 :
                tool.type === 'ballmill' ? 1 :
                -1
            );
        }

        function updateTool() {
            selectedTool.name = UI.toolName.value;
            selectedTool.number = parseInt(UI.toolNum.value);
            selectedTool.flute_diam = parseFloat(UI.toolFluteDiam.value);
            selectedTool.flute_len = parseFloat(UI.toolFluteLen.value);
            selectedTool.shaft_diam = parseFloat(UI.toolShaftDiam.value);
            selectedTool.shaft_len = parseFloat(UI.toolShaftLen.value);
            selectedTool.metric = UI.toolMetric.checked;
            selectedTool.type = ['endmill','ballmill'][UI.toolType.selectedIndex];
            renderTools();
            UI.toolSelect.selectedIndex = selectedTool.order;
            editTools.changed = true;
        }

        function showTools() {
            if (MODE !== MODES.CAM) return;

            var selectedIndex = null;

            editTools = settings.tools.slice();

            UI.toolsClose.onclick = function() {
                if (editTools.changed && !confirm("abandon changes?")) return;
                hideDialog();
            };
            UI.toolAdd.onclick = function() {
                editTools.push({
                    id: UTIL.time(),
                    number: editTools.length,
                    name: "new",
                    type: "endmill",
                    flute_diam: 0.25,
                    flute_len: 1,
                    shaft_diam: 0.25,
                    shaft_len: 3,
                    metric: false
                });
                editTools.changed = true;
                renderTools();
                UI.toolSelect.selectedIndex = editTools.length-1;
                selectTool(editTools[editTools.length-1]);
            };
            UI.toolDelete.onclick = function() {
                editTools.remove(selectedTool);
                editTools.changed = true;
                renderTools();
            };
            UI.toolsSave.onclick = function() {
                editTools.changed = false;
                if (selectedTool) updateTool();
                settings.tools = editTools;
                saveSettings();
                updateFields();
                hideDialog();
                triggerSettingsEvent();
            };

            renderTools();
            if (editTools.length > 0) {
                selectTool(editTools[0]);
                UI.toolSelect.selectedIndex = 0;
            } else {
                UI.toolAdd.onclick();
            }

            showDialog('tools');
            UI.toolSelect.focus();
        }

        function showDevices() {
            if (MODE === MODES.LASER || deviceLock) return;

            setViewMode(VIEWS.ARRANGE);

            ajax("/api/filters-"+getMode().toLowerCase(), function(flvalue) {
                if (!flvalue) return;
                renderDevices(js2o(flvalue));
                STATS.add('d-gcode');
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

            var files = evt.dataTransfer.files,
                plate = files.length < 5 || confirm('add objects to table?');

            if (plate) loadFiles(files);
        }

        function loadCatalogFile(e) {
            Widget.loadFromCatalog(e.target.getAttribute('load'), function(widget) {
                platformAdd(widget);
                hideDialog();
            });
        }

        function deleteCatalogFile(e) {
            CATALOG.deleteFile(e.target.getAttribute('del'));
        }

        function updateCatalog(files) {
            var table = UI.catalogList,
                list = [];
            table.innerHTML = '';
            for (var name in files) {
                list.push({n:name, ln:name.toLowerCase(), v:files[name].vertices, t:files[name].updated});
            }
            list.sort(function(a,b) {
                return a.ln < b.ln ? -1 : 1;
            });
            for (var i=0; i<list.length; i++) {
                var row = DOC.createElement('div'),
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
            catalogSize = list.length;
            // fix layer scroll size
            onControlResize();
        }

        SPACE.addEventHandlers(SELF, [
            'keyup', keyUpHandler,
            'keydown', keyDownHandler,
            'keypress', keyHandler,
            'dragover', dragOverHandler,
            'dragleave', dragLeave,
            'drop', dropHandler
        ]);

        SPACE.onEnterKey([
            UI.layerSpan,    function() { showSlices() },
            UI.layerID,      function() { setVisibleLayer(UI.layerID.value) },

            UI.scaleX,           scaleSelection,
            UI.scaleY,           scaleSelection,
            UI.scaleZ,           scaleSelection,

            UI.toolName,         updateTool,
            UI.toolNum,          updateTool,
            UI.toolFluteDiam,    updateTool,
            UI.toolFluteLen,     updateTool,
            UI.toolShaftDiam,    updateTool,
            UI.toolShaftLen,     updateTool,

            UI.bedWidth,         updatePlatformSize,
            UI.bedDepth,         updatePlatformSize
        ]);

        UI.setupDevices.innerHTML = "D<u>e</u>vices";
        UI.setupTools.innerHTML = "T<u>o</u>ols";

        UI.modeArrange.innerHTML = "<u>A</u>rrange";
        UI.modeSlice.innerHTML = "<u>S</u>lice";
        UI.modePreview.innerHTML = "<u>P</u>review";
        UI.modeExport.innerHTML = "E<u>x</u>port";

        UI.layerID.convert = UC.toFloat.bind(UI.layerID);
        UI.layerSpan.convert = UC.toFloat.bind(UI.layerSpan);
        UI.layerRange.onclick = function() {
            UI.layerRange.checked = !(UI.layerRange.checked || false);
            showSlices();
        };

        $('layer-toggle').onclick = function(ev) {
            var ls = UI.layers.style;
            ls.display = ls.display !== 'block' ? 'block' : 'none';
            UI.layers.style.left = ev.target.getBoundingClientRect().left + 'px';
        };

        $('x-').onclick = function(ev) { rotateSelection(ev.shiftKey ? -ROT5 : -ROT,0,0) };
        $('x+').onclick = function(ev) { rotateSelection(ev.shiftKey ? ROT5 : ROT,0,0) };
        $('y-').onclick = function(ev) { rotateSelection(0,ev.shiftKey ? -ROT5 : -ROT,0) };
        $('y+').onclick = function(ev) { rotateSelection(0,ev.shiftKey ? ROT5 : ROT,0) };
        $('z-').onclick = function(ev) { rotateSelection(0,0,ev.shiftKey ? ROT5 : ROT) };
        $('z+').onclick = function(ev) { rotateSelection(0,0,ev.shiftKey ? -ROT5 : -ROT) };

        UI.viewModelOpacity.onchange = UI.viewModelOpacity.onclick = function(ev) {
            setOpacity(parseInt(UI.viewModelOpacity.value)/100);
        };

        UI.layerSlider.ondblclick = function() {
            UI.layerRange.checked = !UI.layerRange.checked;
            showSlices();
        };

        UI.layerSlider.onmousedown = function(ev) {
            if (ev.shiftKey) UI.layerRange.checked = !UI.layerRange.checked;
        };

        UI.layerSlider.onclick = function() {
            setVisibleLayer(UI.layerSlider.value);
        };

        UI.layerSlider.onmousemove = UI.layerSlider.onchange = function() {
            setVisibleLayer(UI.layerSlider.value);
        };

        UI.layerSlider.onmouseup = function() { takeFocus() };

        UI.import.setAttribute("import","1");
        UI.import.onclick = function() {
            showDialog("catalog");
        };

        UI.toolMetric.onclick = updateTool;
        UI.toolType.onchange = updateTool;

        $('kiri').onclick = showHelpLocal;

        SPACE.platform.setSize(
            settings.device.bedWidth,
            settings.device.bedDepth,
            settings.device.bedHeight
        );

        SPACE.platform.setGrid(25, 5);
        SPACE.platform.opacity(0.2);

        SPACE.mouse.downSelect(function() {
            if (viewMode !== VIEWS.ARRANGE) return null;
            return selectedMeshes;
        });

        SPACE.mouse.upSelect(function(selection, event) {
            if (event && event.target.nodeName === "CANVAS") {
                if (selection) {
                    widgetSelect(selection.object.widget, event.shiftKey);
                } else {
                    widgetDeselect();
                }
            } else {
                return meshArray();
            }
        });

        SPACE.mouse.onDrag(function(delta) {
            if (delta && MODE === MODES.FDM) {
                forSelectedWidgets(function(widget) {
                    widget.move(delta.x, delta.y, 0);
                });
            } else {
                return selectedMeshes.length > 0;
            }
        });

        function checkSeed(ondone) {
            // skip sample object load in onshape (or any script postload)
            if (!SDB[SEED] && !SETUP.s) {
                loadSTL("/obj/cube.stl", function(vert) {
                    CATALOG.putFile("sample cube.stl", vert);
                    SDB[SEED] = new Date().getTime();
                    platformComputeMaxZ();
                    SPACE.view.home();
                    setTimeout(saveWorkspace,500);
                    ondone();
                    showHelpLocal();
                });
                return true;
            }
            return false;
        }

        function ondone() {
            widgetDeselect();
            CATALOG.addFileListener(updateCatalog);
            SPACE.view.setZoom(settings.controller.reverseZoom, settings.controller.zoomSpeed);
            SPACE.platform.setZOff(0.2);

            if (SETUP.s) SETUP.s.forEach(function(lib) {
                var scr = DOC.createElement('script');
                scr.setAttribute('async',true);
                scr.setAttribute('src','/code/'+lib+'.js');
                DOC.body.appendChild(scr);
                STATS.add('l-'+lib);
            });

            if (SETUP.ss) SETUP.ss.forEach(function(style) {
                var ss = DOC.createElement('link');
                ss.setAttribute("type", "text/css");
                ss.setAttribute("rel", "stylesheet");
                ss.setAttribute("href", "/kiri/style-"+style+".css");
                DOC.body.appendChild(ss);
            });

            if (SETUP.v) SETUP.v.forEach(function(kv) {
                kv = kv.split('=');
                SDB.setItem(kv[0],kv[1]);
            });

            // import octoprint settings from url
            if (SETUP.ophost) {
                OCTOPRINT = {
                    host: SETUP.ophost[0],
                    apik: SETUP.opkey ? SETUP.opkey[0] : ''
                };
                SDB['octo-host'] = OCTOPRINT.host;
                SDB['octo-apik'] = OCTOPRINT.apik;
                console.log({octoprint:OCTOPRINT});
            }

            // mode passed on url
            var SETMODE = SETUP.mode ? SETUP.mode[0] : null;

            // device name pass on url
            var DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

            setMode(SETMODE || STARTMODE || settings.mode, SETMODE);
            setControlsVisible(true);
            updatePlatformSize();
            takeFocus();

            if (STATS.get('upgrade')) DBUG.log("kiri | version upgrade");
            STATS.del('upgrade');

            if (!SETUP.s) console.log("kiri | init main | "+kiri.version);
            STATS.set('seed', SDB[SEED]);
            STATS.add('init');
            // updateActive(true);

            // init gcode sender
            KIRI.serial.init();

            // place version number a couple of places to help users
            UI.helpButton.title = "version " + KIRI.version;

            // setup tab visibility watcher
            // DOC.addEventListener('visibilitychange', function() { document.title = document.hidden });

            // ensure settings has gcode
            selectDevice(DEVNAME || currentDeviceName(), DEVNAME);

            // ensure field data propagation
            updateSettings();

            // set initial layer slider size
            onControlResize();

            // send init-done event
            sendOnEvent('init-done', STATS);

            // load settings provided in url hash
            loadSettingsFromServer();
        }

        restoreWorkspace(ondone) || checkSeed(ondone) || ondone();

    } // end init()

    SPACE.addEventListener(DOC, 'DOMContentLoaded', function () { init() }, false);
    SPACE.addEventListener(WIN, 'mousemove', function() { mouseMoved = true });

    // prevent safari from exiting full screen mode
    DOC.onkeydown = function (evt) {
        if (evt.keyCode == 27) evt.preventDefault();
    }

    // run optional module functions
    if (Array.isArray(self.kirimod)) {
        kirimod.forEach(function(mod) { mod(kiri.api) });
    }
})();
