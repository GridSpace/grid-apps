/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_init = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (self.kiri.init) return;

    let KIRI = self.kiri,
        WIN = self.window,
        DOC = self.document,
        LOC = self.location,
        API = KIRI.api,
        SDB = API.sdb,
        UI = API.ui,
        UC = API.uc,
        SEED = API.const.SEED,
        LANG = API.const.LANG,
        VIEWS = API.const.VIEWS,
        MODES = API.const.MODES,
        LOCAL = API.const.LOCAL,
        SETUP = API.const.SETUP,
        DEFMODE = SETUP.dm && SETUP.dm.length === 1 ? SETUP.dm[0] : 'FDM',
        STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
        SPACE = KIRI.space,
        STATS = API.stats,
        ROT = Math.PI/2,
        ROT5 = ROT / 9,
        ALL = [MODES.FDM, MODES.LASER, MODES.CAM],
        CAM = [MODES.CAM],
        FDM = [MODES.FDM],
        FDM_CAM = [MODES.CAM,MODES.FDM],
        FDM_LASER = [MODES.LASER,MODES.FDM],
        CAM_LASER = [MODES.LASER,MODES.CAM],
        LASER = [MODES.LASER],
        CATALOG = API.catalog,
        platform = API.platform,
        selection = API.selection,
        deviceLock = false,
        js2o = API.js2o,
        o2js = API.o2js,
        selectedTool = null,
        editTools = null,
        maxTool = 0;

    function settings() {
        return API.conf.get();
    }

    KIRI.init = function(api) {

        let assets = $('assets'),
            control = $('control'),
            container = $('container'),
            welcome = $('welcome');

        WIN.addEventListener("resize", API.dialog.update);

        SPACE.showSkyGrid(false);
        SPACE.setSkyColor(0xffffff);
        SPACE.init(container, function (delta) {
            if (API.var.layer_max === 0) return;
            if (settings().controller.reverseZoom) delta = -delta;
            if (delta > 0) API.var.layer_at--;
            else if (delta < 0) API.var.layer_at++;
            API.show.slices();
        });
        SPACE.platform.onMove(API.conf.save);
        SPACE.platform.setRound(true);

        Object.assign(UI, {
            container: container,
            ctrlLeft: $('control-left'),
            ctrlRight: $('control-right'),
            layerView: $('layer-view'),
            layerSlider: $('layer-slider'),
            modelOpacity: $('opacity'),

            assets: assets,
            control: control,
            modal: $('modal'),
            print: $('print'),
            local: $('local'),
            help: $('help'),

            alert: {
                dialog: $('alert-area'),
                text: $('alert-text')
            },

            devices: $('devices'),
            deviceAdd: $('device-add'),
            deviceDelete: $('device-del'),
            deviceSave: $('device-save'),
            deviceClose: $('device-close'),
            deviceSelect: $('device-select'),
            deviceFavorites: $('device-favorites'),
            deviceAll: $('device-all'),

            device: UC.newGroup("device", $('device')),
            deviceName: UC.newInput(LANG.dev_name, {size:20, text:true}),
            setDeviceFilament: UC.newInput(LANG.dev_fil, {title:LANG.dev_fil_desc, convert:UC.toFloat, modes:FDM}),
            setDeviceNozzle: UC.newInput(LANG.dev_nozl, {title:LANG.dev_nozl_desc, convert:UC.toFloat, modes:FDM}),
            setDeviceWidth: UC.newInput(LANG.dev_bedw, {title:LANG.dev_bedw_desc, convert:UC.toInt}),
            setDeviceDepth: UC.newInput(LANG.dev_bedd, {title:LANG.dev_bedd_desc, convert:UC.toInt}),
            setDeviceHeight: UC.newInput(LANG.dev_bedhm, {title:LANG.dev_bedhm_desc, convert:UC.toInt, modes:FDM}),
            setDeviceMaxSpindle: UC.newInput(LANG.dev_spmax, {title:LANG.dev_spmax_desc, convert:UC.toInt, modes:CAM}),
            setDeviceExtrusion: UC.newBoolean(LANG.dev_extab, onBooleanClick, {title:LANG.dev_extab_desc}),
            setDeviceOrigin: UC.newBoolean(LANG.dev_orgc, onBooleanClick, {title:LANG.dev_orgc_desc}),
            setDeviceOriginTop: UC.newBoolean(LANG.dev_orgt, onBooleanClick, {title:LANG.dev_orgt_desc, modes:CAM}),
            setDeviceRound: UC.newBoolean(LANG.dev_bedc, onBooleanClick, {title:LANG.dev_bedc_desc, modes:FDM}),

            setDevice: UC.newGroup("gcode", $('device')),
            setDeviceFan: UC.newInput(LANG.dev_fanp, {title:LANG.dev_fanp_desc, modes:FDM, size:17}),
            setDeviceTrack: UC.newInput(LANG.dev_prog, {title:LANG.dev_prog_desc, modes:FDM, size:17}),
            setDeviceLayer: UC.newText(LANG.dev_layer, {title:LANG.dev_layer_desc, modes:FDM, size:14, height: 2}),
            setDeviceToken: UC.newBoolean(LANG.dev_token, null, {title:LANG.dev_token_desc, modes:CAM_LASER}),
            setDeviceStrip: UC.newBoolean(LANG.dev_strip, null, {title:LANG.dev_strip_desc, modes:CAM}),
            setDeviceFExt: UC.newInput(LANG.dev_fext, {title:LANG.dev_fext_desc, modes:CAM_LASER, size:7}),
            setDeviceDwell: UC.newText(LANG.dev_dwell, {title:LANG.dev_dwell_desc, modes:CAM, size:14, height:2}),
            setDeviceChange: UC.newText(LANG.dev_tool, {title:LANG.dev_tool_desc, modes:CAM, size:14, height:2}),
            setDeviceSpindle: UC.newText(LANG.dev_speed, {title:LANG.dev_speed_desc, modes:CAM, size:14, height:2}),
            setDevicePause: UC.newText(LANG.dev_pause, {title:LANG.dev_pause_desc, modes:FDM, size:14, height:3}),
            setDeviceLaserOn: UC.newText(LANG.dev_lzon, {title:LANG.dev_lzon_desc, modes:LASER, size:14, height:3}),
            setDeviceLaserOff: UC.newText(LANG.dev_lzof, {title:LANG.dev_lzof_desc, modes:LASER, size:14, height:3}),
            setDevicePre: UC.newText(LANG.dev_head, {title:LANG.dev_head_desc, modes:ALL, size:14, height:3}),
            setDevicePost: UC.newText(LANG.dev_foot, {title:LANG.dev_foot_desc, modes:ALL, size:14, height:3}),

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
            // toolTaperAngle: $('tool-tangle'),
            toolTaperTip: $('tool-ttip'),
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
            stock: $('stock'),
            stockWidth: $('stock-width'),
            stockDepth: $('stock-width'),
            stockHeight: $('stock-width'),

            mode: UC.newGroup('mode', assets),
            modeTable: UC.newTableRow([
                [
                    UI.modeFDM =
                    UC.newButton("FDM Printing", function() { API.mode.set('FDM',null,platform.update_size) }),
                ],[
                    UI.modeLASER =
                    UC.newButton("Laser Cutting", function() { API.mode.set('LASER',null,platform.update_size) }),
                ],[
                    UI.modeCAM =
                    UC.newButton("CNC Milling",   function() { API.mode.set('CAM',null,platform.update_size) }, {id:"modeCAM"}),
                ]
            ]),
            system: UC.newGroup('setup'),
            sysTable: UC.newTableRow([
                [
                    UI.setupDevices =
                    UC.newButton("Devices", showDevices)
                ],[
                    UI.setupTools =
                    UC.newButton("Tools",   showTools, {modes:CAM})
                ],[
                    UI.localButton =
                    UC.newButton("Local",   API.show.local, {modes:FDM_CAM})
                ],[
                    UI.helpButton =
                    UC.newButton("Help",    API.help.show)
                ]
            ]),
            wsFunc: UC.newGroup('function'),
            wsFuncTable: UC.newTableRow([
                [
                    UI.load =
                    UC.newButton("Import",  function() { API.event.import() }),
                    UI.import =
                    UC.newButton("+")
                ],[
                    UI.modeArrange =
                    UC.newButton("Arrange", platform.layout),
                ],[
                    UI.modeSlice =
                    UC.newButton("Slice",   API.function.slice)
                ],[
                    UI.modePreview =
                    UC.newButton("Preview", API.function.print),
                ],[
                    UI.modeExport =
                    UC.newButton("Export",  API.function.export)
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

            workspace: UC.newGroup('workspace'),
            wsTable: UC.newTableRow([
                [
                    UI.saveButton =
                    UC.newButton("Save",    API.space.save),
                ],[
                    UC.newButton("Clear",   API.space.clear)
                ]
            ]),

            layout: UC.newGroup('options'),
            showOrigin: UC.newBoolean("show origin", booleanSave, {title:"show device or process origin"}),
            alignTop: UC.newBoolean("align top", booleanSave, {title:"align parts to the\ntallest part when\nno stock is set", modes:CAM}),
            autoLayout: UC.newBoolean("auto layout", booleanSave, {title:"automatically layout platform\nwhen new items added\nor when arrange clicked\nmore than once"}),
            freeLayout: UC.newBoolean("free layout", booleanSave, {title:"permit dragable layout"}),
            reverseZoom: UC.newBoolean("invert zoom", booleanSave, {title:"invert mouse wheel\nscroll zoom"}),
            units: UC.newSelectField("units", {modes:CAM}, "units"),

            appendLeft: UC.checkpoint(),

            layers: UC.setGroup($("layers")),
            layerOutline: UC.newBoolean("outline", onLayerToggle, {modes:LOCAL ? ALL : FDM_LASER}),
            layerTrace: UC.newBoolean("trace", onLayerToggle, {modes:FDM_LASER}),
            layerFacing: UC.newBoolean("facing", onLayerToggle, {modes:CAM}),
            layerRough: UC.newBoolean("roughing", onLayerToggle, {modes:CAM}),
            layerFinish: UC.newBoolean("finishing", onLayerToggle, {modes:CAM}),
            layerFinishX: UC.newBoolean("finish x", onLayerToggle, {modes:CAM}),
            layerFinishY: UC.newBoolean("finish y", onLayerToggle, {modes:CAM}),
            layerDelta: UC.newBoolean("delta", onLayerToggle, {modes:FDM}),
            layerSolid: UC.newBoolean("solids", onLayerToggle, {modes:FDM}),
            layerFill: UC.newBoolean("solid fill", onLayerToggle, {modes:FDM}),
            layerSparse: UC.newBoolean("sparse fill", onLayerToggle, {modes:FDM}),
            layerSupport: UC.newBoolean("support", onLayerToggle, {modes:FDM}),
            layerPrint: UC.newBoolean("print", onLayerToggle),
            layerMoves: UC.newBoolean("moves", onLayerToggle),

            settingsGroup: UC.newGroup("settings", control),
            settingsTable: UC.newTableRow([
                [
                    UI.settingsLoad =
                    UC.newButton("load", settingsLoad),
                    UI.settingsSave =
                    UC.newButton("save", settingsSave)
                ],[
                    UI.settingsExpert =
                    UC.newButton("expert", () => { UC.setExpert(true); SDB.setItem('expert', true) }, {modes:FDM, expert: false}),
                    UI.settingsExpert =
                    UC.newButton("basic", () => { UC.setExpert(false); SDB.removeItem('expert') }, {modes:FDM, expert: true})
                ]
            ]),

            process: UC.newGroup("slicing", control, {modes:FDM_LASER}),

            // 3d print
            sliceHeight: UC.newInput("layer height", {title:"millimeters", convert:UC.toFloat, modes:FDM}),
            sliceShells: UC.newInput("shell count", {convert:UC.toInt, modes:FDM}),
            sliceTopLayers: UC.newInput("top layers", {title:"top solid layer count", convert:UC.toInt, modes:FDM}),
            sliceSolidLayers: UC.newInput("solid layers", {title:"flat area fill projections\nbased on layer deltas", convert:UC.toInt, modes:FDM}),
            sliceBottomLayers: UC.newInput("base layers", {title:"bottom solid layer count", convert:UC.toInt, modes:FDM}),

            process: UC.newGroup("fill", control, {modes:FDM}),
            sliceFillType: UC.newSelectField("type", {modes:FDM}, "infill"),
            sliceFillSparse: UC.newInput("percentage", {title:"for infill areas\n0.0 - 1.0", convert:UC.toFloat, bound:UC.bound(0.0,1.0), modes:FDM}),
            sliceFillAngle: UC.newInput("solid angle", {title:"base angle in degrees", convert:UC.toFloat, modes:FDM, expert:true}),
            sliceFillOverlap: UC.newInput("overlap", {title:"overlap with shell and fill\nas % of nozzle width\nhigher bonds better\n0.0 - 1.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM, expert:true}),

            firstLayer: UC.newGroup("first layer", null, {modes:FDM}),
            firstSliceHeight: UC.newInput("layer height", {title:"in millimeters\nshould be >= slice height", convert:UC.toFloat, modes:FDM}),
            firstLayerRate: UC.newInput("shell speed", {title:"print move max speed\nmillimeters / minute", convert:UC.toFloat, modes:FDM}),
            firstLayerFillRate: UC.newInput("fill speed", {title:"fill move max speed\nmillimeters / minute", convert:UC.toFloat, modes:FDM}),
            firstLayerPrintMult: UC.newInput("print factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, modes:FDM, expert: true}),
            outputBrimCount: UC.newInput("skirt count", {title:"number of skirts", convert:UC.toInt, modes:FDM}),
            outputBrimOffset: UC.newInput("skirt offset", {title:"millimeters", convert:UC.toFloat, modes:FDM}),
            firstLayerNozzleTemp: UC.newInput("nozzle temp", {title:"degrees celsius\nused when non-zero", convert:UC.toInt, modes:FDM, expert: true}),
            firstLayerBedTemp: UC.newInput("bed temp", {title:"degrees celsius\nused when non-zero", convert:UC.toInt, modes:FDM, expert: true}),

            support: UC.newGroup("support", null, {modes:FDM}),
            sliceSupportDensity: UC.newInput("density", {title:"0.0 - 1.0\nrecommended 0.15\n0 to disable", convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:FDM}),
            sliceSupportSize: UC.newInput("pillar size", {title:"width in millimeters", bound:UC.bound(1.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportOffset: UC.newInput("part offset", {title:"millimeters\noffset from part", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportGap: UC.newInput("gap layers", {title:"number of layers\noffset from part", bound:UC.bound(0,5), convert:UC.toInt, modes:FDM, expert: true}),
            sliceSupportSpan: UC.newInput("max bridge", {title:"span length that\ntriggers support\nin millimeters", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportArea: UC.newInput("min area", {title:"min area for a\nsupport column\nin millimeters", bound:UC.bound(0.1,200.0), convert:UC.toFloat, modes:FDM}),
            sliceSupportExtra: UC.newInput("expand", {title:"expand support area\nbeyond part boundary\nin millimeters", bound:UC.bound(0.0,200.0), convert:UC.toFloat, modes:FDM, expert: true}),
            sliceSupportEnable: UC.newBoolean("enable", onBooleanClick, {modes:FDM}),

            laserOffset: UC.newInput("offset", {title:"nadjust for beam width\nin millimeters", convert:UC.toFloat, modes:LASER}),
            laserSliceHeight: UC.newInput("height", {title:"millimeters\n0 = auto/detect", convert:UC.toFloat, modes:LASER}),
            laserSliceSingle: UC.newBoolean("single", onBooleanClick, {title:"perform one slice\nat specified height", modes:LASER}),

            camCommon: UC.newGroup("common", null, {modes:CAM}),
            camFastFeed: UC.newInput("rapid feed", {title:"rapid moves feedrate\nin workspace units / minute", convert:UC.toInt, modes:CAM}),

            roughing: UC.newGroup("roughing", null, {modes:CAM}),
            roughingTool: UC.newSelectField("tool", {modes:CAM}),
            roughingSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            roughingOver: UC.newInput("step over", {title:"0.1 - 1.0\npercentage of\ntool diameter", convert:UC.toFloat, bound:UC.bound(0.1,1.0), modes:CAM}),
            roughingDown: UC.newInput("step down", {title:"step down depth\nfor each pass\nin workspace units\n0 to disable", convert:UC.toFloat, modes:CAM}),
            roughingSpeed: UC.newInput("feed rate", {title:"max speed while cutting\nworkspace units / minute", convert:UC.toInt, modes:CAM}),
            roughingPlunge: UC.newInput("plunge rate", {title:"max speed on z axis\nworkspace units / minute", convert:UC.toInt, modes:CAM}),
            roughingStock: UC.newInput("leave stock", {title:"horizontal offset from vertical faces\nstock to leave for finishing pass\nin workspace units", convert:UC.toFloat, modes:CAM}),
            camPocketOnlyRough: UC.newBoolean("pocket only", onBooleanClick, {title:"constrain to\npart boundaries", modes:CAM}),
            camEaseDown: UC.newBoolean("ease down", onBooleanClick, {title:"plunge cuts will\nspiral down or ease\nalong a linear path\nas they cut downward", modes:CAM}),
            roughingOn: UC.newBoolean("enable", onBooleanClick, {modes:CAM}),

            finishing: UC.newGroup("finishing", null, {modes:CAM}),
            finishingTool: UC.newSelectField("tool", {modes:CAM}),
            finishingSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            finishingOver: UC.newInput("step over", {title:"0.05 - 1.0\npercentage of\ntool diameter\nfor linear XY", convert:UC.toFloat, bound:UC.bound(0.05,1.0), modes:CAM}),
            finishingDown: UC.newInput("step down", {title:"step down depth\nfor each pass\nin workspace units\n0 to disable", convert:UC.toFloat, modes:CAM}),
            finishingAngle: UC.newInput("max angle", {title:"angles greater than this\nare considered vertical", convert:UC.toFloat, bound:UC.bound(45,90), modes:CAM}),
            finishingSpeed: UC.newInput("feed rate", {title:"max speed while cutting\workspace units / minute", convert:UC.toInt, modes:CAM}),
            finishingPlunge: UC.newInput("plunge rate", {title:"max speed on z axis\workspace units / minute", convert:UC.toInt, modes:CAM}),
            camPocketOnlyFinish: UC.newBoolean("pocket only", onBooleanClick, {title:"constrain to\npart boundaries", modes:CAM}),
            finishingOn: UC.newBoolean("waterline", onBooleanClick, {title:"contour finishing\ndisabled when pocketing", modes:CAM}),
            finishingXOn: UC.newBoolean("linear x", onBooleanClick, {title:"linear x-axis finishing", modes:CAM}),
            finishingYOn: UC.newBoolean("linear y", onBooleanClick, {title:"linear y-axis finishing", modes:CAM}),
            finishCurvesOnly: UC.newBoolean("curves only", onBooleanClick, {title:"limit linear cleanup\nto curved surfaces\nto reduce time", modes:CAM}),

            drilling: UC.newGroup("drilling", null, {modes:CAM}),
            drillTool: UC.newSelectField("tool", {modes:CAM}),
            drillSpindle: UC.newInput("spindle rpm", {title:"spindle speed rpm", convert:UC.toInt, modes:CAM}),
            drillDown: UC.newInput("plunge per", {title:"max plunge between\ndwell periods\nin workspace units\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillDownSpeed: UC.newInput("plunge rate", {title:"plunge rate\nin workspace units / minute\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillDwell: UC.newInput("dwell time", {title:"dwell time\nbetween plunges in\nin milliseconds", convert:UC.toFloat, modes:CAM}),
            drillLift: UC.newInput("drill lift", {title:"lift between plunges\nafter dwell period\nin workspace units\n0 to disable", convert:UC.toFloat, modes:CAM}),
            drillingOn: UC.newBoolean("enable", onBooleanClick, {modes:CAM}),

            camTabs: UC.newGroup("cutout tabs", null, {modes:CAM}),
            camTabsAngle: UC.newInput("angle", {title:"starting angle for tab spacing\nin degrees", convert:UC.toInt, bound:UC.bound(0,360), modes:CAM}),
            camTabsCount: UC.newInput("count", {title:"number of tabs to use\nwill be spaced evenly\naround the part", convert:UC.toInt, bound:UC.bound(1,20), modes:CAM}),
            camTabsWidth: UC.newInput("width", {title:"width in workspace units\nperpendicular to part", convert:UC.toFloat, bound:UC.bound(0.1,100), modes:CAM}),
            camTabsHeight: UC.newInput("height", {title:"height in workspace units\nfrom part bottom", convert:UC.toFloat, bound:UC.bound(0.1,100), modes:CAM}),
            camTabsOn: UC.newBoolean("enable", onBooleanClick, {title:"enable or disable tabs\ntab generation skipped when\npocket only mode enabled", modes:CAM}),

            output: UC.newGroup("raft", null, {modes:FDM}),
            outputRaftSpacing:  UC.newInput("spacing", {title:"additional layer spacing\nbetween 1st layer and raft\nin millimeters", convert:UC.toFloat, bound:UC.bound(0.0,3.0), modes:FDM}),
            outputRaft: UC.newBoolean("enable", onBooleanClick, {title:"create a raft under the\nmodel for better adhesion\nuses skirt offset and\ndisables skirt output", modes:FDM}),

            output: UC.newGroup("output"),
            outputTileSpacing: UC.newInput("spacing", {title:"millimeters\ndistance between layer output", convert:UC.toInt, modes:LASER}),
            outputTileScaling: UC.newInput("scaling", {title:"multiplier (0.1 to 100)", convert:UC.toInt, bound:UC.bound(0.1,100), modes:LASER}),
            outputLaserPower: UC.newInput("power", {title:"0 - 100 %", convert:UC.toInt, bound:UC.bound(1,100), modes:LASER}),
            outputLaserSpeed: UC.newInput("speed", {title:"millimeters / minute", convert:UC.toInt, modes:LASER}),
            outputLaserMerged: UC.newBoolean("merged", onBooleanClick, {title:"merge all layers using\ncolor coding to denote\nstacking depth", modes:LASER}),
            outputLaserGroup: UC.newBoolean("grouped", onBooleanClick, {title:"retain each layer as\na unified grouping\ninstead of separated\npolygons", modes:LASER}),

            outputTemp: UC.newInput("nozzle temp", {title:"degrees celsius", convert:UC.toInt, modes:FDM}),
            outputBedTemp: UC.newInput("bed temp", {title:"degrees celsius", convert:UC.toInt, modes:FDM}),
            outputFeedrate: UC.newInput("print speed", {title:"print move max speed\nmillimeters / minute", convert:UC.toInt, modes:FDM}),
            outputFinishrate: UC.newInput("finish speed", {title:"outermost shell speed\nmillimeters / minute", convert:UC.toInt, modes:FDM}),
            outputSeekrate: UC.newInput("move speed", {title:"non-print move speed\nmillimeters / minute\n0 = enable G0 moves", convert:UC.toInt, modes:FDM}),
            outputShellMult: UC.newInput("shell factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFillMult: UC.newInput("solid factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputSparseMult:  UC.newInput("infill factor", {title:"extrusion multiplier\n0.0 - 2.0", convert:UC.toFloat, bound:UC.bound(0.0,2.0), modes:FDM}),
            outputFanLayer:  UC.newInput("fan layer", {title:"layer to enable fan", convert:UC.toInt, bound:UC.bound(0,100), modes:FDM, expert: true}),

            camTolerance: UC.newInput("tolerance", {title:"surface precision\nin workspace units", convert:UC.toFloat, bound:UC.bound(0.001,1.0), modes:CAM}),
            camZTopOffset: UC.newInput("z top offset", {title:"offset from stock surface\nto top face of part\nin workspace units", convert:UC.toFloat, modes:CAM}),
            camZBottom: UC.newInput("z bottom", {title:"offset from part bottom\nto limit cutting depth\nin workspace units", convert:UC.toFloat, modes:CAM}),
            camZClearance: UC.newInput("z clearance", {title:"travel offset from z top\nin workspace units", convert:UC.toFloat, bound:UC.bound(0.01,100), modes:CAM}),
            outputClockwise: UC.newBoolean("conventional", onBooleanClick, {title:"milling direction\nuncheck for 'climb'", modes:CAM}),
            camDepthFirst: UC.newBoolean("depth first", onBooleanClick, {title:"optimize pocket cuts\nwith depth priority", modes:CAM}),

            camStock: UC.newGroup("stock", null, {modes:CAM}),
            camStockX: UC.newInput("width", {title:"width (x) in workspace units\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockY: UC.newInput("depth", {title:"depth (y) in workspace units\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockZ: UC.newInput("height", {title:"height (z) in workspace units\n0 defaults to part size", convert:UC.toFloat, bound:UC.bound(0,9999), modes:CAM}),
            camStockOffset: UC.newBoolean("offset", onBooleanClick, {title: "use width, depth, height\nas offsets from max\npart size on platform", modes:CAM}),
            outputOriginBounds: UC.newBoolean("origin bounds", onBooleanClick, {modes:LASER}),
            outputOriginCenter: UC.newBoolean("origin center", onBooleanClick, {modes:CAM_LASER}),
            camOriginTop: UC.newBoolean("origin top", onBooleanClick, {modes:CAM}),

            advanced: UC.newGroup("advanced", null, {modes:FDM, expert: true}),
            outputRetractDist: UC.newInput("retract dist", {title:"amount to retract filament\nfor long moves. in millimeters", convert:UC.toFloat, modes:FDM, expert: true}),
            outputRetractSpeed: UC.newInput("retract rate", {title:"speed of filament\nretraction in mm/s", convert:UC.toInt, modes:FDM, expert: true}),
            outputRetractDwell: UC.newInput("engage dwell", {title:"time between re-engaging\nfilament and movement\nin milliseconds", convert:UC.toInt, modes:FDM, expert: true}),
            outputCoastDist: UC.newInput("shell coast", {title:"non-printing end\nof perimeter shells\nin millimeters", bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM, expert: true}),
            // outputWipeDistance: UC.newInput("wipe", {title:"non-printing move at\close of polygon\nin millimeters", bound:UC.bound(0.0,10), convert:UC.toFloat, modes:FDM, expert: true}),
            sliceSolidMinArea: UC.newInput("min solid", {title:"minimum area (mm^2)\nrequired to keep solid\nmust be > 0.1", convert:UC.toFloat, modes:FDM, expert: true}),
            sliceMinHeight: UC.newInput("min layer", {title: "enables adaptive slicing with\nthis as the min layer height\nin millimeters\n0 to disable", bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM, expert: true}),
            outputMinSpeed: UC.newInput("min speed", {title:"minimum speed\nfor short segments", bound:UC.bound(5,200), convert:UC.toFloat, modes:FDM, expert: true}),
            outputShortPoly: UC.newInput("slow poly", {title:"polygons shorter than this\nwill have their print speed\nscaled down to min speed\nin millimeters", bound:UC.bound(0,200), convert:UC.toFloat, modes:FDM, expert: true}),
            zHopDistance: UC.newInput("z hop dist", {title: "amount to raise z\non retraction moves\nin millimeters\n0 to disable", bound:UC.bound(0,3.0), convert:UC.toFloat, modes:FDM, expert: true}),
            antiBacklash: UC.newInput("anti-backlash", {title: "use micro-movements to cancel\nbacklash during fills\nin millimeters", bound:UC.bound(0,3), convert:UC.toInt, modes:FDM, expert: true}),
            // detectThinWalls: UC.newBoolean("thin wall fill", onBooleanClick, {title: "detect and fill thin openings\nbetween shells walls", modes:FDM, expert: true})
            polishLayers: LOCAL ? UC.newInput("polish layers", {title:"polish up to specified\n# of layers at a time", bound:UC.bound(0,10), convert:UC.toFloat, modes:FDM, expert: true}) : null,
            polishSpeed: LOCAL ? UC.newInput("polish speed", {title:"polishing speed\nin millimeters / minute", bound:UC.bound(10,2000), convert:UC.toInt, modes:FDM, expert: true}) : null,
            outputLayerRetract: UC.newBoolean("layer retract", onBooleanClick, {title:"force filament retraction\nbetween layers", modes:FDM, expert: true}),

            gcodeVars: UC.newGroup("gcode", null, {modes:FDM, expert: true}),
            gcodeNozzle: UC.newInput("nozzle", {title: "select output nozzle", convert:UC.toInt, modes:FDM, expert: true}),
            gcodePauseLayers: UC.newInput("pause layers", {title: "comma-separated list of layers\nto inject pause commands before", modes:FDM, expert: true})
        });

        function toolUpdate(a,b,c) {
            DBUG.log(['toolUpdate',a,b,c])
        }

        function booleanSave() {
            let current = settings();
            current.controller.showOrigin = UI.showOrigin.checked;
            current.controller.autoLayout = UI.autoLayout.checked;
            current.controller.freeLayout = UI.freeLayout.checked;
            current.controller.alignTop = UI.alignTop.checked;
            current.controller.reverseZoom = UI.reverseZoom.checked;
            SPACE.view.setZoom(current.controller.reverseZoom, current.controller.zoomSpeed);
            platform.layout();
            platform.update_stock();
            API.conf.save();
        }

        function onLayerToggle() {
            API.conf.update();
            API.show.slices();
        }

        function onBooleanClick() {
            API.conf.update();
            DOC.activeElement.blur();
        }

        function inputHasFocus() {
            let active = DOC.activeElement;
            return active && (active.nodeName === "INPUT" || active.nodeName === "TEXTAREA");
        }

        function inputTextOK() {
            return DOC.activeElement === UI.deviceName;
        }

        function textAreaHasFocus() {
            let active = DOC.activeElement;
            return active && active.nodeName === "TEXTAREA";
        }

        function inputSize() {
            return parseInt(DOC.activeElement.size);
        }

        function cca(c) {
            return c.charCodeAt(0);
        }

        function keyUpHandler(evt) {
            switch (evt.keyCode) {
                // escape
                case 27:
                    // blur text input focus
                    DOC.activeElement.blur();
                    // dismiss modals
                    API.modal.hide();
                    // deselect widgets
                    platform.deselect();
                    // hide all dialogs
                    API.dialog.hide();
                    // cancel slicing
                    if (KIRI.work.isSlicing()) KIRI.work.restart();
                    break;
            }
            return false;
        }

        function keyDownHandler(evt) {
            if (API.modal.visible()) {
                return false;
            }
            let move = evt.altKey ? 5 : 0,
                deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);
            switch (evt.keyCode) {
                case 8: // apple: delete/backspace
                case 46: // others: delete
                    if (inputHasFocus()) return false;
                    platform.delete(API.selection.meshes());
                    evt.preventDefault();
                    break;
                case 37: // left arrow
                    if (inputHasFocus()) return false;
                    if (deg) API.selection.rotate(0, 0, -deg);
                    if (move > 0) moveSelection(-move, 0, 0);
                    evt.preventDefault();
                    break;
                case 39: // right arrow
                    if (inputHasFocus()) return false;
                    if (deg) API.selection.rotate(0, 0, deg);
                    if (move > 0) moveSelection(move, 0, 0);
                    evt.preventDefault();
                    break;
                case 38: // up arrow
                    if (inputHasFocus()) return false;
                    if (evt.metaKey) return API.show.layer(API.var.layer_at+1);
                    if (deg) API.selection.rotate(deg, 0, 0);
                    if (move > 0) moveSelection(0, move, 0);
                    evt.preventDefault();
                    break;
                case 40: // down arrow
                    if (inputHasFocus()) return false;
                    if (evt.metaKey) return API.show.layer(API.var.layer_at-1);
                    if (deg) API.selection.rotate(-deg, 0, 0);
                    if (move > 0) moveSelection(0, -move, 0);
                    evt.preventDefault();
                    break;
                case 65: // 'a' for select all
                    if (evt.metaKey) {
                        if (inputHasFocus()) return false;
                        evt.preventDefault();
                        platform.deselect();
                        platform.select_all();
                    }
                    break;
                case 83: // 's' for save workspace
                    if (evt.ctrlKey) {
                        evt.preventDefault();
                        API.conf.save();
                        log("settings saved");
                    } else
                    if (evt.metaKey) {
                        evt.preventDefault();
                        API.space.save();
                    }
                    break;
                case 76: // 'l' for restore workspace
                    if (evt.metaKey) {
                        evt.preventDefault();
                        API.space.restore();
                    }
                    break;
            }
        }

        function keyHandler(evt) {
            let handled = true,
                current = settings(),
                style, sel, i, m, bb,
                ncc = evt.charCode - 48;
            if (API.modal.visible() || inputHasFocus()) {
                return false;
            }
            switch (evt.charCode) {
                case cca('`'): API.show.slices(0); break;
                case cca('0'): API.show.slices(API.var.layer_max); break;
                case cca('1'): // toggle control left
                    if (evt.ctrlKey) {
                        style = UI.ctrlLeft.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        API.show.slices(API.var.layer_max/10);
                    }
                    break;
                case cca('2'): // toggle control right
                    if (evt.ctrlKey) {
                        style = UI.ctrlRight.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        API.show.slices(API.var.layer_max*2/10);
                    }
                    break;
                case cca('3'):
                    if (evt.ctrlKey) {
                        style = !SPACE.platform.isHidden();
                        SPACE.platform.setHidden(style);
                        SPACE.platform.showGrid(!style);
                        SPACE.update();
                    } else {
                        API.show.slices(API.var.layer_max*3/10);
                    }
                    break;
                case cca('4'): API.show.slices(API.var.layer_max*4/10); break;
                case cca('5'): API.show.slices(API.var.layer_max*5/10); break;
                case cca('6'): API.show.slices(API.var.layer_max*6/10); break;
                case cca('7'): API.show.slices(API.var.layer_max*7/10); break;
                case cca('8'): API.show.slices(API.var.layer_max*8/10); break;
                case cca('9'): API.show.slices(API.var.layer_max*9/10); break;
                case cca('?'):
                    API.help.show();
                    break;
                case cca('Z'): // reset stored state
                    if (confirm('clear all settings?')) {
                        SDB.clear();
                    }
                    break;
                case cca('C'): // refresh catalog
                    CATALOG.refresh();
                    break;
                case cca('i'): // single settings edit
                    let v = prompt('edit "'+current.process.processName+'"', JSON.stringify(current.process));
                    if (v) {
                        try {
                            current.process = JSON.parse(v);
                            API.view.update_fields();
                        } catch (e) {
                            console.log(e);
                            API.show.alert("invalid settings format");
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
                    API.function.slice();
                    break;
                case cca('p'): // prepare print
                    API.function.print();
                    break;
                case cca('P'): // position widget
                    positionSelection();
                    break;
                case cca('R'): // position widget
                    rotateInputSelection();
                    break;
                case cca('x'): // export print
                    API.function.export();
                    break;
                case cca('e'): // devices
                    showDevices();
                    break;
                case cca('o'): // tools
                    showTools();
                    break;
                case cca('c'): // local devices
                    API.show.local();
                    break;
                case cca('v'): // toggle single slice view mode
                    UI.layerRange.checked = !UI.layerRange.checked;
                    API.show.slices();
                    break;
                case cca('d'): // duplicate object
                    sel = API.selection.meshes();
                    platform.deselect();
                    for (i=0; i<sel.length; i++) {
                        m = sel[i].clone();
                        m.geometry = m.geometry.clone();
                        m.material = m.material.clone();
                        bb = m.getBoundingBox();
                        let nw = API.widgets.new().loadGeometry(m.geometry);
                        nw.move(bb.max.x - bb.min.x + 1, 0, 0);
                        platform.add(nw,true);
                    }
                    break;
                case cca('m'): // mirror object
                    API.selection.for_widgets(function(widget) {
                        widget.mirror();
                    });
                    SPACE.update();
                    break;
                case cca('R'): // toggle slice render mode
                    renderMode++;
                    API.function.slice();
                    break;
                case cca('a'): // auto arrange items on platform
                    platform.layout();
                    break;
                case cca('w'): // toggle wireframe on widgets
                    API.view.wireframe(API.color.wireframe, API.opacity.wireframe);
                    break;
                default:
                    API.event.emit('keypress', evt);
                    handled = false;
                    break;
            }
            if (handled) evt.preventDefault();
            return false;
        }

        function keys(o) {
            let key, list = [];
            for (key in o) { if (o.hasOwnProperty(key)) list.push(key) }
            return list.sort();
        }

        function clearSelected(children) {
            for (let i=0; i<children.length; i++) {
                children[i].setAttribute('class','');
            }
        }

        function rotateInputSelection() {
            if (API.selection.meshes().length === 0) {
                API.show.alert("select object to rotate");
                return;
            }
            let coord = prompt("Enter X,Y,Z degrees of rotation").split(','),
                prod = Math.PI / 360,
                x = parseFloat(coord[0] || 0.0) * prod,
                y = parseFloat(coord[1] || 0.0) * prod,
                z = parseFloat(coord[2] || 0.0) * prod;

            API.selection.rotate(x, y, z);
        }

        function positionSelection() {
            if (API.selection.meshes().length === 0) {
                API.show.alert("select object to position");
                return;
            }
            let current = settings(),
                center = current.process.outputOriginCenter,
                bounds = boundsSelection(),
                coord = prompt("Enter X,Y coordinates for selection").split(','),
                x = parseFloat(coord[0] || 0.0),
                y = parseFloat(coord[1] || 0.0),
                z = parseFloat(coord[2] || 0.0);

            if (!center) {
                x = x - current.device.bedWidth/2 + (bounds.max.x - bounds.min.x)/2;
                y = y - current.device.bedDepth/2 + (bounds.max.y - bounds.min.y)/2
            }

            moveSelection(x, y, z, true);
        }

        function loadSettingsFromServer(tok) {
            let hash = (tok || LOC.hash.substring(1)).split("/");
            if (hash.length === 2) {
                new moto.Ajax(function(reply) {
                    if (reply) {
                        let res = JSON.parse(reply);
                        if (res && res.ver && res.rec) {
                            let set = JSON.parse(atob(res.rec));
                            set.id = res.space;
                            set.ver = res.ver;
                            API.conf.put(set);
                            API.event.settings();
                            LOC.hash = '';
                        }
                    }
                }).request("/data/"+ hash[0] + "/" + hash[1]);
            }
        }

        function storeSettingsToServer(display) {
            let set = btoa(JSON.stringify(settings()));
            new moto.Ajax(function(reply) {
                if (reply) {
                    let res = JSON.parse(reply);
                    if (res && res.ver) {
                        LOC.hash = res.space + "/" + res.ver;
                        if (display) alert("unique settings id is: " + res.space + "/" + res.ver);
                    }
                } else {
                    updateSpaceState();
                }
            }).request("/data/"+ settings().id + "/" + settings().ver, set);
        }

        function settingsSave() {
            API.dialog.hide();
            let mode = API.mode.get(),
                s = settings(),
                def = "default",
                cp = s.process,
                pl = s.sproc[mode],
                // pt = sf[mode.toLowerCase()].p, // process field mask
                name = WIN.prompt("Save Settings As", cp ? cp.processName || def : def);
            if (!name) return;
            let np = pl[name] = {};
            cp.processName = name;
            for (let k in cp) {
                if (!cp.hasOwnProperty(k)) continue;
                // if (!pt.hasOwnProperty(k)) continue; // mask out invalid fields
                np[k] = cp[k];
            }
            s.cproc[API.mode.get()] = name;
            API.conf.save();
            API.event.settings();
        }

        function settingsLoad() {
            API.conf.show();
        }

        function putLocalDevice(devicename, code) {
            settings().devices[devicename] = code;
            API.conf.save();
        }

        function removeLocalDevice(devicename) {
            delete settings().devices[devicename];
            API.conf.save();
        }

        function isLocalDevice(devicename) {
            return settings().devices[devicename] ? true : false;
            // return localFilters.contains(devicename);
        }

        function isFavoriteDevice(devicename) {
            return settings().favorites[devicename] ? true : false;
        }

        function getSelectedDevice() {
            return UI.deviceSelect.options[UI.deviceSelect.selectedIndex].text;
        }

        function selectDevice(devicename, lock) {
            deviceLock = lock;
            if (lock) UI.setupDevices.style.display = 'none';
            if (isLocalDevice(devicename)) {
                setDeviceCode(settings().devices[devicename], devicename);
            } else {
                API.ajax("/kiri/filter/"+API.mode.get()+"/"+devicename, function(code) {
                    setDeviceCode(code, devicename);
                });
            }
            $('selected-device').innerHTML = devicename;
        }

        function valueOf(val, dv) {
            return typeof(val) !== 'undefined' ? val : dv;
        }

        // only for local filters
        function updateDeviceCode(override) {
            let oldname = getSelectedDevice(),
                newname = override || UI.deviceName.value,
                code = {
                    mode: API.mode.get(),
                    settings: {
                        bed_width: parseInt(UI.setDeviceWidth.value) || 300,
                        bed_depth: parseInt(UI.setDeviceDepth.value) || 175,
                        bed_circle: UI.setDeviceRound.checked,
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
                    'laser-on': UI.setDeviceLaserOn.value.split('\n'),
                    'laser-off': UI.setDeviceLaserOff.value.split('\n'),
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
                STATS.set(`ud_${API.mode.get_lower()}`, devicename);

                if (typeof(code) === 'string') code = js2o(code) || {};

                let cmd = code.cmd || {},
                    set = code.settings || {},
                    local = isLocalDevice(devicename),
                    current = settings(),
                    dproc = current.devproc[devicename],
                    mode = API.mode.get();

                current.device = {
                    bedHeight: 2.5,
                    bedWidth: valueOf(set.bed_width, 300),
                    bedDepth: valueOf(set.bed_depth, 175),
                    bedRound: valueOf(set.bed_circle, false),
                    maxHeight: valueOf(set.build_height, 150),
                    nozzleSize: valueOf(set.nozzle_size, 0.4),
                    filamentSize: valueOf(set.filament_diameter, 1.75),
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
                    gcodeLaserOff: valueOf(code['laser-off'], [])
                };

                let dev = current.device,
                    proc = current.process;

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
                UI.setDeviceRound.checked = dev.bedRound;
                UI.setDeviceOrigin.checked = proc.outputOriginCenter;
                // FDM
                UI.setDeviceFan.value = dev.gcodeFan;
                UI.setDeviceTrack.value = dev.gcodeTrack;
                UI.setDeviceLayer.value = dev.gcodeLayer.join('\n');
                UI.setDeviceFilament.value = dev.filamentSize;
                UI.setDeviceNozzle.value = dev.nozzleSize;
                UI.setDeviceExtrusion.checked = dev.extrudeAbs;
                // CAM
                UI.setDeviceMaxSpindle.value = dev.spindleMax;
                UI.setDeviceSpindle.value = dev.gcodeSpindle.join('\n');
                UI.setDeviceDwell.value = dev.gcodeDwell.join('\n');
                UI.setDeviceChange.value = dev.gcodeChange.join('\n');
                UI.setDeviceFExt.value = dev.gcodeFExt;
                UI.setDeviceToken.checked = dev.gcodeSpace ? true : false;
                UI.setDeviceStrip.checked = dev.gcodeStrip;
                // LASER
                UI.setDeviceLaserOn.value = dev.gcodeLaserOn.join('\n');
                UI.setDeviceLaserOff.value = dev.gcodeLaserOff.join('\n');

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
                 UI.setDeviceRound,
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
                 UI.setDeviceStrip,
                 UI.setDeviceLaserOn,
                 UI.setDeviceLaserOff
                ].forEach(function(e) {
                    e.disabled = !local;
                });

                // hide spindle fields when device doens't support it
                if (mode === 'CAM')
                [
                 UI.setDeviceExtrusion,
                 UI.roughingSpindle,
                 UI.finishingSpindle,
                 UI.drillSpindle
                ].forEach(function(e) {
                 e.parentNode.style.display = dev.spindleMax >= 0 ? 'none' : 'block';
                });

                UI.deviceSave.disabled = !local;
                UI.deviceDelete.disabled = !local;

                API.view.update_fields();
                platform.update_size();

                current.filter[mode] = devicename;
                current.cdev[mode] = dev;

                // restore last process associated with this device
                if (dproc) API.conf.load(null, dproc);

                API.conf.save();
            } catch (e) {
                console.log({error:e, device:code});
                // API.show.alert("invalid or deprecated device. please select a new device.");
                showDevices();
            }
            API.function.clear();
            API.event.settings();
        }

        function renderDevices(devices) {
            UI.devices.onclick = UC.hidePop;
            UC.hidePop();

            let selectedIndex = -1,
                selected = API.device.get(),
                devs = settings().devices;

            for (let local in devs) {
                if (!(devs.hasOwnProperty(local) && devs[local])) {
                    continue;
                }
                let dev = devs[local],
                    fdmCode = dev.cmd,
                    fdmMode = (API.mode.get() === 'FDM');

                if (dev.mode ? (dev.mode === API.mode.get()) : (fdmCode ? fdmMode : !fdmMode)) {
                    devices.push(local);
                }
            };

            devices = devices.sort();

            UI.deviceClose.onclick = API.dialog.hide;
            UI.deviceSave.onclick = function() {
                API.function.clear();
                updateDeviceCode();
                API.conf.save();
                showDevices();
            };
            UI.deviceAdd.onclick = function() {
                API.function.clear();
                updateDeviceCode(getSelectedDevice()+".copy");
                showDevices();
            };
            UI.deviceDelete.onclick = function() {
                API.function.clear();
                removeLocalDevice(getSelectedDevice());
                showDevices();
            };

            UI.deviceAll.onclick = function() {
                API.show.favorites(false);
                showDevices();
            };
            UI.deviceFavorites.onclick = function() {
                API.show.favorites(true);
                showDevices();
            };

            UI.deviceSelect.innerHTML = '';
            let incr = 0;
            let faves = API.show.favorites();
            let found = false;
            let first = devices[0];
            // run through the list up to twice forcing faves off
            // the second time if incr === 0 (no devices shown)
            // if incr > 0, second loop is avoided
            for (let rep=0; rep<2; rep++)
            if (incr === 0)
            devices.forEach(function(device, index) {
                // force faves off for second try
                if (rep === 1) faves = false;
                let fav = isFavoriteDevice(device),
                    loc = isLocalDevice(device);
                if (faves && !(fav || loc)) {
                    return;
                }
                if (incr === 0) {
                    first = device;
                }
                let opt = DOC.createElement('option');
                opt.appendChild(DOC.createTextNode(device));
                opt.onclick = function() {
                    selectDevice(device);
                };
                opt.ondblclick = function() {
                    if (settings().favorites[device]) {
                        delete settings().favorites[device];
                        API.show.alert(`removed "${device}" from favorites`, 3);
                    } else {
                        settings().favorites[device] = true;
                        API.show.alert(`added "${device}" to favorites`, 3);
                    }
                    showDevices();
                };
                if (API.show.favorites()) {
                    if (loc) opt.setAttribute("local", 1);
                } else {
                    if (fav) opt.setAttribute("favorite", 1);
                }
                UI.deviceSelect.appendChild(opt);
                if (device === selected) {
                    selectedIndex = incr;
                    found = true;
                }
                incr++;
            });

            if (selectedIndex >= 0) {
                UI.deviceSelect.selectedIndex = selectedIndex;
                selectDevice(selected);
            } else {
                UI.deviceSelect.selectedIndex = 0;
                selectDevice(first);
            }

            API.dialog.show('devices', true);
            API.dialog.update();

            UI.deviceSelect.focus();
        }

        function renderTools() {
            UI.toolSelect.innerHTML = '';
            maxTool = 0;
            editTools.forEach(function(tool, index) {
                maxTool = Math.max(maxTool, tool.number);
                tool.order = index;
                let opt = DOC.createElement('option');
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
            // UI.toolTaperAngle.value = tool.taper_angle || 70;
            UI.toolTaperTip.value = tool.taper_tip || 0;
            UI.toolMetric.checked = tool.metric;
            UI.toolType.selectedIndex = ['endmill','ballmill','tapermill'].indexOf(tool.type);
            renderTool(tool);
        }

        function otag(o) {
            if (Array.isArray(o)) {
                let out = []
                o.forEach(oe => out.push(otag(oe)));
                return out.join('');
            }
            let tags = [];
            Object.keys(o).forEach(key => {
                let val = o[key];
                let att = [];
                Object.keys(val).forEach(tk => {
                    let tv = val[tk];
                    att.push(`${tk.replace(/_/g,'-')}="${tv}"`);
                });
                tags.push(`<${key} ${att.join(' ')}></${key}>`);
            });
            return tags.join('');
        }

        function renderTool(tool) {
            let type = selectedTool.type;
            let taper = type === 'tapermill';
            // UI.toolTaperAngle.disabled = taper ? undefined : 'true';
            UI.toolTaperTip.disabled = taper ? undefined : 'true';
            $('tool-view').innerHTML = '<svg id="tool-svg" width="100%" height="100%"></svg>';
            setTimeout(() => {
                let svg = $('tool-svg');
                let pad = 10;
                let dim = { w: svg.clientWidth, h: svg.clientHeight }
                let max = { w: dim.w - pad * 2, h: dim.h - pad * 2};
                let off = { x: pad, y: pad };
                let shaft_fill = "#cccccc";
                let flute_fill = "#dddddd";
                let stroke = "#777777";
                let stroke_width = 3;
                let shaft = tool.shaft_len || 1;
                let flute = tool.flute_len || 1;
                let tip_len = type === "ballmill" ? tool.flute_diam / 2 : 0;
                let total_len = shaft + flute + tip_len;
                let shaft_len = (shaft / total_len) * max.h;
                let flute_len = (flute / total_len) * max.h;
                let total_wid = Math.max(tool.flute_diam, tool.shaft_diam, total_len/4);
                let shaft_off = (max.w * (1 - (tool.shaft_diam / total_wid))) / 2;
                let flute_off = (max.w * (1 - (tool.flute_diam / total_wid))) / 2;
                let taper_off = (max.w * (1 - ((tool.taper_tip || 0) / total_wid))) / 2;
                let parts = [
                    { rect: {
                        x:off.x + shaft_off, y:off.y,
                        width:max.w - shaft_off * 2, height:shaft_len,
                        stroke, fill: shaft_fill, stroke_width
                    } }
                ];
                if (type === "tapermill") {
                    let yoff = off.y + shaft_len;
                    let mid = dim.w / 2;
                    parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                        `M ${off.x + flute_off} ${yoff}`,
                        `L ${off.x + taper_off} ${yoff + flute_len}`,
                        `L ${dim.w - off.x - taper_off} ${yoff + flute_len}`,
                        `L ${dim.w - off.x - flute_off} ${yoff}`,
                        `z`
                    ].join('\n')}});
                } else {
                    parts.push({ rect: {
                        x:off.x + flute_off, y:off.y + shaft_len,
                        width:max.w - flute_off * 2, height:flute_len,
                        stroke, fill: flute_fill, stroke_width
                    } });
                }
                if (type === "ballmill") {
                    let rad = (max.w - flute_off * 2) / 2;
                    let xend = dim.w - off.x - flute_off;
                    let yoff = off.y + shaft_len + flute_len + stroke_width/2;
                    parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                        `M ${off.x + flute_off} ${yoff}`,
                        `A ${rad} ${rad} 0 0 0 ${xend} ${yoff}`,
                        // `L ${off.x + flute_off} ${yoff}`
                    ].join('\n')}})
                }
                svg.innerHTML = otag(parts);
            }, 10);
        }

        function updateTool() {
            selectedTool.name = UI.toolName.value;
            selectedTool.number = parseInt(UI.toolNum.value);
            selectedTool.flute_diam = parseFloat(UI.toolFluteDiam.value);
            selectedTool.flute_len = parseFloat(UI.toolFluteLen.value);
            selectedTool.shaft_diam = parseFloat(UI.toolShaftDiam.value);
            selectedTool.shaft_len = parseFloat(UI.toolShaftLen.value);
            // selectedTool.taper_angle = parseFloat(UI.toolTaperAngle.value);
            selectedTool.taper_tip = parseFloat(UI.toolTaperTip.value);
            selectedTool.metric = UI.toolMetric.checked;
            selectedTool.type = ['endmill','ballmill','tapermill'][UI.toolType.selectedIndex];
            renderTools();
            UI.toolSelect.selectedIndex = selectedTool.order;
            setToolChanged(true);
            renderTool(selectedTool);
        }

        function setToolChanged(changed) {
            editTools.changed = changed;
            UI.toolsSave.disabled = !changed;
        }

        function showTools() {
            if (API.mode.get_id() !== MODES.CAM) return;

            let selectedIndex = null;

            editTools = settings().tools.slice().sort((a,b) => {
                return a.name > b.name ? 1 : -1;
            });

            setToolChanged(false);

            UI.toolsClose.onclick = function() {
                if (editTools.changed && !confirm("abandon changes?")) return;
                API.dialog.hide();
            };
            UI.toolAdd.onclick = function() {
                editTools.push({
                    id: Date.now(),
                    number: maxTool + 1,
                    name: "new",
                    type: "endmill",
                    shaft_diam: 0.25,
                    shaft_len: 1,
                    flute_diam: 0.25,
                    flute_len: 2,
                    // taper_angle: 70,
                    taper_tip: 0,
                    metric: false
                });
                setToolChanged(true);
                renderTools();
                UI.toolSelect.selectedIndex = editTools.length-1;
                selectTool(editTools[editTools.length-1]);
            };
            UI.toolDelete.onclick = function() {
                editTools.remove(selectedTool);
                setToolChanged(true);
                renderTools();
            };
            UI.toolsSave.onclick = function() {
                if (selectedTool) updateTool();
                settings().tools = editTools.sort((a,b) => {
                    return a.name < b.name ? -1 : 1;
                });
                setToolChanged(false);
                API.conf.save();
                API.view.update_fields();
                API.event.settings();
            };

            renderTools();
            if (editTools.length > 0) {
                selectTool(editTools[0]);
                UI.toolSelect.selectedIndex = 0;
            } else {
                UI.toolAdd.onclick();
            }

            API.dialog.show('tools');
            UI.toolSelect.focus();

            STATS.add('ua_get_tools');
        }

        function showDevices() {
            if (deviceLock) return;
            API.modal.hide();
            API.ajax("/api/filters-"+API.mode.get_lower(), function(flvalue) {
                if (!flvalue) return;
                renderDevices(js2o(flvalue));
                STATS.add('ua_get_devs');
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

            let files = evt.dataTransfer.files,
                plate = files.length < 5 || confirm(`add ${files.length} objects to workspace?`);

            if (plate) API.platform.load_files(files);
        }

        function loadCatalogFile(e) {
            API.widgets.load(e.target.getAttribute('load'), function(widget) {
                platform.add(widget);
                API.dialog.hide();
            });
        }

        function deleteCatalogFile(e) {
            CATALOG.deleteFile(e.target.getAttribute('del'));
        }

        function updateCatalog(files) {
            let table = UI.catalogList,
                list = [];
            table.innerHTML = '';
            for (let name in files) {
                list.push({n:name, ln:name.toLowerCase(), v:files[name].vertices, t:files[name].updated});
            }
            list.sort(function(a,b) {
                return a.ln < b.ln ? -1 : 1;
            });
            for (let i=0; i<list.length; i++) {
                let row = DOC.createElement('div'),
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
            // fix layer scroll size
            API.dialog.update();
        }

        SPACE.addEventHandlers(self, [
            'keyup', keyUpHandler,
            'keydown', keyDownHandler,
            'keypress', keyHandler,
            'dragover', dragOverHandler,
            'dragleave', dragLeave,
            'drop', dropHandler
        ]);

        SPACE.onEnterKey([
            UI.layerSpan,    function() { API.show.slices() },
            UI.layerID,      function() { API.show.layer(UI.layerID.value) },

            UI.scaleX,           selection.scale,
            UI.scaleY,           selection.scale,
            UI.scaleZ,           selection.scale,

            UI.toolName,         updateTool,
            UI.toolNum,          updateTool,
            UI.toolFluteDiam,    updateTool,
            UI.toolFluteLen,     updateTool,
            UI.toolShaftDiam,    updateTool,
            UI.toolShaftLen,     updateTool,
            // UI.toolTaperAngle,   updateTool,
            UI.toolTaperTip,     updateTool,
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
            API.show.slices();
        };

        $('layer-toggle').onclick = function(ev) {
            let ls = UI.layers.style;
            ls.display = ls.display !== 'block' ? 'block' : 'none';
            UI.layers.style.left = ev.target.getBoundingClientRect().left + 'px';
        };

        $('x-').onclick = function(ev) { API.selection.rotate(ev.shiftKey ? -ROT5 : -ROT,0,0) };
        $('x+').onclick = function(ev) { API.selection.rotate(ev.shiftKey ? ROT5 : ROT,0,0) };
        $('y-').onclick = function(ev) { API.selection.rotate(0,ev.shiftKey ? -ROT5 : -ROT,0) };
        $('y+').onclick = function(ev) { API.selection.rotate(0,ev.shiftKey ? ROT5 : ROT,0) };
        $('z-').onclick = function(ev) { API.selection.rotate(0,0,ev.shiftKey ? ROT5 : ROT) };
        $('z+').onclick = function(ev) { API.selection.rotate(0,0,ev.shiftKey ? -ROT5 : -ROT) };

        UI.modelOpacity.onchange = UI.modelOpacity.onclick = function(ev) {
            API.widgets.opacity(parseInt(UI.modelOpacity.value)/100);
        };

        UI.layerSlider.ondblclick = function() {
            UI.layerRange.checked = !UI.layerRange.checked;
            API.show.slices();
        };

        UI.layerSlider.onmousedown = function(ev) {
            if (ev.shiftKey) UI.layerRange.checked = !UI.layerRange.checked;
        };

        UI.layerSlider.onclick = function() {
            API.show.layer(UI.layerSlider.value);
        };

        UI.layerSlider.onmousemove = UI.layerSlider.onchange = function() {
            API.show.layer(UI.layerSlider.value);
        };

        UI.layerSlider.onmouseup = function() { API.focus() };

        UI.import.setAttribute("import","1");
        UI.import.onclick = function() {
            API.dialog.show("catalog");
        };

        UI.toolMetric.onclick = updateTool;
        UI.toolType.onchange = updateTool;

        $('kiri').onclick = API.help.show;

        SPACE.platform.setSize(
            settings().device.bedWidth,
            settings().device.bedDepth,
            settings().device.bedHeight
        );

        SPACE.platform.setGrid(25, 5);
        SPACE.platform.opacity(0.2);

        SPACE.mouse.downSelect(function() {
            if (API.view.get() !== VIEWS.ARRANGE) return null;
            return API.selection.meshes();
        });

        SPACE.mouse.upSelect(function(selection, event) {
            if (event && event.target.nodeName === "CANVAS") {
                if (selection) {
                    platform.select(selection.object.widget, event.shiftKey);
                } else {
                    platform.deselect();
                }
            } else {
                return API.widgets.meshes();
            }
        });

        SPACE.mouse.onDrag(function(delta) {
            if (delta && UI.freeLayout.checked) {
                API.selection.for_widgets(function(widget) {
                    widget.move(delta.x, delta.y, 0);
                });
                platform.update_stock();
            } else {
                return API.selection.meshes().length > 0;
            }
        });

        function checkSeed(ondone) {
            // skip sample object load in onshape (or any script postload)
            if (!SDB[SEED]) {
                SDB[SEED] = new Date().getTime();
                if (!SETUP.s) {
                    platform.load_stl("/obj/cube.stl", function(vert) {
                        CATALOG.putFile("sample cube.stl", vert);
                        platform.compute_max_z();
                        SPACE.view.home();
                        setTimeout(API.space.save,500);
                        ondone();
                        API.help.show();
                    });
                    return true;
                }
            }
            return false;
        }

        function ondone() {
            let current = settings();

            platform.deselect();
            CATALOG.addFileListener(updateCatalog);
            SPACE.view.setZoom(current.controller.reverseZoom, current.controller.zoomSpeed);
            SPACE.platform.setZOff(0.2);

            // restore UI state from settings
            UI.showOrigin.checked = current.controller.showOrigin;
            UI.freeLayout.checked = current.controller.freeLayout;
            UI.autoLayout.checked = current.controller.autoLayout;
            UI.alignTop.checked = current.controller.alignTop;

            // load script extensions
            if (SETUP.s) SETUP.s.forEach(function(lib) {
                let scr = DOC.createElement('script');
                scr.setAttribute('async',true);
                scr.setAttribute('src','/code/'+lib+'.js');
                DOC.body.appendChild(scr);
                STATS.add('load_'+lib);
            });

            // load CSS extensions
            if (SETUP.ss) SETUP.ss.forEach(function(style) {
                let ss = DOC.createElement('link');
                ss.setAttribute("type", "text/css");
                ss.setAttribute("rel", "stylesheet");
                ss.setAttribute("href", "/kiri/style-"+style+".css");
                DOC.body.appendChild(ss);
            });

            // override stored settings
            if (SETUP.v) SETUP.v.forEach(function(kv) {
                kv = kv.split('=');
                SDB.setItem(kv[0],kv[1]);
            });

            // import octoprint settings
            if (SETUP.ophost) {
                let ohost = API.const.OCTO = {
                    host: SETUP.ophost[0],
                    apik: SETUP.opkey ? SETUP.opkey[0] : ''
                };
                SDB['octo-host'] = ohost.host;
                SDB['octo-apik'] = ohost.apik;
                console.log({octoprint:ohost});
            }

            // optional set-and-lock mode (hides mode menu)
            let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

            // optional set-and-lock device (hides device menu)
            let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

            API.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);
            API.show.controls(true);
            platform.update_size();
            API.focus();

            if (STATS.get('upgrade')) DBUG.log("kiri | version upgrade");
            STATS.del('upgrade');

            if (!SETUP.s) console.log(`kiri | init main | ${KIRI.version}`);

            // place version number a couple of places to help users
            UI.helpButton.title = `${LANG.version} ` + KIRI.version;

            // restore expert setting preference
            UC.setExpert(SDB.getItem('expert') ? true : false);

            // setup tab visibility watcher
            // DOC.addEventListener('visibilitychange', function() { document.title = document.hidden });

            // ensure settings has gcode
            selectDevice(DEVNAME || API.device.get(), DEVNAME);

            // ensure field data propagation
            API.conf.update();

            // set initial layer slider size
            API.dialog.update();

            // send init-done event
            API.event.emit('init-done', STATS);

            // load settings provided in url hash
            loadSettingsFromServer();

            // clear alerts as they build up
            setInterval(API.event.alerts, 1000);

            UI.alert.dialog.onclick = function() {
                API.event.alerts(true);
            };

            API.view.set(VIEWS.ARRANGE);
        }

        API.space.restore(ondone) || checkSeed(ondone) || ondone();

        // extend API
        API.show.devices = showDevices;
    };

})();
