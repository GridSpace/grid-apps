/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_conf = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (self.kiri.conf) return;

    let KIRI = self.kiri,
        CVER = 2;

    function genID() {
        while (true) {
            let k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    // add fields to o(bject) from t(arget) that are missing
    // remove fields from o(bject) that don't exist in f(ilter)
    function fill_cull(o, t, f) {
        if (!o) return;
        // add missing
        for (let k in t) {
            if (!t.hasOwnProperty(k)) {
                continue;
            }
            let okv = o[k];
            if (f[k] !== undefined && (okv === undefined || okv === null)) {
                // console.log({fill: k});
                o[k] = t[k];
            }
        }
        // remove invalid
        for (let k in o) {
            if (!o.hasOwnProperty(k)) {
                continue;
            }
            if (!f.hasOwnProperty(k)) {
                // console.log({cull: k});
                delete o[k];
            }
        }
    }

    function valueOf(val, dv) {
        return typeof(val) !== 'undefined' ? val : dv;
    }

    function device_v1_to_v2(device) {
        if (device && device.filamentSize) {
            device.extruders = [{
                extFilament: device.filamentSize,
                extNozzle: device.nozzleSize,
                extSelect: ["T0"],
                extOffsetX: 0,
                extOffsetY: 0
            }];
            delete device.filamentSize;
            delete device.nozzleSize;
        }
    }

    // convert default filter (from server) into device structure
    function device_from_code(code,mode) {
        // presence of internal field indicates already converted
        if (code.internal >= 0) return code;

        let API = KIRI.api,
            cmd = code.cmd || {},
            set = code.settings || {},
            ext = code.extruders;

        let device = {
            mode: mode || code.mode || '',
            internal: 0,
            bedHeight: 2.5,
            bedWidth: valueOf(set.bed_width, 300),
            bedDepth: valueOf(set.bed_depth, 175),
            bedRound: valueOf(set.bed_circle, false),
            maxHeight: valueOf(set.build_height, 150),
            originCenter: valueOf(set.origin_center, false),
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
            gcodeStrip: valueOf(code['strip-comments'], false),
            gcodeLaserOn: valueOf(code['laser-on'], []),
            gcodeLaserOff: valueOf(code['laser-off'], []),
            extruders: []
        };

        if (ext) {
            // synthesize extruders from new style settings
            ext.forEach(rec => {
                let e = API.clone(CONF.template.device.extruders[0]);
                if (rec.nozzle) e.extNozzle = rec.nozzle;
                if (rec.filament) e.extFilament = rec.filament;
                if (rec.offset_x) e.extOffsetX = rec.offset_x;
                if (rec.offset_y) e.extOffsetY = rec.offset_y;
                if (rec.select) e.extSelect = rec.select;
                device.extruders.push(e);
            });
        } else {
            // synthesize extruders from old style settings
            device.extruders = [API.clone(CONF.template.device.extruders[0])];
            device.extruders[0].extNozzle = valueOf(set.nozzle_size, 0.4);
            device.extruders[0].extFilament = valueOf(set.filament_diameter, 1.75);
        }

        return device;
    }

    function objectMap(o, fn) {
        for (let [key,  val] of Object.entries(o)) {
            o[key] = fn(val) || val;
        }
    }

    function forValues(o, fn) {
        Object.values(o).forEach(v => fn(v));
    }

    // ensure settings structure is up-to-date
    function normalize(settings) {
        let API = KIRI.api,
            filter = CONF.filter,
            defaults = CONF.template,
            filter_dev = filter.fdm.d,
            filter_pro = filter.fdm.p;

        switch (settings.mode) {
            case 'FDM':
                break;
            case 'CAM':
                filter_dev = filter.cam.d;
                filter_pro = filter.cam.p;
                break;
            case 'LASER':
                filter_dev = filter.laser.d;
                filter_pro = filter.laser.p;
                break;
        }

        // v1 to v2 changed FDM extruder / nozzle / filament structure
        if (settings.ver === 1) {
            // backup settings before upgrade
            API.sdb.setItem(`ws-settings-${Date.now()}`, JSON.stringify(settings));
            device_v1_to_v2(settings.device);
            device_v1_to_v2(settings.cdev.FDM);
            objectMap(settings.devices, dev => {
                return device_from_code(dev);
            });
            settings.ver = 2;
        }

        fill_cull(settings, defaults, defaults);
        fill_cull(settings.device, defaults.device, filter_dev);
        fill_cull(settings.process, defaults.process, filter_pro);
        fill_cull(settings.cdev.FDM, defaults.device, filter.fdm.d);
        forValues(settings.sproc.FDM, proc => {
            fill_cull(proc, defaults.process, filter.fdm.p);
        });
        fill_cull(settings.cdev.CAM, defaults.device, filter.cam.d);
        forValues(settings.sproc.CAM, proc => {
            fill_cull(proc, defaults.process, filter.cam.p);
        });
        fill_cull(settings.cdev.LASER, defaults.device, filter.laser.d);
        forValues(settings.sproc.LASER, proc => {
            fill_cull(proc, defaults.process, filter.laser.p);
        });
        fill_cull(settings.controller, defaults.controller, defaults.controller);

        return settings;
    }

    let CONF = KIRI.conf = {
        // --------------- helper functions
        normalize: normalize,
        device_from_code: device_from_code,
        // ---------------
        MODES: {
            FDM: 1,   // fused deposition modeling (also FFF)
            LASER: 2, // laser cutting
            CAM: 3    // 3 axis milling/machining
        },
        VIEWS: {
            ARRANGE: 1,
            SLICE: 2,
            PREVIEW: 3
        },
        // --------------- settings field filters
        filter: {
            fdm:{
                // fields permitted in FDM:Device
                d:{
                    mode: 1,
                    internal: 1,
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    bedRound: 1,
                    maxHeight: 1,
                    extrudeAbs: 1,
                    originCenter: 1,
                    gcodePre: 1,
                    gcodePost: 1,
                    gcodeProc: 1,
                    gcodePause: 1,
                    gcodeFExt: 1,
                    gcodeFan: 1,
                    gcodeTrack: 1,
                    gcodeLayer: 1,
                    extruders: 1
                },
                // fields permitted in FDM:Process
                p:{
                    processName: 1,
                    sliceHeight: 1,
                    sliceShells: 1,
                    sliceFillAngle: 1,
                    sliceFillOverlap: 1,
                    sliceFillSparse: 1,
                    sliceFillType: 1,
                    sliceSupportEnable: 1,
                    sliceSupportDensity: 1,
                    sliceSupportOffset: 1,
                    sliceSupportGap: 1,
                    sliceSupportSize: 1,
                    sliceSupportArea: 1,
                    sliceSupportExtra: 1,
                    sliceSupportSpan: 1,
                    sliceSupportNozzle: 1,
                    sliceSolidMinArea: 1,
                    sliceSolidLayers: 1,
                    sliceBottomLayers: 1,
                    sliceTopLayers: 1,
                    firstSliceHeight: 1,
                    firstLayerRate: 1,
                    firstLayerFillRate: 1,
                    firstLayerPrintMult: 1,
                    firstLayerNozzleTemp: 1,
                    firstLayerBedTemp: 1,
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
                    outputFanLayer: 1,
                    outputRetractDist: 1,
                    outputRetractSpeed: 1,
                    outputRetractDwell: 1,
                    outputBrimCount: 1,
                    outputBrimOffset: 1,
                    outputShortPoly: 1,
                    outputMinSpeed: 1,
                    outputCoastDist: 1,
                    outputWipeDistance: 1,
                    sliceMinHeight: 1,
                    // detectThinWalls: 1,
                    antiBacklash: 1,
                    zHopDistance: 1,
                    // polishLayers: 1,
                    // polishSpeed: 1,
                    outputLayerRetract: 1,
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
                    mode: 1,
                    internal: 1,
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    originCenter: 1,
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
                    camFastFeed: 1,
                    roughingTool: 1,
                    roughingSpindle: 1,
                    roughingDown: 1,
                    roughingOver: 1,
                    roughingSpeed: 1,
                    roughingPlunge: 1,
                    roughingStock: 1,
                    camPocketOnlyRough: 1,
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
                    camPocketOnlyFinish: 1,
                    drillTool: 1,
                    drillSpindle: 1,
                    drillDownSpeed: 1,
                    drillDown: 1,
                    drillDwell: 1,
                    drillLift: 1,
                    drillingOn: 1,
                    camTabsAngle: 1,
                    camTabsCount: 1,
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
                    camStockOffset: 1,
                    outputClockwise: 1,
                    outputOriginCenter: 1,
                    outputInvertX: 1,
                    outputInvertY: 1
                }
            },
            laser: {
                // fields permitted in Laser:Device
                d:{
                    mode: 1,
                    internal: 1,
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    gcodePre: 1,
                    gcodePost: 1,
                    gcodeFExt: 1,
                    gcodeSpace: 1,
                    gcodeLaserOn: 1,
                    gcodeLaserOff: 1
                },
                // fields permitted in Laser:Process
                p:{
                    processName: 1,
                    laserOffset: 1,
                    laserSliceHeight: 1,
                    laserSliceSingle: 1,
                    outputTileSpacing: 1,
                    outputTileScaling: 1,
                    outputLaserPower: 1,
                    outputLaserSpeed: 1,
                    outputLaserGroup: 1,
                    outputLaserMerged: 1,
                    outputOriginBounds: 1,
                    outputOriginCenter: 1,
                    outputInvertX: 1,
                    outputInvertY: 1
                }
            }
        },
        // --------------- default settings
        template: {
            // CAM only
            bounds: {},
            origin: {},
            stock: {},
            tools:[
                {
                    id: 1000,
                    number: 1,
                    type: "endmill",
                    name: "end 1/4",
                    metric: false,
                    shaft_diam: 0.25,
                    shaft_len:  1,
                    flute_diam: 0.25,
                    flute_len:  2,
                    // taper_angle: 70,
                    taper_tip: 0,
                },
                {
                    id: 1001,
                    number: 2,
                    type: "endmill",
                    name: "end 1/8",
                    metric: false,
                    shaft_diam: 0.125,
                    shaft_len:  1,
                    flute_diam: 0.125,
                    flute_len:  1.5,
                    // taper_angle: 70,
                    taper_tip: 0,
                },
                {
                    id: 1002,
                    number: 3,
                    type: "endmill",
                    name: "end 1/16",
                    metric: false,
                    shaft_diam: 0.0625,
                    shaft_len:  1,
                    flute_diam: 0.0625,
                    flute_len:  1.5,
                    // taper_angle: 70,
                    taper_tip: 0,
                }
            ],
            // FDM/CAM/Laser merged
            device:{
                mode: "",           // device local
                internal: 0,        // device edit state
                bedWidth: 300,      // FDM/CAM/Laser
                bedDepth: 175,      // FDM/CAM/Laser
                bedHeight: 2.5,     // display only (deprecate)
                bedRound: false,    // FDM
                originCenter: false,// FDM/CAM
                maxHeight: 150,     // FDM
                spindleMax: 0,      // CAM
                gcodePre: [],       // FDM/CAM header script
                gcodePost: [],      // FDM/CAM footer script
                gcodePause: [],     // FDM pause script
                gcodeProc: "",      // FDM post processor script (encoding, etc)
                gcodeFan: "",       // FDM fan command
                gcodeTrack: "",     // FDM progress command
                gcodeLayer: [],     // FDM layer output
                gcodeFExt: "",      // CAM file extension
                gcodeSpace: "",     // CAM token spacing
                gcodeStrip: true,   // CAM strip comments
                gcodeDwell: ["G4 P{time}"],     // CAM dwell script
                gcodeChange: ["M6 T{tool}"],    // CAM tool change script
                gcodeSpindle: ["M3 S{speed}"],  // CAM spindle speed
                gcodeLaserOn: ["M106 S{power}"],// LASER turn on
                gcodeLaserOff: ["M107"],        // LASER turn off
                extruders:[{        // FDM extruders structure
                    extFilament: 1.75,
                    extNozzle: 0.4,
                    extSelect: ["T0"],
                    extOffsetX: 0,
                    extOffsetY: 0
                }]
            },
            // FDM/CAM/Laser merged
            process:{
                // --- shared ---
                processName: "default",
                outputOriginBounds: true,
                outputOriginCenter: true,
                outputInvertX: false,
                outputInvertY: false,

                // --- FDM ---
                sliceHeight: 0.25,
                sliceShells: 3,
                sliceFillAngle: 45,
                sliceFillOverlap: 0.3,
                sliceFillSparse: 0.5,
                sliceFillType: "hex",
                sliceSupportEnable: false,
                sliceSupportDensity: 0.25,
                sliceSupportOffset: 1.0,
                sliceSupportGap: 1,
                sliceSupportSize: 10,
                sliceSupportArea: 1,
                sliceSupportExtra: 0,
                sliceSupportSpan: 6,
                sliceSupportNozzle: 0,
                sliceSolidMinArea: 1,
                sliceSolidLayers: 3,
                sliceBottomLayers: 3,
                sliceTopLayers: 3,
                firstSliceHeight: 0.25,
                firstLayerRate: 30,
                firstLayerFillRate: 40,
                firstLayerPrintMult: 1.0,
                firstLayerNozzleTemp: 0,
                firstLayerBedTemp: 0,
                outputRaft: false,
                outputRaftSpacing: 0.2,
                outputTemp: 200,
                outputFanMax: 255,
                outputBedTemp: 0,
                outputFeedrate: 80,
                outputFinishrate: 60,
                outputSeekrate: 100,
                outputShellMult: 1.2,
                outputFillMult: 1.2,
                outputSparseMult: 1.2,
                outputFanLayer: 1,
                outputRetractDist: 1.0,
                outputRetractSpeed: 40,
                outputRetractDwell: 30,
                outputBrimCount: 2,
                outputBrimOffset: 2,
                outputShortPoly: 50.0,
                outputMinSpeed: 15.0,
                outputCoastDist: 0,
                outputWipeDistance: 0,
                sliceMinHeight: 0,
                detectThinWalls: false,
                antiBacklash: 1,
                zHopDistance: 0.2,
                // polishLayers: 0,
                // polishSpeed: 40,
                outputLayerRetract: false,
                gcodePauseLayers: "",

                // --- LASER ---
                laserOffset: 0.25,
                laserSliceHeight: 1,
                laserSliceSingle: false,
                outputTileSpacing: 1,
                outputTileScaling: 1,
                outputLaserPower: 100,
                outputLaserSpeed: 1000,
                outputLaserGroup: true,
                outputLaserMerged: false,

                // --- CAM ---
                camFastFeed: 6000,
                roughingTool: 1000,
                roughingSpindle: 1000,
                roughingDown: 2,
                roughingOver: 0.5,
                roughingSpeed: 1000,
                roughingPlunge: 250,
                roughingStock: 0,
                camPocketOnlyRough: false,
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
                camPocketOnlyFinish: false,
                drillTool: 1000,
                drillSpindle: 1000,
                drillDownSpeed: 250,
                drillDown: 5,
                drillDwell: 250,
                drillLift: 2,
                drillingOn: false,
                camTabsAngle: 0,
                camTabsCount: 4,
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
                camStockOffset: true,
                outputClockwise: false,
            },
            // current process name
            cproc:{
                FDM: "default",
                CAM: "default",
                LASER: "default"
            },
            // saved processes by name
            sproc:{
                FDM: {},
                CAM: {},
                LASER: {}
            },
            // cached device settings by mode
            cdev: {
                FDM: null,
                CAM: null,
                LASER: null
            },
            // now they're called devices instead of gcode filters
            filter:{
                FDM: "Any.Generic.Marlin",
                CAM: "Any.Generic.Grbl",
                LASER: "Any.Generic.Laser"
            },
            // custom devices by name
            devices:{
            },
            // favorite devices
            favorites:{
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
                layerPrint: false,
                layerMoves: false
            },
            // for passing temporary slice hints (topo currently)
            synth: {
            },
            controller:{
                view: null,
                dark: false,
                expert: false,
                compact: false,
                zoomSpeed: 1.0,
                reverseZoom: true,
                showOrigin: false,
                freeLayout: true,
                autoLayout: true,
                alignTop: true,
                units: "mm"
            },
            // widget extra info for slicing (like extruder mapping)
            widget: {
            },
            mode: 'FDM',
            id: genID(),
            ver: CVER
        }
    };

})();
