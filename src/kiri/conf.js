/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.conf) return;

    const KIRI = self.kiri, CVER = 185, clone = Object.clone;

    function genID() {
        while (true) {
            let k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    // add fields to o(bject) from d(efault) that are missing
    // remove fields from o(bject) that don't exist in d(efault)
    function fill_cull_once(obj, def) {
        if (!obj) return;
        // add missing
        for (let k in def) {
            if (def.hasOwnProperty(k)) {
                let okv = obj[k];
                if ((okv === undefined || okv === null)) {
                    // console.log({fill: k});
                    obj[k] = def[k];
                }
            }
        }
        // remove invalid
        for (let k in obj) {
            if (!def.hasOwnProperty(k)) {
                // console.log({cull: k});
                delete obj[k];
            }
        }
    }

    function fill_cull_many(map, def) {
        forValues(map, (obj) => { fill_cull_once(obj, def) });
    }

    function objectMap(o, fn) {
        for (let [key,  val] of Object.entries(o)) {
            o[key] = fn(val) || val;
        }
    }

    function valueOf(val, dv) {
        return typeof(val) !== 'undefined' ? val : dv;
    }

    function forValues(o, fn) {
        Object.values(o).forEach(v => fn(v));
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

        // currently causes unecessary fills and culls because
        // it's not mode and device type sensitive
        let device = {
            noclone: valueOf(code.no_clone, false),
            mode: mode || code.mode || '',
            internal: 0,
            bedHeight: valueOf(set.bed_height, 2.5),
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
            gcodeSpace: valueOf(code['token-space'], true),
            gcodeStrip: valueOf(code['strip-comments'], false),
            gcodeLaserOn: valueOf(code['laser-on'], []),
            gcodeLaserOff: valueOf(code['laser-off'], []),
            extruders: []
        };

        if (ext) {
            // synthesize extruders from new style settings
            ext.forEach(rec => {
                let e = API.clone(CONF.defaults.fdm.d.extruders[0]);
                if (rec.nozzle) e.extNozzle = rec.nozzle;
                if (rec.filament) e.extFilament = rec.filament;
                if (rec.offset_x) e.extOffsetX = rec.offset_x;
                if (rec.offset_y) e.extOffsetY = rec.offset_y;
                if (rec.select) e.extSelect = rec.select;
                device.extruders.push(e);
            });
        } else {
            // synthesize extruders from old style settings
            device.extruders = [API.clone(CONF.defaults.fdm.d.extruders[0])];
            device.extruders[0].extNozzle = valueOf(set.nozzle_size, 0.4);
            device.extruders[0].extFilament = valueOf(set.filament_diameter, 1.75);
        }

        return device;
    }

    // ensure settings structure is up-to-date
    function normalize(settings) {
        let API = KIRI.api,
            defaults = CONF.defaults,
            template = CONF.template,
            mode = settings.mode.toLowerCase(),
            default_dev = defaults[mode].d,
            default_pro = defaults[mode].p;

        // v1 to v2 changed FDM extruder / nozzle / filament structure
        if (settings.ver != CVER) {
            // backup settings before upgrade
            API.sdb.setItem(`ws-settings-${Date.now()}`, JSON.stringify(settings));
            device_v1_to_v2(settings.device);
            device_v1_to_v2(settings.cdev.FDM);
            objectMap(settings.devices, dev => {
                return dev ? device_from_code(dev) : dev;
            });
            settings.ver = CVER;
        }

        fill_cull_once(settings, template);
        fill_cull_once(settings.device, default_dev);
        fill_cull_once(settings.process, default_pro);
        fill_cull_once(settings.cdev, template.cdev);
        fill_cull_once(settings.cproc, template.cproc);
        fill_cull_once(settings.sproc, template.sproc);
        fill_cull_once(settings.defaults, template.defaults);
        fill_cull_once(settings.cdev.FDM, defaults.fdm.d);
        fill_cull_once(settings.cdev.SLA, defaults.sla.d);
        fill_cull_once(settings.cdev.CAM, defaults.cam.d);
        fill_cull_once(settings.cdev.LASER, defaults.laser.d);
        fill_cull_many(settings.sproc.FDM, defaults.fdm.p);
        fill_cull_many(settings.sproc.SLA, defaults.sla.p);
        fill_cull_many(settings.sproc.CAM, defaults.cam.p);
        fill_cull_many(settings.sproc.LASER, defaults.laser.p);
        fill_cull_once(settings.controller, template.controller);

        return settings;
    }

    let CONF = KIRI.conf = {
        // --------------- helper functions
        normalize: normalize,
        device_from_code: device_from_code,
        // ---------------
        MODES: {
            FDM: 1,   // fused deposition modeling (also FFF)
            LASER: 2, // laser cutters
            CAM: 3,   // 3 axis milling/machining
            SLA: 4    // cured resin printers
        },
        VIEWS: {
            ARRANGE: 1,
            SLICE: 2,
            PREVIEW: 3
        },
        // --------------- device and process defaults
        defaults: {
            fdm:{
                // device defaults FDM:Device
                d:{
                    new: true,
                    mode: "",
                    internal: 0,
                    bedWidth: 300,
                    bedDepth: 175,
                    bedHeight: 2.5,
                    bedRound: false,
                    originCenter: false,
                    maxHeight: 150,
                    gcodePre: [],
                    gcodePost: [],
                    gcodePause: [],
                    gcodeProc: "",
                    gcodeFan: "",
                    gcodeTrack: "",
                    gcodeLayer: [],
                    gcodeFExt: "",
                    extruders:[{
                        extFilament: 1.75,
                        extNozzle: 0.4,
                        extSelect: ["T0"],
                        extOffsetX: 0,
                        extOffsetY: 0
                    }]
                },
                // process defaults FDM:Process
                p:{
                    processName: "default",
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
                    firstLayerFillRate: 35,
                    firstLayerPrintMult: 1.0,
                    firstLayerNozzleTemp: 200,
                    firstLayerBedTemp: 60,
                    outputRaft: false,
                    outputRaftSpacing: 0.2,
                    outputTemp: 200,
                    outputFanMax: 255,
                    outputBedTemp: 60,
                    outputFeedrate: 50,
                    outputFinishrate: 50,
                    outputSeekrate: 80,
                    outputShellMult: 1.25,
                    outputFillMult: 1.25,
                    outputSparseMult: 1.25,
                    outputFanLayer: 1,
                    outputRetractDist: 1.5,
                    outputRetractSpeed: 40,
                    outputRetractDwell: 20,
                    outputBrimCount: 2,
                    outputBrimOffset: 2,
                    outputShortPoly: 100.0,
                    outputMinSpeed: 10.0,
                    outputCoastDist: 0,
                    outputWipeDistance: 0,
                    outputLayerRetract: false,
                    outputOriginCenter: true,
                    outputInvertX: false,
                    outputInvertY: false,
                    detectThinWalls: false,
                    sliceMinHeight: 0,
                    zHopDistance: 0.2,
                    antiBacklash: 1,
                    gcodePause: "",
                    sliceRotation: 0
                }
            },
            sla:{
                // device defaults SLA:Device
                d:{
                    new: true,
                    deviceName: "",
                    noclone: false,
                    mode: "",
                    internal: 0,
                    bedWidth: 150,
                    bedDepth: 150,
                    bedHeight: 1.5,
                    maxHeight: 150
                },
                // process defaults SLA:Process
                p:{
                    processName: "default",
                    slaSlice: 0.05,
                    slaShell: 0.00,
                    slaOpenTop: false,
                    slaOpenBase: false,
                    slaAntiAlias: 1,
                    slaLayerOff: 0.1,
                    slaLayerOn: 7,
                    slaPeelDist: 6,
                    slaPeelLiftRate: 1.5,
                    slaPeelDropRate: 3,
                    slaBaseLayers: 5,
                    slaBaseOff: 0.1,
                    slaBaseOn: 30,
                    slaBasePeelDist: 6,
                    slaBasePeelLiftRate: 1.5,
                    slaFillDensity: 0,
                    slaFillLine: 0.5,
                    slaFirstOffset: 0,
                    slaSupportLayers: 10,
                    slaSupportDensity: 0.5,
                    slaSupportSize: 0.6,
                    slaSupportPoints: 4,
                    slaSupportGap: 10,
                    slaSupportEnable: false
                }
            },
            cam:{
                // device defaults CAM:Device
                d:{
                    new: true,
                    mode: "",
                    internal: 0,
                    bedWidth: 300,
                    bedDepth: 175,
                    bedHeight: 2.5,
                    originCenter: false,
                    spindleMax: 0,
                    gcodePre: [],
                    gcodePost: [],
                    gcodeFExt: "",
                    gcodeSpace: true,
                    gcodeStrip: true,
                    gcodeDwell: ["G4 P{time}"],
                    gcodeChange: ["M6 T{tool}"],
                    gcodeSpindle: ["M3 S{speed}"]
                },
                // process defaults CAM:Process
                p:{
                    processName: "default",
                    camFastFeed: 6000,
                    camFastFeedZ: 300,
                    roughingTool: 1000,
                    roughingSpindle: 1000,
                    roughingDown: 2,
                    roughingOver: 0.5,
                    roughingSpeed: 1000,
                    roughingPlunge: 250,
                    roughingStock: 0,
                    roughingPocket: true,
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
                    camTabsAngle: 0,
                    camTabsCount: 4,
                    camTabsWidth: 5,
                    camTabsHeight: 5,
                    camTabsOn: false,
                    camPocketOnlyRough: false,
                    camPocketOnlyFinish: false,
                    camDepthFirst: true,
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
                    outputOriginCenter: true,
                    outputInvertX: false,
                    outputInvertY: false
                }
            },
            laser: {
                // device defaults Laser:Device
                d:{
                    new: true,
                    mode: "",
                    internal: 0,
                    bedWidth: 300,
                    bedDepth: 175,
                    bedHeight: 2.5,
                    gcodePre: [],
                    gcodePost: [],
                    gcodeFExt: "",
                    gcodeSpace: true,
                    gcodeLaserOn: ["M106 S{power}"],
                    gcodeLaserOff: ["M107"]
                },
                // process defaults Laser:Process
                p:{
                    processName: "default",
                    laserOffset: 0.25,
                    laserSliceHeight: 1,
                    laserSliceSingle: false,
                    outputTileSpacing: 1,
                    outputTileScaling: 1,
                    outputLaserPower: 100,
                    outputLaserSpeed: 1000,
                    outputLaserGroup: true,
                    outputLaserMerged: false,
                    outputOriginCenter: true,
                    outputInvertX: false,
                    outputInvertY: false
                }
            }
        },
        // --------------- settings template
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
            // currently selected device
            device:{},
            // currently selected process
            process:{},
            // current process name by mode
            cproc:{
                FDM: "default",
                SLA: "default",
                CAM: "default",
                LASER: "default"
            },
            // stored processes by mode
            sproc:{
                FDM: {},
                SLA: {},
                CAM: {},
                LASER: {}
            },
            // current device name by mode
            filter:{
                FDM: "Any.Generic.Marlin",
                SLA: "Anycubic.Photon",
                CAM: "Any.Generic.Grbl",
                LASER: "Any.Generic.Laser"
            },
            // stored device by mode
            cdev: {
                FDM: null,
                SLA: null,
                CAM: null,
                LASER: null
            },
            // custom devices by name (all modes)
            devices:{},
            // favorited devices (all modes)
            favorites:{},
            // map of device to last process setting (name)
            devproc: {},
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
            controller:{
                view: null,
                dark: false,
                expert: false,
                zoomSpeed: 1.0,
                thinRender: false,
                reverseZoom: true,
                showOrigin: false,
                freeLayout: true,
                autoLayout: true,
                alignTop: true,
                units: "mm",
                exportOcto: true,
                exportGhost: false,
                exportLocal: false
            },
            // for passing temporary slice hints (topo currently)
            synth: {},
            // widget extra info for slicing (extruder mapping)
            widget: {},
            mode: 'FDM',
            id: genID(),
            ver: CVER
        }
    };

    let settings = CONF.template;

    // seed defaults. will get culled on save
    settings.sproc.FDM.default = clone(settings.process);
    settings.sproc.SLA.default = clone(settings.process);
    settings.sproc.CAM.default = clone(settings.process);
    settings.sproc.LASER.default = clone(settings.process);
    settings.cdev.FDM = clone(settings.device);
    settings.cdev.SLA = clone(settings.device);
    settings.cdev.CAM = clone(settings.device);
    settings.cdev.LASER = clone(settings.device);

})();
