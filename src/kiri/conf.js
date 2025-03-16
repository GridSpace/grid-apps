/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: data.local
gapp.register("kiri.conf", (root, exports) => {

const { data } = root;
const { local } = data;
const { clone } = Object;
const CVER = 410;

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

// convert default filter (from server) into device structure
function device_from_code(code,mode) {
    // presence of internal field indicates already converted
    if (code.internal >= 0) return code;

    // if (self.navigator) console.log({mode, convert: code});
    let cmd = code.cmd || {},
        set = code.settings || {},
        ext = code.extruders;

    // currently causes unecessary fills and culls because
    // it's not mode and device type sensitive
    let device = {
        noclone: valueOf(code.no_clone, false),
        mode: mode || code.mode || '',
        internal: 0,
        imageScale: valueOf(set.image_scale, 0.75),
        imageAnchor: valueOf(set.image_anchor, 0),
        bedHeight: valueOf(set.bed_height, 2.5),
        bedWidth: valueOf(set.bed_width, 300),
        bedDepth: valueOf(set.bed_depth, 175),
        bedRound: valueOf(set.bed_circle, false),
        bedBelt: valueOf(set.bed_belt, false),
        resolutionX: valueOf(set.resolution_x, 1600),
        resolutionY: valueOf(set.resolution_y, 900),
        deviceZMax: valueOf(set.z_move_max, 0),
        gcodeTime: valueOf(set.time_factor, 1),
        maxHeight: valueOf(set.build_height, 150),
        originCenter: valueOf(set.origin_center, false),
        extrudeAbs: valueOf(set.extrude_abs, false),
        spindleMax: valueOf(set.spindle_max, 0),
        gcodeFan: valueOf(cmd.fan_power || code.fan_power, []),
        gcodeFeature: valueOf(cmd.feature || code.feature, []),
        gcodeTrack: valueOf(cmd.progress || code.progress, []),
        gcodeLayer: valueOf(cmd.layer || code.layer, []),
        gcodePre: valueOf(code.pre, []),
        gcodePost: valueOf(code.post, []),
        // post processor script of which only one exists
        // for XYZ.daVinci.Mini.w triggered in kiri.export
        // in the fdm driver to turn gcode into base64
        gcodeProc: valueOf(code.proc, ''),
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
            let e = clone(conf.defaults.fdm.d.extruders[0]);
            if (rec.nozzle) e.extNozzle = rec.nozzle;
            if (rec.filament) e.extFilament = rec.filament;
            if (rec.offset_x) e.extOffsetX = rec.offset_x;
            if (rec.offset_y) e.extOffsetY = rec.offset_y;
            device.extruders.push(e);
        });
    } else {
        // synthesize extruders from old style settings
        device.extruders = [ clone(conf.defaults.fdm.d.extruders[0]) ];
        device.extruders[0].extNozzle = valueOf(set.nozzle_size, 0.4);
        device.extruders[0].extFilament = valueOf(set.filament_diameter, 1.75);
    }

    return device;
}

