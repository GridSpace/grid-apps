/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

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
    camWideCutout: "camOutlineWide",
    drillDown: "camDrillDown",
    drillDownSpeed: "camDrillDownSpeed",
    drillDwell: "camDrillDwell",
    drillingOn: "camDrillingOn",
    drillLift: "camDrillLift",
    drillSpindle: "camDrillSpindle",
    drillTool: "camDrillTool",
    finishingDown: "camOutlineDown",
    finishingOn: "camOutlineOn",
    finishingOver: "camContourOver",
    finishingPlunge: "camOutlinePlunge",
    finishingSpeed: "camOutlineSpeed",
    finishingSpindle: "camOutlineSpindle",
    finishingTool: "camOutlineTool",
    finishingXOn: "camContourXOn",
    finishingYOn: "camContourYOn",
    outputClockwise: "camConventional",
    roughingDown: "camRoughDown",
    roughingOn: "camRoughOn",
    roughingOver: "camRoughOver",
    roughingPlunge: "camRoughPlunge",
    roughingPocket: "camRoughVoid",
    roughingSpeed: "camRoughSpeed",
    roughingSpindle: "camRoughSpindle",
    roughingStock: "camRoughStock",
    roughingTool: "camRoughTool",
};

export const conf = {
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
                antiBacklash: 0,
                arcTolerance: 0,
                firstLayerBedTemp: 0,
                firstLayerBeltBump: 0,
                firstLayerBeltLead: 3,
                firstLayerBeltFact: 1,
                firstLayerBrim: 0,
                firstLayerBrimGap: 0,
                firstLayerBrimIn: 0,
                firstLayerBrimTrig: 0,
                firstLayerFanSpeed: 0,
                firstLayerFillRate: 35,
                firstLayerFlatten: 0,
                firstLayerNozzleTemp: 0,
                firstLayerRate: 30,
                firstLayerYOffset: 0,
                firstSliceHeight: 0.25,
                outputAlternating: false,
                outputAvoidGaps: true,
                outputBedTemp: 60,
                outputBeltFirst: false,
                outputBrimCount: 2,
                outputBrimOffset: 2,
                outputCoastDist: 0,
                outputDraftShield: false,
                outputFanLayer: 1,
                outputFanSpeed: 255,
                outputFeedrate: 50,
                outputFillMult: 1.25,
                outputFinishrate: 50,
                outputInvertX: false,
                outputInvertY: false,
                outputLayerRetract: false,
                outputLoops: 0,
                outputMaxFlowrate: 15,
                outputMinLayerTime: 10,
                outputMinSpeed: 5.0,
                outputPurgeTower: 0,
                outputRaft: false,
                outputRaftSpacing: 0.2,
                outputRetractDist: 1.5,
                outputRetractDwell: 20,
                outputRetractSpeed: 40,
                outputRetractWipe: 0,
                outputScarfLength: 0,
                outputSeekrate: 80,
                outputShellMult: 1.25,
                outputShortPoly: 0.0,
                outputSparseMult: 1.25,
                outputTemp: 200,
                processName: "default",
                ranges: [],
                sliceAdaptive: false,
                sliceAngle: 45,
                sliceBottomLayers: 3,
                sliceCompInner: 0,
                sliceCompOuter: 0,
                sliceDetectThin: "basic",
                sliceFillAngle: 45,
                sliceFillGrow: 0,
                sliceFillOverlap: 0.35,
                sliceFillRepeat: 1,
                sliceFillSparse: 0.25,
                sliceFillType: "hex",
                sliceFillWidth: 1,
                sliceHeight: 0.25,
                sliceLayerStart: "last",
                sliceLayerStartX: 0,
                sliceLayerStartY: 0,
                sliceLineWidth: 0,
                sliceMinHeight: 0,
                sliceShellOrder: "in-out",
                sliceShells: 3,
                sliceSolidMinArea: 1,
                sliceSupportAngle: 50,
                sliceSupportArea: 0.1,
                sliceSupportDensity: 0.1,
                sliceSupportEnable: false,
                sliceSupportExtra: 0,
                sliceSupportGap: 1,
                sliceSupportGrow: 0,
                sliceSupportNozzle: 0,
                sliceSupportOffset: 1.0,
                sliceSupportOutline: true,
                sliceSupportSize: 5,
                sliceSupportSpan: 5,
                sliceTopLayers: 3,
                sliceZInterleave: false,
                zHopDistance: 0.2,
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
                camArcEnabled: false,
                camArcResolution: 5,
                camArcTolerance: 0.15,
                camAreaSpindle: 1000,
                camAreaTool: 1000,
                camAreaMode: "clear",
                camAreaOver: 0.4,
                camAreaDown: 1,
                camAreaSpeed: 1000,
                camAreaPlunge: 100,
                camAreaExpand: 0,
                camAreaSmooth: 1,
                camAreaRefine: 0,
                camContourAngle: 85,
                camContourBottom: false,
                camContourBridge: 0,
                camContourCurves: false,
                camContourIn: false,
                camContourLeave: 0,
                camContourOver: 0.5,
                camContourReduce: 2,
                camContourSpeed: 1000,
                camContourSpindle: 1000,
                camContourTool: 1000,
                camContourXOn: true,
                camContourYOn: true,
                camConventional: false, // outputClockwise
                camDepthFirst: false,
                camDrillDown: 5,
                camDrillDownSpeed: 250,
                camDrillDwell: 250,
                camDrillFromStockTop: false,
                camDrillingOn: false,
                camDrillLift: 2,
                camDrillMark: false,
                camDrillPrecision: 1,
                camDrillSpindle: 1000,
                camDrillThru: 5,
                camDrillTool: 1006,
                camEaseAngle: 10,
                camEaseDown: false,
                camExpertFast: false,
                camFastFeed: 6000,
                camFastFeedZ: 300,
                camFirstZMax: false,
                camFlatness: 0.001,
                camFlipAxis: "X",
                camFlipOther: "",
                camForceZMax: false,
                camFullEngage: 0.8,
                camHelicalBottomFinish: true,
                camHelicalClockwise: true,
                camHelicalDown: 5,
                camHelicalDownSpeed: 250,
                camHelicalEntry: false,
                camHelicalEntryOffset:0,
                camHelicalForceStartAngle: false,
                camHelicalOffset: "auto",
                camHelicalOffsetOverride: 0,
                camHelicalReverse: false,
                camHelicalSpeed: 1000,
                camHelicalSpindle: 1000,
                camHelicalStartAngle: 0,
                camHelicalThru: 0,
                camHelicalTool: 1000,
                camIndexAbs: true,
                camIndexAxis: 0,
                camInnerFirst: false,
                camLaserAdaptive: false,
                camLaserAdaptMod: false,
                camLaserDisable: ["M322"],
                camLaserEnable: ["M321"],
                camLaserFlatten: false,
                camLaserFlatZ: 0,
                camLaserOff: ["M5"],
                camLaserOn: ["M3"],
                camLaserPower: 1,
                camLaserPowerMax: 1,
                camLaserPowerMin: 0,
                camLaserSpeed: 100,
                camLaserZMax: 0,
                camLaserZMin: 0,
                camLatheAngle: 1,
                camLatheLinear: true,
                camLatheOver: 0.1,
                camLatheSpeed: 500,
                camLatheSpindle: 1000,
                camLatheTool: 1000,
                camLatheOffStart: 0,
                camLatheOffEnd: 0,
                camLevelDown: 0,
                camLevelInset: 0.5,
                camLevelOver: 0.75,
                camLevelSpeed: 1000,
                camLevelSpindle: 1000,
                camLevelStepZ: 0,
                camLevelStock: true,
                camLevelTool: 1000,
                camOriginCenter: false,
                camOriginOffX: 0,
                camOriginOffY: 0,
                camOriginOffZ: 0,
                camOriginTop: true,
                camOutlineDogbone: false,
                camOutlineDown: 3,
                camOutlineIn: false,
                camOutlineOmitThru: false,
                camOutlineOmitVoid: false,
                camOutlineOn: true,
                camOutlineOut: true,
                camOutlineOver: 0.4,
                camOutlineOverCount: 1,
                camOutlinePlunge: 250,
                camOutlineSpeed: 800,
                camOutlineSpindle: 1000,
                camOutlineTool: 1000,
                camOutlineTop: true,
                camOutlineWide: false,
                camPocketContour: false,
                camPocketDown: 1,
                camPocketEngrave: false,
                camPocketExpand: 0,
                camPocketFollow: 5,
                camPocketOutline: false,
                camPocketOver: 0.25,
                camPocketPlunge: 200,
                camPocketRefine: 20,
                camPocketSmooth: 1,
                camPocketSpeed: 250,
                camPocketSpindle: 1000,
                camPocketTool: 1000,
                camPocketZBottom: 0,
                camPocketZTop: 0,
                camRegisterOffset: 10,
                camRegisterSpeed: 1000,
                camRegisterThru: 5,
                camRoughAll: true,
                camRoughDown: 2,
                camRoughFlat: true,
                camRoughIn: true,
                camRoughOmitThru: false,
                camRoughOmitVoid: false,
                camRoughOn: true,
                camRoughOver: 0.4,
                camRoughPlunge: 250,
                camRoughSpeed: 1000,
                camRoughSpindle: 1000,
                camRoughStock: 0,
                camRoughStockZ: 0,
                camRoughTool: 1000,
                camRoughTop: true,
                camRoughVoid: false,
                camStockClipTo: false,
                camStockIndexed: false,
                camStockIndexGrid: true,
                camStockOffset: true,
                camStockX: 5,
                camStockY: 5,
                camStockZ: 5,
                camTabsDepth: 5,
                camTabsHeight: 5,
                camTabsMidline: false,
                camTabsWidth: 5,
                camTolerance: 0,
                camToolInit: true,
                camTraceDogbone: false,
                camTraceDown: 0,
                camTraceLines: false,
                camTraceMerge: false,
                camTraceOffOver: 0,
                camTraceOver: 0.5,
                camTracePlunge: 200,
                camTraceSpeed: 250,
                camTraceSpindle: 1000,
                camTraceThru: 0,
                camTraceTool: 1000,
                camTraceType: "follow",
                camTraceZBottom: 0,
                camTraceZTop: 0,
                camTrueShadow: false,
                camZAnchor: "middle",
                camZBottom: 0,
                camZClearance: 1,
                camZOffset: 0,
                camZThru: 0,
                camZTop: 0,
                op2: [], // flip ops
                ops: [], // current ops
                outputInvertX: false,
                outputInvertY: false,
                processName: "default",
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
            },
            {
                id: 1005,
                number: 6,
                type: "drill",
                name: "drill 1/8",
                metric: false,
                shaft_diam: 0.125,
                shaft_len:  1,
                flute_diam: 0.125,
                flute_len:  1.5,
                taper_tip: 0,
            },
            {
                id: 1006,
                number: 7,
                type: "drill",
                name: "drill 1/4",
                metric: false,
                shaft_diam: 0.25,
                shaft_len:  1,
                flute_diam: 0.25,
                flute_len:  2,
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
            animesh: "800",
            antiAlias: true,
            assembly: false,
            autoLayout: true,
            autoSave: true,
            dark: false,
            detail: "50",
            devel: false,
            drawer: false,
            edgeangle: 20,
            exportOcto: false,
            exportPreview: false,
            exportThumb: false,
            freeLayout: true,
            healMesh: false,
            lineType: "path",
            manifold: false,
            ortho: false,
            reverseZoom: true,
            scrolls: true,
            shiny: true,
            showOrigin: false,
            showRulers: true,
            showSpeeds: true,
            spaceLayout: 1,
            spaceRandoX: false,
            threaded: true,
            units: "mm",
            view: null,
            webGPU: false,
            zoomSpeed: 1.0,
        },
        // default hidden ui groups
        hidden: {
            "fdm-base": true,
            "fdm-cool": true,
            "fdm-heat": true,
            "fdm-fill": true,
            "fdm-solid": true,
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
};

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
