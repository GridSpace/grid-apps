/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_conf = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (self.kiri.conf) return;

    let KIRI = self.kiri;

    function genID() {
        while (true) {
            var k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    KIRI.conf = {
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
        // --------------- settings filters (for loading/saving)
        filter: {
            fdm:{
                // fields permitted in FDM:Device
                d:{
                    bedWidth: 1,
                    bedDepth: 1,
                    bedHeight: 1,
                    bedRound: 1,
                    maxHeight: 1,
                    extrudeAbs: 1,
                    originCenter: 1,
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
                    polishLayers: 1,
                    polishSpeed: 1,
                    outputLayerRetract: 1,
                    gcodeNozzle: 1,
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
                    bedWidth: 1,
                    bedDepth: 1,
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
        // --------------- (default)
        template: {
            infill:[
                { name: "vase" },
                { name: "hex" },
                { name: "grid" },
                { name: "gyroid" },
                { name: "triangle" }
            ],
            units:[
                { name: "mm" },
                { name: "in" }
            ],
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
            // FDM/CAM/Laser
            device:{
                bedWidth: 300,      // FDM/CAM/Laser
                bedDepth: 175,      // FDM/CAM/Laser
                bedHeight: 2.5,     // display only (deprecate)
                bedRound: false,    // FDM
                originCenter: false,// FDM/CAM
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
                gcodeFExt: "",      // CAM file extension
                gcodeSpace: "",     // CAM token spacing
                gcodeStrip: true,   // CAM strip comments
                gcodeDwell: ["G4 P{time}"],     // CAM dwell script
                gcodeChange: ["M6 T{tool}"],    // CAM tool change script
                gcodeSpindle: ["M3 S{speed}"],  // CAM spindle speed
                gcodeLaserOn: ["M106 S{power}"],// LASER turn on
                gcodeLaserOff: ["M107"]         // LASER turn off
            },
            // FDM/CAM/Laser
            process:{
                processName: "default",

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

                sliceSolidMinArea: 1,
                sliceSolidLayers: 3,
                sliceBottomLayers: 3,
                sliceTopLayers: 3,

                firstSliceHeight: 0.25,
                firstLayerRate: 30,
                firstLayerFillRate: 40,
                firstLayerPrintMult: 1.0,
                outputRaft: false,
                outputRaftSpacing: 0.2,
                firstLayerNozzleTemp: 0,
                firstLayerBedTemp: 0,

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
                polishLayers: 0,
                polishSpeed: 40,
                outputLayerRetract: false,
                gcodeNozzle: 0,
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

                // --- shared FDM/Laser/CAM ---

                outputOriginBounds: true,
                outputOriginCenter: true,
                outputInvertX: false,
                outputInvertY: false
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
            synth: {
                // set in updateSettingsFromFields()
                fillOffsetMult: 0,
                diffOffsetMult: 0
            },
            controller:{
                view: null,
                dark: false,
                compact: false,
                zoomSpeed: 1.0,
                reverseZoom: true,
                showOrigin: false,
                freeLayout: true,
                autoLayout: true,
                alignTop: true,
                units: "mm"
            },
            mode: 'FDM',
            id: genID(),
            ver: 1
        }
    };

})();
