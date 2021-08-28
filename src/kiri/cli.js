let fs = require('fs');
let args = process.argv.slice(2);
let dir = args[0] || ".";
let files = [
    "kiri",
    "ext/three",
    "ext/pngjs",
    "ext/jszip",
    "license",
    "ext/clip2",
    "ext/earcut",
    "add/array",
    "add/three",
    "add/class",
    "geo/base",
    "geo/debug",
    "geo/point",
    "geo/points",
    "geo/slope",
    "geo/line",
    "geo/bounds",
    "geo/polygon",
    "geo/polygons",
    "geo/gyroid",
    "moto/pack",
    "kiri/conf",
    "kiri/client",
    "kiri/engine",
    "kiri/slice",
    "kiri/slicer",
    "kiri/slicer2",
    "kiri/layers",
    "mode/fdm/fill",
    "mode/fdm/driver",
    "mode/fdm/slice",
    "mode/fdm/prepare",
    "mode/fdm/export",
    "mode/sla/driver",
    "mode/sla/slice",
    "mode/sla/export",
    "mode/cam/driver",
    "mode/cam/ops",
    "mode/cam/tool",
    "mode/cam/topo",
    "mode/cam/slice",
    "mode/cam/prepare",
    "mode/cam/export",
    "mode/cam/animate",
    "mode/laser/driver",
    "kiri/widget",
    "kiri/print",
    "kiri/codec",
    "kiri/worker",
    "moto/load-stl"
].map(p => `${dir}/src/${p}.js`);

let exports_save = exports,
    module_save = module,
    THREE = {},
    geo = {},
    navigator = { userAgent: "" },
    self = {
        THREE,
        kiri: { driver: {}, loader: [] },
        location: { hostname: 'local', port: 0, protocol: 'fake' },
        postMessage: (msg) => {
            self.kiri.client.onmessage({data:msg});
        }
    };

// fake fetch for worker to get wasm, if needed
let fetch = function(url) {
    console.log({fake_fetch: url});
    let buf = fs.readFileSync(dir + url);
    return new Promise((resolve, reject) => {
        resolve(new Promise((resolve, reject) => {
            resolve({
                arrayBuffer: function() {
                    return buf;
                }
            });
        }));
    });
};

class Worker {
    constructor(url) {
        console.log({fake_worker: url});
    }

    postMessage(msg) {
        setImmediate(() => {
            self.kiri.worker.onmessage({data:msg});
        });
    }

    onmessage(msg) {
        // if we end up here, something went wrong
        console.trace('worker-recv', msg);
    }

    terminate() {
        // if we end up here, something went wrong
        console.trace('worker terminate');
    }
}

// node is missing these functions so put them in scope during eval
function atob(a) {
    return Buffer.from(a).toString('base64');
}

function btoa(b) {
    return Buffer.from(b, 'base64').toString();
}

for (let file of files) {
    let isPNG = file.indexOf("/pngjs") > 0;
    let isClip = file.indexOf("/clip") > 0;
    let isEarcut = file.indexOf("/earcut") > 0;
    let isTHREE = file.indexOf("/three") > 0;
    if (isTHREE) {
        // THREE.js kung-fu fake-out
        exports = {};
    }
    let swapMod = isEarcut;
    if (swapMod) {
        module = { exports: {} };
    }
    let clearMod = isPNG || isClip;
    if (clearMod) {
        module = undefined;
    }
    try {
        eval(fs.readFileSync(dir + "/" + file).toString());
    } catch (e) {
        // console.log({dir, file, e});
        console.log({dir, file});
    }
    if (isClip) {
        ClipperLib = self.ClipperLib;
    }
    if (isTHREE) {
        Object.assign(THREE, exports);
        // restore exports after faking out THREE.js
        exports = exports_save;
    }
    if (isEarcut) {
        self.earcut = module.exports;
    }
    if (clearMod || swapMod) {
        module = module_save;
    }
}

let kiri = self.kiri;
let moto = self.moto;
let engine = kiri.newEngine();

