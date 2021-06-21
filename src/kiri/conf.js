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
    function fill_cull_once(obj, def, debug) {
        if (!obj) return;
        // handle renaming
        for (let k in obj) {
            if (obj.hasOwnProperty(k)) {
                let nam = renamed[k] || k;
                if (nam !== k) {
                    // handle field renames
                    obj[nam] = obj[k];
                    if (debug) console.log({rename: k, to: nam});
                    delete obj[k];
                }
            }
        }
        // fill missing
        for (let k in def) {
            if (def.hasOwnProperty(k)) {
                let okv = obj[k];
                if ((okv === undefined || okv === null)) {
                    // handle fill
                    if (debug) console.log({fill: k, val: def[k]});
                    if (typeof def[k] === 'object') {
                        obj[k] = clone(def[k]);
                    } else {
                        obj[k] = def[k];
                    }
                }
            }
        }
        // remove invalid
        for (let k in obj) {
            if (!def.hasOwnProperty(k)) {
                if (debug) console.log({cull: k});
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
        if (typeof(val) === 'string' && Array.isArray(dv)) {
            val = [val];
        }
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
                extDeselect: [],
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
            imageURL: valueOf(set.image_url, ""),
            imageScale: valueOf(set.image_scale, 0.75),
            imageAnchor: valueOf(set.image_anchor, 0),
            bedHeight: valueOf(set.bed_height, 2.5),
            bedWidth: valueOf(set.bed_width, 300),
            bedDepth: valueOf(set.bed_depth, 175),
            bedRound: valueOf(set.bed_circle, false),
            bedBelt: valueOf(set.bed_belt, false),
            maxHeight: valueOf(set.build_height, 150),
            originCenter: valueOf(set.origin_center, false),
            extrudeAbs: valueOf(set.extrude_abs, false),
            spindleMax: valueOf(set.spindle_max, 0),
            gcodeFan: valueOf(cmd.fan_power || code.fan_power, []),
            gcodeTrack: valueOf(cmd.progress || code.progress, []),
            gcodeLayer: valueOf(cmd.layer || code.layer, []),
            gcodePre: valueOf(code.pre, []),
            gcodePost: valueOf(code.post, []),
            gcodeExt: valueOf(code.ext, []),
            gcodeInt: valueOf(code.int, []),
            // post processor script of which only one exists
            // for XYZ.daVinci.Mini.w triggered in kiri.export
            // in the fdm driver to turn gcode into base64
            gcodeProc: valueOf(code.proc, ''),
            gcodePause: valueOf(code.pause, []),
            gcodeDwell: valueOf(code.dwell, []),
            gcodeSpindle: valueOf(code.spindle || cmd.spindle, []),
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
                if (rec.deselect) e.extDeselect = rec.deselect;
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

        // fixup old/new detail settings
        let detail = settings.controller.detail;
        settings.controller.detail = {
            "best": "100",
            "good": "75",
            "fair": "50",
            "poor": "25"
        }[detail] || detail;

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

    // auto field renaming on import
    const renamed = {
        roughingTool: "camRoughTool",
        roughingSpindle: "camRoughSpindle",
        roughingDown: "camRoughDown",
        roughingOver: "camRoughOver",
        roughingSpeed: "camRoughSpeed",
        roughingPlunge: "camRoughPlunge",
        roughingStock: "camRoughStock",
        roughingPocket: "camRoughVoid",
        roughingOn: "camRoughOn",
        finishingTool: "camOutlineTool",
        finishingSpindle: "camOutlineSpindle",
        finishingDown: "camOutlineDown",
        finishingOver: "camContourOver",
        finishingSpeed: "camOutlineSpeed",
        finishingPlunge: "camOutlinePlunge",
        finishingOn: "camOutlineOn",
        finishingXOn: "camContourXOn",
        finishingYOn: "camContourYOn",
        drillTool: "camDrillTool",
        drillSpindle: "camDrillSpindle",
        drillDownSpeed: "camDrillDownSpeed",
        drillDown: "camDrillDown",
        drillDwell: "camDrillDwell",
        drillLift: "camDrillLift",
        drillingOn: "camDrillingOn",
        camPocketOnlyFinish: "camOutlinePocket",
        camWideCutout: "camOutlineWide",
        outputClockwise: "camConventional"
    };

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
                    deviceName: "",
                    imageURL: "",
                    internal: 0,
                    bedWidth: 300,
                    bedDepth: 175,
                    bedHeight: 2.5,
                    bedRound: false,
                    bedBelt: false,
                    fwRetract: false,
                    originCenter: false,
                    maxHeight: 150,
                    gcodePre: [],
                    gcodePost: [],
                    gcodeExt: [],
                    gcodeInt: [],
                    gcodePause: [],
                    gcodeProc: "",
                    gcodeFan: [],
                    gcodeTrack: [],
                    gcodeLayer: [],
                    gcodeFExt: "",
                    extruders:[{
                        extFilament: 1.75,
                        extNozzle: 0.4,
                        extSelect: ["T0"],
                        extDeselect: [],
                        extOffsetX: 0,
                        extOffsetY: 0
                    }]
                },
                // process defaults FDM:Process
                p:{
                    processName: "default",
                    sliceHeight: 0.25,
                    sliceShells: 3,
                    sliceShellOrder: "in-out",
                    sliceLayerStart: "last",
                    sliceLineWidth: 0,
                    sliceFillAngle: 45,
                    sliceFillWidth: 1,
                    sliceFillOverlap: 0.35,
                    sliceFillSparse: 0.25,
                    sliceFillRepeat: 1,
                    sliceFillRate: 0,
                    sliceFillType: "hex",
                    sliceSupportDensity: 0.25,
                    sliceSupportOffset: 1.0,
                    sliceSupportGap: 1,
                    sliceSupportSize: 5,
                    sliceSupportArea: 0.1,
                    sliceSupportExtra: 0,
                    sliceSupportAngle: 50,
                    sliceSupportNozzle: 0,
                    sliceSupportEnable: false,
                    sliceSolidMinArea: 1,
                    sliceSolidLayers: 3,
                    sliceBottomLayers: 3,
                    sliceTopLayers: 3,
                    firstSliceHeight: 0.25,
                    firstLayerRate: 30,
                    firstLayerFillRate: 35,
                    firstLayerPrintMult: 1.0,
                    firstLayerLineMult: 1.0,
                    firstLayerYOffset: 0,
                    firstLayerNozzleTemp: 0,
                    firstLayerBedTemp: 0,
                    firstLayerBrim: 0,
                    firstLayerBrimIn: 0,
                    firstLayerBrimTrig: 0,
                    firstLayerBrimComb: 0,
                    firstLayerBrimGap: 0,
                    firstLayerBeltLead: 3,
                    firstLayerBeltBump: 0,
                    firstLayerFanSpeed: 0,
                    outputRaft: false,
                    outputRaftSpacing: 0.2,
                    outputTemp: 200,
                    outputBedTemp: 60,
                    outputFeedrate: 50,
                    outputFinishrate: 50,
                    outputSeekrate: 80,
                    outputShellMult: 1.25,
                    outputFillMult: 1.25,
                    outputSparseMult: 1.25,
                    outputFanSpeed: 255,
                    outputRetractDist: 1.5,
                    outputRetractSpeed: 40,
                    outputRetractWipe: 0,
                    outputRetractDwell: 20,
                    outputBrimCount: 2,
                    outputBrimOffset: 2,
                    outputShortPoly: 100.0,
                    outputMinSpeed: 10.0,
                    outputCoastDist: 0,
                    outputPurgeTower: true,
                    outputBeltFirst: false,
                    outputLayerRetract: false,
                    outputOriginCenter: true,
                    outputLoops: 0,
                    outputPeelGuard: 0,
                    outputInvertX: false,
                    outputInvertY: false,
                    detectThinWalls: false,
                    sliceMinHeight: 0,
                    sliceAdaptive: false,
                    zHopDistance: 0.2,
                    arcTolerance: 0,
                    antiBacklash: 1,
                    gcodePauseLayers: "",
                    ranges: []
                }
            },
            sla:{
                // device defaults SLA:Device
                d:{
                    new: true,
                    mode: "",
                    deviceName: "",
                    imageURL: "",
                    noclone: false,
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
                    deviceName: "",
                    imageURL: "",
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
                    camLevelTool: 1000,
                    camLevelSpindle: 1000,
                    camLevelOver: 0.75,
                    camLevelSpeed: 1000,
                    camLevelDown: 0,
                    camRoughTool: 1000,
                    camRoughSpindle: 1000,
                    camRoughDown: 2,
                    camRoughOver: 0.4,
                    camRoughSpeed: 1000,
                    camRoughPlunge: 250,
                    camRoughStock: 0,
                    camRoughVoid: false,
                    camRoughFlat: true,
                    camRoughTop: false,
                    camRoughIn: true,
                    camRoughOn: true,
                    camOutlineTool: 1000,
                    camOutlineSpindle: 1000,
                    camOutlineDown: 3,
                    camOutlineOver: 0.4,
                    camOutlineSpeed: 800,
                    camOutlinePlunge: 250,
                    camOutlineWide: false,
                    camOutlineDogbone: false,
                    camOutlineOmitThru: false,
                    camOutlineOut: true,
                    camOutlineIn: false,
                    camOutlineOn: true,
                    camContourTool: 1000,
                    camContourSpindle: 1000,
                    camContourOver: 0.5,
                    camContourSpeed: 1000,
                    camContourAngle: 85,
                    camContourCurves: false,
                    camContourIn: false,
                    camContourXOn: true,
                    camContourYOn: true,
                    camTraceTool: 1000,
                    camTraceSpindle: 1000,
                    camTraceType: "follow",
                    camTraceOver: 0.5,
                    camTraceDown: 0,
                    camTraceSpeed: 250,
                    camTracePlunge: 200,
                    camTraceLines: false,
                    camDrillTool: 1000,
                    camDrillSpindle: 1000,
                    camDrillDownSpeed: 250,
                    camDrillDown: 5,
                    camDrillDwell: 250,
                    camDrillLift: 2,
                    camDrillingOn: false,
                    camRegisterSpeed: 1000,
                    camFlipAxis: "X",
                    camFlipOther: "",
                    // camDrillReg: "none",
                    camTabsWidth: 5,
                    camTabsHeight: 5,
                    camTabsDepth: 5,
                    camTabsMidline: false,
                    camDepthFirst: false,
                    camEaseDown: false,
                    camOriginTop: true,
                    camZAnchor: "top",
                    camZOffset: 0,
                    camZBottom: 0,
                    camZClearance: 1,
                    camZThru: 0,
                    camFastFeed: 6000,
                    camFastFeedZ: 300,
                    camTolerance: 0,
                    camStockX: 5,
                    camStockY: 5,
                    camStockZ: 0,
                    camStockOffset: true,
                    camStockClipTo: false,
                    camStockOn: true,
                    camConventional: false, // outputClockwise
                    outputOriginCenter: false,
                    outputInvertX: false,
                    outputInvertY: false,
                    camExpertFast: false,
                    camTrueShadow: false,
                    ops: [], // current ops
                    op2: []  // flip ops
                }
            },
            laser: {
                // device defaults Laser:Device
                d:{
                    new: true,
                    mode: "",
                    deviceName: "",
                    imageURL: "",
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
                    laserSliceHeightMin: 0,
                    laserSliceSingle: false,
                    outputTileSpacing: 1,
                    outputLaserPower: 100,
                    outputLaserSpeed: 1000,
                    outputLaserGroup: true,
                    outputLaserZColor: false,
                    outputLaserLayer: false,
                    outputLaserMerged: false,
                    outputOriginCenter: true,
                    outputInvertX: false,
                    outputInvertY: false,
                    outputKnifeDepth: 1,
                    outputKnifePasses: 1,
                    outputKnifeTip: 2,
                    knifeOn: false
                }
            }
        },
        // --------------- settings template
        template: {
            bounds: {},
            // CAM only
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
            controller:{
                view: null,
                dark: false,
                decals: true,
                danger: false,
                zoomSpeed: 1.0,
                lineType: "path",
                autoSave: true,
                reverseZoom: true,
                showOrigin: true,
                showRulers: true,
                showSpeeds: true,
                freeLayout: true,
                autoLayout: true,
                spaceLayout: 1,
                units: "mm",
                exportOcto: false,
                exportGhost: false,
                exportLocal: false,
                exportPreview: false,
                decimate: true,
                detail: "75",
                animesh: "200",
                healMesh: false,
                threaded: false,
                ortho: false,
                devel: false
            },
            // label state preferences
            labels: {
                'FDM-3-engage': false,
                'FDM-3-retract': false,
                'FDM-3-arrows': false,
                'FDM-3-move': false
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