// ensure settings structure is up-to-date
function normalize(settings) {
    let defaults = conf.defaults,
        template = conf.template,
        mode = settings.mode.toLowerCase(),
        default_dev = defaults[mode].d,
        default_pro = defaults[mode].p;

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

const conf = exports({
    // --------------- helper functions
    normalize,
    device_from_code,
    fill_cull_once,
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
                filamentSource: "direct",
                originCenter: false,
                deviceZMax: 0,
                maxHeight: 150,
                gcodeTime: 1,
                gcodeChange: ["T{tool}"],
                gcodePre: [],
                gcodePost: [],
                gcodeProc: "",
                gcodeFan: [],
                gcodeFeature: [],
                gcodeTrack: [],
                gcodeLayer: [],
                gcodeFExt: "",
                extruders:[{
                    extFilament: 1.75,
                    extNozzle: 0.4,
                    extOffsetX: 0,
                    extOffsetY: 0
                }],
                profiles: [],
                // other stored config info
                extras: {}
            },
            // process defaults FDM:Process
            p:{
                processName: "default",
                sliceAngle: 45,
                sliceHeight: 0.25,
                sliceShells: 3,
                sliceShellOrder: "in-out",
                sliceLayerStart: "last",
                sliceLayerStartX: 0,
                sliceLayerStartY: 0,
                sliceLineWidth: 0,
                sliceFillGrow: 0,
                sliceFillAngle: 45,
                sliceFillWidth: 1,
                sliceFillOverlap: 0.35,
                sliceFillSparse: 0.25,
                sliceFillRepeat: 1,
                sliceFillRate: 0,
                sliceSolidRate: 0,
                sliceFillType: "hex",
                sliceSupportDensity: 0.1,
                sliceSupportOffset: 1.0,
                sliceSupportGap: 1,
                sliceSupportSize: 5,
                sliceSupportArea: 0.1,
                sliceSupportSpan: 5,
                sliceSupportGrow: 0,
                sliceSupportExtra: 0,
                sliceSupportAngle: 50,
                sliceSupportNozzle: 0,
                sliceSupportEnable: false,
                sliceSupportOutline: true,
                sliceZInterleave: false,
                sliceSolidMinArea: 1,
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
                firstLayerBrimGap: 0,
                firstLayerBeltLead: 3,
                firstLayerBeltBump: 0,
                firstLayerFanSpeed: 0,
                firstLayerFlatten: 0,
                outputRaft: false,
                outputRaftSpacing: 0.2,
                outputDraftShield: false,
                outputTemp: 200,
                outputBedTemp: 60,
                outputFeedrate: 50,
                outputFinishrate: 50,
                outputSeekrate: 80,
                outputShellMult: 1.25,
                outputFillMult: 1.25,
                outputSparseMult: 1.25,
                outputFanLayer: 1,
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
                outputPurgeTower: 0,
                outputBeltFirst: false,
                outputAvoidGaps: true,
                outputAlternating: false,
                outputLayerRetract: false,
                outputLoops: 0,
                outputInvertX: false,
                outputInvertY: false,
                sliceDetectThin: "off",
                sliceMinHeight: 0,
                sliceAdaptive: false,
                zHopDistance: 0.2,
                arcTolerance: 0,
                antiBacklash: 0,
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
                maxHeight: 150,
                resolutionX: 1600,
                resolutionY: 900
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
                maxHeight: 300,
                useLaser: false,
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
                camLevelOver: 0.5,
                camLevelStock: true,
                camRoughTool: 1000,
                camRoughSpindle: 1000,
                camRoughDown: 2,
                camRoughOver: 0.4,
                camRoughSpeed: 1000,
                camRoughPlunge: 250,
                camRoughStock: 0,
                camRoughStockZ: 0,
                camRoughAll: true,
                camRoughVoid: false,
                camRoughFlat: true,
                camRoughTop: true,
                camRoughIn: true,
                camRoughOn: true,
                camRoughOmitVoid: false,
                camOutlineTool: 1000,
                camOutlineSpindle: 1000,
                camOutlineTop: true,
                camOutlineDown: 3,
                camOutlineOver: 0.4,
                camOutlineOverCount: 1,
                camOutlineSpeed: 800,
                camOutlinePlunge: 250,
                camOutlineWide: false,
                camOutlineDogbone: false,
                camOutlineOmitThru: false,
                camOutlineOmitVoid: false,
                camOutlineOut: true,
                camOutlineIn: false,
                camOutlineOn: true,
                camContourTool: 1000,
                camContourSpindle: 1000,
                camContourOver: 0.5,
                camContourSpeed: 1000,
                camContourAngle: 85,
                camContourLeave: 0,
                camContourReduce: 2,
                camContourBottom: false,
                camContourCurves: false,
                camContourIn: false,
                camContourXOn: true,
                camContourYOn: true,
                camLatheTool: 1000,
                camLatheSpindle: 1000,
                camLatheOver: 0.1,
                camLatheAngle: 1,
                camLatheSpeed: 500,
                camLatheLinear: true,
                camTolerance: 0,
                camTraceTool: 1000,
                camTraceSpindle: 1000,
                camTraceType: "follow",
                camTraceOver: 0.5,
                camTraceDown: 0,
                camTraceThru: 0,
                camTraceSpeed: 250,
                camTracePlunge: 200,
                camTraceOffOver: 0,
                camTraceDogbone: false,
                camTraceMerge: true,
                camTraceLines: false,
                camTraceZTop: 0,
                camTraceZBottom: 0,
                camPocketSpindle: 1000,
                camPocketTool: 1000,
                camPocketOver: 0.25,
                camPocketDown: 1,
                camPocketSpeed: 250,
                camPocketPlunge: 200,
                camPocketExpand: 0,
                camPocketSmooth: 0,
                camPocketRefine: 20,
                camPocketFollow: 5,
                camPocketContour: false,
                camPocketEngrave: false,
                camPocketOutline: false,
                camPocketZTop: 0,
                camPocketZBottom: 0,
                camDrillTool: 1000,
                camDrillSpindle: 1000,
                camDrillDownSpeed: 250,
                camDrillDown: 5,
                camDrillDwell: 250,
                camDrillLift: 2,
                camDrillMark: false,
                camDrillingOn: false,
                camRegisterSpeed: 1000,
                camRegisterThru: 5,
                camFlipAxis: "X",
                camFlipOther: "",
                camLaserEnable: ["M321"],
                camLaserDisable: ["M322"],
                camLaserOn: ["M3"],
                camLaserOff: ["M5"],
                camLaserSpeed: 100,
                camLaserPower: 1,
                camLaserAdaptive: false,
                camLaserAdaptMod: false,
                camLaserFlatten: false,
                camLaserFlatZ: 0,
                camLaserPowerMin: 0,
                camLaserPowerMax: 1,
                camLaserZMin: 0,
                camLaserZMax: 0,
                camTabsWidth: 5,
                camTabsHeight: 5,
                camTabsDepth: 5,
                camTabsMidline: false,
                camDepthFirst: false,
                camEaseDown: false,
                camEaseAngle: 10,
                camOriginTop: true,
                camZAnchor: "middle",
                camZOffset: 0,
                camZTop: 0,
                camZBottom: 0,
                camZClearance: 1,
                camZThru: 0,
                camFastFeed: 6000,
                camFastFeedZ: 300,
                camTolerance: 0,
                camFlatness: 0.001,
                camContourBridge: 0,
                camStockX: 5,
                camStockY: 5,
                camStockZ: 5,
                camStockOffset: true,
                camStockClipTo: false,
                camStockIndexed: false,
                camStockIndexGrid: true,
                camIndexAxis: 0,
                camIndexAbs: true,
                camConventional: false, // outputClockwise
                camOriginCenter: false,
                camOriginOffX: 0,
                camOriginOffY: 0,
                camOriginOffZ: 0,
                outputInvertX: false,
                outputInvertY: false,
                camExpertFast: false,
                camTrueShadow: false,
                camForceZMax: false,
                camFirstZMax: false,
                camToolInit: true,
                camFullEngage: 0.8,
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
                bedDepth: 200,
                bedHeight: 2.5,
                maxHeight: 100,
                laserMaxPower: 255,
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
                ctSliceKerf: 0.1,
                ctSliceHeight: 1,
                ctSliceHeightMin: 0,
                ctSliceSingle: true,
                ctOutTileSpacing: 1,
                ctOutPower: 100,
                ctOutSpeed: 1000,
                ctOutGroup: true,
                ctOutZColor: false,
                ctOutLayer: false,
                ctOutMark: false,
                ctOutStack: false,
                ctOutMerged: false,
                ctOriginCenter: true,
                ctOriginBounds: false,
                outputInvertX: false,
                outputInvertY: false,
                ctOutKnifeDepth: 1,
                ctOutKnifePasses: 1,
                ctOutKnifeTip: 2,
                ctOutInches: false,
                ctOutShaper: false
            }
        },
        drag: {
            // device defaults Drag:Device
            d:{
                new: true,
                mode: "",
                deviceName: "",
                imageURL: "",
                internal: 0,
                bedWidth: 300,
                bedDepth: 200,
                bedHeight: 2.5,
                maxHeight: 100,
                gcodePre: [],
                gcodePost: [],
                gcodeFExt: "",
                gcodeSpace: true,
                gcodeKnifeDn: [";; Z down"],
                gcodeKnifeUp: [";; Z up"]
            },
            // process defaults Drag:Process
            p:{
                processName: "default",
                ctSliceKerf: 0.1,
                ctSliceHeight: 1,
                ctSliceHeightMin: 0,
                ctSliceSingle: true,
                ctOutTileSpacing: 1,
                ctOutPower: 100,
                ctOutSpeed: 1000,
                ctOutGroup: true,
                ctOutZColor: false,
                ctOutLayer: false,
                ctOutMark: false,
                ctOutMerged: false,
                ctOriginCenter: true,
                ctOriginBounds: false,
                outputInvertX: false,
                outputInvertY: false,
                ctOutKnifeDepth: 1,
                ctOutKnifePasses: 1,
                ctOutKnifeTip: 2,
                ctOutStack: true,
            },
        },
        wjet: {
            // device defaults WaterJet:Device
            d:{
                new: true,
                mode: "",
                deviceName: "",
                imageURL: "",
                internal: 0,
                bedWidth: 300,
                bedDepth: 200,
                bedHeight: 2.5,
                maxHeight: 100,
                gcodePre: [],
                gcodePost: [],
                gcodeFExt: "",
                gcodeSpace: true,
                gcodeWaterOn: ["M106 S{power}"],
                gcodeWaterOff: ["M107"]
            },
            // process defaults WaterJet:Process
            p:{
                processName: "default",
                ctSliceKerf: 0.1,
                ctSliceHeight: 1,
                ctSliceHeightMin: 0,
                ctSliceSingle: true,
                ctOutTileSpacing: 1,
                ctOutPower: 100,
                ctOutSpeed: 1000,
                ctOutGroup: true,
                ctOutZColor: false,
                ctOutLayer: false,
                ctOutMark: false,
                ctOutMerged: false,
                ctOriginCenter: true,
                ctOriginBounds: false,
                outputInvertX: false,
                outputInvertY: false,
                ctOutKnifeDepth: 1,
                ctOutKnifePasses: 1,
                ctOutKnifeTip: 2,
                ctOutStack: false,
            },
        },
        wedm: {
            // device defaults WireEDM:Device
            d:{
                new: true,
                mode: "",
                deviceName: "",
                imageURL: "",
                internal: 0,
                bedWidth: 300,
                bedDepth: 200,
                bedHeight: 2.5,
                maxHeight: 100,
                gcodePre: [],
                gcodePost: [],
                gcodeFExt: "",
                gcodeSpace: true
            },
            // process defaults WireEDM:Process
            p:{
                processName: "default",
                ctSliceKerf: 0.1,
                ctSliceHeight: 1,
                ctSliceHeightMin: 0,
                ctSliceSingle: true,
                ctOmitInner: false,
                ctOutTileSpacing: 1,
                ctOutPower: 100,
                ctOutSpeed: 1000,
                ctOutGroup: true,
                ctOutZColor: false,
                ctOutLayer: false,
                ctOutMark: false,
                ctOutMerged: false,
                ctOriginCenter: false,
                ctOriginBounds: true,
                ctOriginOffX: 0,
                ctOriginOffY: 0,
                outputInvertX: false,
                outputInvertY: false,
                ctOutStack: false,
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
                taper_tip: 0,
            },
            {
                id: 1003,
                number: 4,
                type: "tapermill",
                name: "vee 1/8",
                metric: true,
                shaft_diam: 0.125,
                shaft_len:  1,
                flute_diam: 0.125,
                flute_len:  1.5,
                taper_angle: 5.3,
                taper_tip: 0,
            },
            {
                id: 1004,
                number: 5,
                type: "ballmill",
                name: "ball 1/8",
                metric: false,
                shaft_diam: 0.125,
                shaft_len:  1,
                flute_diam: 0.125,
                flute_len:  1.5,
                taper_tip: 0,
            }
        ],
        // currently selected device (current mode)
        device:{},
        // currently selected process (current mode)
        process:{},
        // current process (name of last used) by mode
        cproc:{
            FDM: "default",
            SLA: "default",
            CAM: "default",
            DRAG: "default",
            WJET: "default",
            WEDM: "default",
            LASER: "default",
        },
        // stored process (copy of last used) by mode
        sproc:{
            FDM: {},
            SLA: {},
            CAM: {},
            DRAG: {},
            WJET: {},
            WEDM: {},
            LASER: {},
        },
        // current device (name of last used) by mode
        filter:{
            FDM: "Any.Generic.Marlin",
            SLA: "Anycubic.Photon",
            CAM: "Any.Generic.Grbl",
            DRAG: "Any.Generic.DragKnife",
            WJET: "HydroBLADE",
            WEDM: "RackRobo.Betta.Wire.V1",
            LASER: "Any.Generic.Laser",
        },
        // current (last used) device by mode
        cdev: {
            FDM: null,
            SLA: null,
            CAM: null,
            LASER: null,
            DRAG: null,
        },
        // custom devices by name (all modes)
        devices:{},
        // map of device name to last process setting name
        devproc: {},
        // application ui and control preferences (Q menu)
        controller:{
            view: null,
            dark: false,
            shiny: false,
            drawer: false,
            scrolls: true,
            zoomSpeed: 1.0,
            lineType: "path",
            autoSave: true,
            antiAlias: true,
            reverseZoom: true,
            showOrigin: false,
            showRulers: true,
            showSpeeds: true,
            freeLayout: true,
            autoLayout: true,
            spaceRandoX: false,
            spaceLayout: 1,
            edgeangle: 20,
            units: "mm",
            exportOcto: false,
            exportGhost: false,
            exportLocal: false,
            exportThumb: false,
            exportPreview: false,
            detail: "50",
            animesh: "800",
            healMesh: false,
            threaded: true,
            assembly: false,
            ortho: false,
            devel: false
        },
        // default hidden ui groups
        hidden: {
            "fdm-base": true,
            "fdm-cool": true,
            "fdm-fill": true,
            "fdm-supp": true,
            "fdm-xprt": true
        },
        // label state preferences (slice/preview toggles)
        labels: {
            'CAM-3-arrows': false,
            'FDM-3-engage': false,
            'FDM-3-retract': false,
            'FDM-3-arrows': false,
            'FDM-3-move': false
        },
        // for passing temporary slice hints (topo currently)
        synth: {},
        // widget extra info for slicing (extruder mapping)
        widget: {},
        // legacy localStorage settings (like octo print)
        local: {
            'model.edges': false,
            'cam.anim.trans': true,
            'cam.anim.model': false,
            'cam.anim.stock': false,
            'cam.anim.speed': 3
        },
        mode: 'FDM',
        id: genID(),
        ver: CVER
    }
});

const settings = conf.template;

// seed defaults. will get culled on save
settings.sproc.FDM.default = clone(settings.process);
settings.sproc.SLA.default = clone(settings.process);
settings.sproc.CAM.default = clone(settings.process);
settings.sproc.LASER.default = clone(settings.process);
settings.sproc.DRAG.default = clone(settings.process);
settings.sproc.WJET.default = clone(settings.process);
settings.sproc.WEDM.default = clone(settings.process);
settings.cdev.FDM = clone(settings.device);
settings.cdev.SLA = clone(settings.device);
settings.cdev.CAM = clone(settings.device);
settings.cdev.LASER = clone(settings.device);
settings.cdev.DRAG = clone(settings.device);
settings.cdev.WJET = clone(settings.device);
settings.cdev.WEDM = clone(settings.device);

});