fetch('/web/obj/cube.stl').then(data => {
    console.log({version: kiri.version});
    let buf = data.arrayBuffer().buffer;
    engine.parse(buf)
    .then(data => {
        console.log({loaded: data});
    })
    .then(() => engine.moveTo(1,1,1))
    .then(() => engine.setProcess({
        "sName":"Ender3_test",
        "sliceHeight":0.25,
        "sliceShells":3,
        "sliceShellOrder":"in-out",
        "sliceLayerStart":"last",
        "sliceFillAngle":45,
        "sliceFillOverlap":0.3,
        "sliceFillSparse":0.2,
        "sliceFillType":"gyroid",
        "sliceAdaptive":false,
        "sliceMinHeight":0,
        "sliceSupportDensity":0.25,
        "sliceSupportOffset":0.4,
        "sliceSupportGap":1,
        "sliceSupportSize":6,
        "sliceSupportArea":1,
        "sliceSupportExtra":0,
        "sliceSupportAngle":50,
        "sliceSupportNozzle":0,
        "sliceSolidMinArea":10,
        "sliceSolidLayers":3,
        "sliceBottomLayers":3,
        "sliceTopLayers":3,
        "firstLayerRate":10,
        "firstLayerPrintMult":1.15,
        "firstLayerYOffset":0,
        "firstLayerBrim":0,
        "firstLayerBeltLead":3,
        "outputTemp":210,
        "outputBedTemp":60,
        "outputFeedrate":50,
        "outputFinishrate":50,
        "outputSeekrate":80,
        "outputShellMult":1.25,
        "outputFillMult":1.25,
        "outputSparseMult":1.25,
        "outputRetractDist":4,
        "outputRetractSpeed":30,
        "outputRetractDwell":30,
        "outputShortPoly":100,
        "outputMinSpeed":10,
        "outputCoastDist":0.1,
        "outputLayerRetract":true,
        "detectThinWalls":true,
        "zHopDistance":0,
        "antiBacklash":0,
        "outputOriginCenter":false,
        "sliceFillRate":0,
        "sliceSupportEnable":false,
        "firstSliceHeight":0.25,
        "firstLayerFillRate":35,
        "firstLayerLineMult":1,
        "firstLayerNozzleTemp":0,
        "firstLayerBedTemp":0,
        "firstLayerBrimTrig":0,
        "outputRaft":false,
        "outputRaftSpacing":0.2,
        "outputRetractWipe":0,
        "outputBrimCount":2,
        "outputBrimOffset":2,
        "outputLoopLayers":null,
        "outputInvertX":false,
        "outputInvertY":false,
        "arcTolerance":0,
        "gcodePause":"",
        "ranges":[],
        "firstLayerFanSpeed":0,
        "outputFanSpeed":255
    }))
    .then(() => engine.setDevice({
        "noclone":false,
        "mode":"FDM",
        "internal":0,
        "imageURL":"",
        "imageScale":0.75,
        "imageAnchor":0,
        "bedHeight":2.5,
        "bedWidth":220,
        "bedDepth":220,
        "bedRound":false,
        "bedBelt":false,
        "maxHeight":300,
        "originCenter":false,
        "extrudeAbs":true,
        "spindleMax":0,
        "gcodeFan":[ "M106 S{fan_speed}" ],
        "gcodeTrack":[],
        "gcodeLayer":[],
        "gcodePre":[
        "M107                     ; turn off filament cooling fan",
        "G90                      ; set absolute positioning mode",
        "M82                      ; set absolute positioning for extruder",
        "M104 S{temp} T{tool}     ; set extruder temperature",
        "M140 S{bed_temp} T{tool} ; set bed temperature",
        "G28                      ; home axes",
        "G92 X0 Y0 Z0 E0          ; reset all axes positions",
        "G1 X0 Y0 Z0.25 F180      ; move XY to 0,0 and Z 0.25mm over bed",
        "G92 E0                   ; zero the extruded",
        "M190 S{bed_temp} T{tool} ; wait for bed to reach target temp",
        "M109 S{temp} T{tool}     ; wait for extruder to reach target temp",
        "G92 E0                   ; zero the extruded",
        "G1 F225                  ; set feed speed"
        ],
        "gcodePost":[
        "M107                     ; turn off filament cooling fan",
        "M104 S0 T{tool}          ; turn off right extruder",
        "M140 S0 T{tool}          ; turn off bed",
        "G1 X0 Y300 F1200         ; end move",
        "M84                      ; disable stepper motors"
        ],
        "gcodeProc":"",
        "gcodePause":[],
        "gcodeDwell":[],
        "gcodeSpindle":[],
        "gcodeChange":[],
        "gcodeFExt":"gcode",
        "gcodeSpace":true,
        "gcodeStrip":false,
        "gcodeLaserOn":[],
        "gcodeLaserOff":[],
        "extruders":[
        {
            "extFilament":1.75,
            "extNozzle":0.4,
            "extSelect":[ "T0" ],
            "extDeselect":[],
            "extOffsetX":0,
            "extOffsetY":0
        }
        ],
        "new":false,
        "deviceName":"Creality.Ender.3"
    }))
    .then(eng => eng.slice())
    .then(eng => eng.prepare())
    .then(eng => engine.export())
    .then(gcode => {
        console.log({gcode});
    })
    .catch(error => {
        console.log({error});
    });
});
