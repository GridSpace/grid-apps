/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { beta, version } from '../../moto/license.js';
import { fileOps } from './file-ops.js';
import { init as initCAM } from '../mode/cam/init-ui.js';
import { init as initDRAG } from '../mode/drag/init-ui.js';
import { init as initFDM } from '../mode/fdm/init-ui.js';
import { init as initLaser } from '../mode/laser/init-ui.js';
import { init as initSLA } from '../mode/sla/init-ui.js';
import { init as initWEDM } from '../mode/wedm/init-ui.js';
import { init as initWJET } from '../mode/wjet/init-ui.js';
import { interact } from './interact.js';
import { keyboard } from './keyboard.js';
import { local as sdb } from '../../data/local.js';
import { menu as menuCAM } from '../mode/cam/init-menu.js';
import { menu as menuFDM } from '../mode/fdm/init-menu.js';
import { menu as menuLaser } from '../mode/laser/init-menu.js';
import { menu as menuSLA } from '../mode/sla/init-menu.js';
import { modal } from './modal.js';
import { navigation } from './navigation.js';
import { preferences } from './preferences.js';
import { selectionTools } from './selection-tools.js';
import { settings as set_ctrl } from './config/manager.js';
import { settingsOps } from './settings-ops.js';
import { slider } from './slider.js';
import { space } from '../../moto/space.js';
import { VIEWS, MODES, SEED } from '../core/consts.js';

import STACKS from './stacks.js';

let { LOCAL, SETUP } = api,
    { CAM, SLA, FDM, LASER, DRAG, WJET, WEDM } = MODES,
    { client, catalog, platform, selection, stats } = api,
    LANG = api.language.current,
    WIN = self.window,
    DOC = self.document,
    STARTMODE = SETUP.sm && SETUP.sm.length === 1 ? SETUP.sm[0] : null,
    TWOD    = [ LASER, DRAG, WJET, WEDM ],
    TWONED  = [ LASER, DRAG, WJET ],
    THREED  = [ FDM, CAM, SLA ],
    GCODE   = [ FDM, CAM, ...TWOD ],
    CAM_LZR = [ CAM, ...TWOD ],
    FDM_LZN = [ FDM, ...TWONED ],
    NO_WEDM = [ FDM, CAM, SLA, LASER, DRAG, WJET ],
    FDM_CAM = [ FDM, CAM ],
    proto = location.protocol,
    platformColor,
    statsTimer,
    inline = true,
    driven = true,
    trigger = true,
    units = true,
    ui = api.ui,
    uc = api.uc;

function settings() {
    return api.conf.get();
}

function updateTool(ev) {
    api.tool.update(ev);
}

function checkSeed(then) {
    // skip sample object load in onshape (or any script postload)
    if (!sdb[SEED]) {
        sdb[SEED] = new Date().getTime();
        if (!SETUP.s && api.feature.seed) {
            if (SETUP.debug) {
                return then();
            }
            platform.load_stl("/obj/cube.stl", function(vert) {
                catalog.putFile("sample cube.stl", vert);
                platform.update_bounds();
                space.view.home();
                setTimeout(() => { api.space.save(true) },500);
                then();
                api.help.show();
            });
            return true;
        }
    }
    return false;
}

// upon restore, seed presets
api.event.emit('preset', api.conf.dbo());

// api.event.on("set.threaded", bool => setThreaded(bool));

function onBooleanClick(el) {
    // copy some ui elements to target settings
    let settings = api.conf.get();
    settings.device.bedBelt = ui.deviceBelt.checked && api.mode.is_fdm();
    settings.device.bedRound = ui.deviceRound.checked && api.mode.is_fdm();
    settings.device.originCenter = ui.deviceOrigin.checked || ui.deviceRound.checked;
    settings.device.fwRetract = ui.fwRetract.checked;
    // refresh vars and other ui elements
    uc.refresh();
    if (el === ui.camStockIndexed) {
        api.view.set_arrange();
    }
    api.conf.update();
    DOC.activeElement.blur();
    api.event.emit("boolean.click");
    api.devices.update_laser_state();
}

api.event.on('click.boolean', onBooleanClick);

function onButtonClick(ev) {
    let target = ev.target;
    while (target && target.tagName !== 'BUTTON') {
        target = target.parentNode;
    }
    api.event.emit("button.click", target);
}

api.event.on('click.button', onButtonClick);

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

function isBelt() {
    return api.device.isBelt();
}

function isNotBelt() {
    return !isBelt();
}

// MAIN INITIALIZATION FUNCTION
function init_one() {
    let { event, conf, view, show } = api,
        { newBlank, newButton, newBoolean, newGroup, newInput } = uc,
        { newSelect, newRow, newGCode, newDiv, toInt, toFloat } = uc;

    event.emit('init.one');

    // restore kiri-init vars
    let inits = parseInt(sdb.getItem('kiri-init') || stats.get('init') || 0) + 1;

    // update version and init count
    sdb.setItem('kiri-init', inits);
    stats.set('init', inits);
    stats.set('kiri', version);

    // restore settings from last saved session
    conf.restore();

    let container = $('container'),
        gcode = $('dev-gcode'),
        tracker = $('tracker'),
        controller = settings().controller;

    WIN.addEventListener("resize", () => {
        event.emit('resize');
    });

    event.on('resize', () => {
        if (WIN.innerHeight < 800) {
            ui.modalBox.classList.add('mh85');
        } else {
            ui.modalBox.classList.remove('mh85');
        }
        view.update_slider();
    });

    space.sky.showGrid(false);
    space.sky.setColor(controller.dark ? 0 : 0xffffff);
    space.setAntiAlias(controller.antiAlias);
    space.init(container, function (delta) {
        const { lo, hi, max } = slider.getRange();
        if (max === 0 || !delta) return;
        if (controller.reverseZoom) delta = -delta;
        let same = hi === lo;
        let track = lo > 0;
        let newHi = hi;
        let newLo = lo;
        if (delta > 0) {
            newHi = Math.max(same ? 0 : lo, hi - 1);
            if (track) {
                newLo = Math.max(0, lo - 1);
            }
        } else if (delta < 0) {
            newHi = Math.min(max, hi + 1);
            if (track) {
                newLo = Math.min(newHi, lo + 1);
            }
        }
        if (same) {
            newLo = newHi;
        }
        slider.setRange(newLo, newHi);
        view.update_slider();
        show.slices();
    }, controller.ortho);
    space.platform.onMove(conf.save);
    space.platform.setRound(true);
    space.useDefaultKeys(api.feature.on_key === undefined || api.feature.on_key_defaults);
    preferences.updateDrawer();

    // api augmentation with local functions
    api.device.export = settingsOps.deviceExport;

    Object.assign(ui, {
        tracker:            tracker,
        container:          container,

        alert: {
            dialog:         $('alert-area'),
            text:           $('alert-text')
        },
        func: {
            slice:          $('act-slice'),
            preview:        $('act-preview'),
            animate:        $('act-animate'),
            export:         $('act-export')
        },
        label: {
            slice:          $('label-slice'),
            preview:        $('label-preview'),
            animate:        $('label-animate'),
            export:         $('label-export'),
        },
        acct: {
            help:           $('app-help'),
            don8:           $('app-don8'),
            mesh:           $('app-mesh'),
            export:         $('app-export')
        },
        dev: {
            header:         $('dev-header'),
            search:         $('dev-search'),
            filter:         $('dev-filter')
        },
        mesh: {
            name:           $('mesh-name'),
            points:         $('mesh-points'),
            faces:          $('mesh-faces'),
        },

        stats: {
            fps:            $('fps'),
            rms:            $('rms'),
            div:            $('stats'),
            rnfo:           $('rnfo'),
        },

        load:               $('load-file'),
        speeds:             $('speeds'),
        speedbar:           $('speedbar'),
        context:            $('context-menu'),

        ltsetup:            $('lt-setup'),
        ltfile:             $('lt-file'),
        ltview:             $('lt-view'),
        ltact:              $('lt-start'),
        edit:               $('lt-tools'),
        nozzle:             $('menu-nozzle'),

        modal:              $('modal'),
        modalBox:           $('modal-box'),
        modals: {
            help:               $('mod-help'),
            setup:              $('mod-setup'),
            prefs:              $('mod-prefs'),
            files:              $('mod-files'),
            saves:              $('mod-saves'),
            tools:              $('mod-tools'),
            xany:               $('mod-x-any'),
            xsla:               $('mod-x-sla'),
            xlaser:             $('mod-x-laser'),
            don8:               $('mod-don8'),
            any:                $('mod-any'),
        },

        catalogBody:        $('catalogBody'),
        catalogList:        $('catalogList'),

        devices:            $('devices'),
        deviceAdd:          $('device-add'),
        deviceDelete:       $('device-del'),
        deviceRename:       $('device-ren'),
        deviceExport:       $('device-exp'),
        deviceSave:         $('device-save'),

        setMenu:            $('set-menu'),
        settings:           $('settings'),
        settingsBody:       $('settingsBody'),
        settingsList:       $('settingsList'),

        slider:             $('slider'),
        sliderMax:          $('slider-max'),
        sliderMin:          $('slider-zero'),
        sliderLo:           $('slider-lo'),
        sliderMid:          $('slider-mid'),
        sliderHi:           $('slider-hi'),
        sliderHold:         $('slider-hold'),
        sliderRange:        $('slider-center'),

        loading:            $('progress').style,
        progress:           $('progbar').style,
        prostatus:          $('progtxt'),

        selection:          $('selection'),
        sizeX:              $('size_x'),
        sizeY:              $('size_y'),
        sizeZ:              $('size_z'),
        scaleX:             $('scale_x'),
        scaleY:             $('scale_y'),
        scaleZ:             $('scale_z'),
        lockX:              $('lock_x'),
        lockY:              $('lock_y'),
        lockZ:              $('lock_z'),
        stock:              $('stock'),
        stockWidth:         $('stock-width'),
        stockDepth:         $('stock-width'),
        stockHeight:        $('stock-width'),

        /** Device Browser / Editor */

        _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true }),
        device:           newGroup(LANG.dv_gr_dev, null, {group:"ddev", inline, class:"noshow"}),

        _____:            newGroup("workspace", null, {group:"dext", inline}),
        bedWidth:         newInput('X (width)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.updateDeviceSize}),
        bedDepth:         newInput('Y (depth)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.updateDeviceSize}),
        maxHeight:        newInput('Z (height)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.updateDeviceSize}),
        resolutionX:      newInput(LANG.dv_rezx_s, {title:LANG.dv_rezx_l, convert:toInt, size:6, modes:SLA}),
        resolutionY:      newInput(LANG.dv_rezy_s, {title:LANG.dv_rezy_l, convert:toInt, size:6, modes:SLA}),
        _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:NO_WEDM }),
        _____:            newGroup("firmware", null, {group:"dext", inline, modes:NO_WEDM}),
        fwRetract:        newBoolean(LANG.dv_retr_s, onBooleanClick, {title:LANG.dv_retr_l, modes:FDM}),
        deviceOrigin:     newBoolean(LANG.dv_orgc_s, onBooleanClick, {title:LANG.dv_orgc_l, modes:FDM_LZN, show:() => !ui.deviceRound.checked}),
        deviceRound:      newBoolean(LANG.dv_bedc_s, onBooleanClick, {title:LANG.dv_bedc_l, modes:FDM, trigger, show:isNotBelt}),
        deviceBelt:       newBoolean(LANG.dv_belt_s, onBooleanClick, {title:LANG.dv_belt_l, modes:FDM, trigger, show:() => !ui.deviceRound.checked}),
        separator:        newBlank({class:"pop-sep", modes:FDM, driven}),
        spindleMax:       newInput(LANG.dv_spmx_s, {title:LANG.dv_spmx_l, convert:toInt, size:5, modes:CAM, trigger}),
        deviceZMax:       newInput(LANG.dv_zmax_s, {title:LANG.dv_zmax_l, convert:toInt, size:5, modes:FDM}),
        gcodeTime:        newInput(LANG.dv_time_s, {title:LANG.dv_time_l, convert:toFloat, size:5, modes:FDM}),
        _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:FDM }),
        extruder:         newGroup(LANG.dv_gr_ext, null, {group:"dext", inline}),
        extFilament:      newInput(LANG.dv_fila_s, {title:LANG.dv_fila_l, convert:toFloat, modes:FDM}),
        extNozzle:        newInput(LANG.dv_nozl_s, {title:LANG.dv_nozl_l, convert:toFloat, modes:FDM}),
        extOffsetX:       newInput(LANG.dv_exox_s, {title:LANG.dv_exox_l, convert:toFloat, modes:FDM}),
        extOffsetY:       newInput(LANG.dv_exoy_s, {title:LANG.dv_exoy_l, convert:toFloat, modes:FDM}),
        extPad:           newBlank({class:"grow", modes:FDM}),
        separator:        newBlank({class:"pop-sep", modes:FDM, driven}),
        extActions:       newRow([
            ui.extPrev = newButton(undefined, undefined, {icon:'<i class="fas fa-less-than"></i>'}),
            ui.extAdd  = newButton(undefined, undefined, {icon:'<i class="fas fa-plus"></i>'}),
            ui.extDel  = newButton(undefined, undefined, {icon:'<i class="fas fa-minus"></i>'}),
            ui.extNext = newButton(undefined, undefined, {icon:'<i class="fas fa-greater-than"></i>'})
        ], {class:"dev-buttons ext-buttons var-row", modes:FDM}),
        _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true, modes:CAM_LZR }),
        _____:            newGroup(LANG.dv_gr_out, null, {group:"dgco", inline}),
        gcodeStrip:       newBoolean(LANG.dv_strc_s, onBooleanClick, {title:LANG.dv_strc_l, modes:CAM}),
        gcodeSpace:       newBoolean(LANG.dv_tksp_s, onBooleanClick, {title:LANG.dv_tksp_l, modes:CAM_LZR}),
        laserMaxPower:    newInput(LANG.ou_maxp_s, {title:LANG.ou_maxp_l, modes:LASER, size:7, text:true}),
        useLaser:         newBoolean(LANG.dv_lazr_s, onBooleanClick, {title:LANG.dv_lazr_l, modes:CAM}),
        useIndexed:       newBoolean(LANG.dv_4tha_s, onBooleanClick, {title:LANG.dv_4tha_l, modes:CAM}),
        gcodeFExt:        newInput(LANG.dv_fext_s, {title:LANG.dv_fext_l, modes:CAM_LZR, size:7, text:true}),
        gcodeEd:          newGroup(LANG.dv_gr_gco, $('dg'), {group:"dgcp", inline, modes:GCODE}),
        gcodeMacros:      newRow([
            (ui.gcodePre      = newGCode(LANG.dv_head_s, {title:LANG.dv_head_l, modes:GCODE, area:gcode})).button,
            (ui.gcodePost     = newGCode(LANG.dv_foot_s, {title:LANG.dv_foot_l, modes:GCODE, area:gcode})).button,
            (ui.gcodeLayer    = newGCode(LANG.dv_layr_s, {title:LANG.dv_layr_l, modes:FDM,   area:gcode})).button,
            (ui.gcodeTrack    = newGCode(LANG.dv_prog_s, {title:LANG.dv_prog_l, modes:FDM,   area:gcode})).button,
            (ui.gcodeFan      = newGCode(LANG.dv_fanp_s, {title:LANG.dv_fanp_l, modes:FDM,   area:gcode})).button,
            (ui.gcodeFeature  = newGCode(LANG.dv_feat_s, {title:LANG.dv_feat_l, modes:FDM,   area:gcode})).button,
            (ui.gcodeLaserOn  = newGCode(LANG.dv_lzon_s, {title:LANG.dv_lzon_l, modes:LASER, area:gcode})).button,
            (ui.gcodeLaserOff = newGCode(LANG.dv_lzof_s, {title:LANG.dv_lzof_l, modes:LASER, area:gcode})).button,
            (ui.gcodeWaterOn  = newGCode(LANG.dv_waon_s, {title:LANG.dv_waon_l, modes:WJET,  area:gcode})).button,
            (ui.gcodeWaterOff = newGCode(LANG.dv_waof_s, {title:LANG.dv_waof_l, modes:WJET,  area:gcode})).button,
            (ui.gcodeKnifeDn  = newGCode(LANG.dv_dkon_s, {title:LANG.dv_dkon_l, modes:DRAG,  area:gcode})).button,
            (ui.gcodeKnifeUp  = newGCode(LANG.dv_dkof_s, {title:LANG.dv_dkof_l, modes:DRAG,  area:gcode})).button,
            (ui.gcodeChange   = newGCode(LANG.dv_tool_s, {title:LANG.dv_tool_l, modes:FDM_CAM,   area:gcode})).button,
            (ui.gcodeDwell    = newGCode(LANG.dv_dwll_s, {title:LANG.dv_dwll_l, modes:CAM,   area:gcode})).button,
            (ui.gcodeSpindle  = newGCode(LANG.dv_sspd_s, {title:LANG.dv_sspd_l, modes:CAM,   area:gcode, show:() => ui.spindleMax.value > 0})).button,
            (ui.gcodeResetA   = newGCode(LANG.dv_resa_s, {title:LANG.dv_resa_l, modes:CAM,   area:gcode, show:() => ui.useIndexed.checked})).button
        ], {class:"ext-buttons f-row gcode-macros"}),

        /** Preferences Menu */

        _____:            newGroup(LANG.op_menu, $('prefs-gen1'), {inline}),
        antiAlias:        newBoolean(LANG.op_anta_s, preferences.booleanSave, {title:LANG.op_anta_l}),
        reverseZoom:      newBoolean(LANG.op_invr_s, preferences.booleanSave, {title:LANG.op_invr_l}),
        ortho:            newBoolean(LANG.op_orth_s, preferences.booleanSave, {title:LANG.op_orth_l}),
        dark:             newBoolean(LANG.op_dark_s, preferences.booleanSave, {title:LANG.op_dark_l}),
        drawer:           newBoolean('slide out', preferences.booleanSave, {title:'slide out settings drawer'}),
        scrolls:          newBoolean('scrollbars', preferences.booleanSave, {title:'show scrollbars'}),
        devel:            newBoolean(LANG.op_devl_s, preferences.booleanSave, {title:LANG.op_devl_l}),
        _____:            newGroup(LANG.op_disp, $('prefs-gen2'), {inline}),
        showOrigin:       newBoolean(LANG.op_shor_s, preferences.booleanSave, {title:LANG.op_shor_l}),
        showRulers:       newBoolean(LANG.op_shru_s, preferences.booleanSave, {title:LANG.op_shru_l}),
        showSpeeds:       newBoolean(LANG.op_sped_s, preferences.speedSave, {title:LANG.op_sped_l}),
        shiny:            newBoolean(LANG.op_shny_s, preferences.booleanSave, {title:LANG.op_shny_l, modes:FDM}),
        lineType:         newSelect(LANG.op_line_s, {title: LANG.op_line_l, action: preferences.lineTypeSave, modes:FDM}, "linetype"),
        manifold:         newBoolean(LANG.op_mani_s, preferences.booleanSave, {title: LANG.op_mani_l, modes:CAM}, "manifold"),
        animesh:          newSelect(LANG.op_anim_s, {title: LANG.op_anim_l, action: preferences.aniMeshSave, modes:CAM}, "animesh"),
        units:            newSelect(LANG.op_unit_s, {title: LANG.op_unit_l, action: preferences.unitsSave, modes:CAM}, "units"),
        edgeangle:        newInput(LANG.op_spoa_s, {title:LANG.op_spoa_l, convert:toFloat, size:3}),
        _____:            newGroup(LANG.lo_menu, $('prefs-lay'), {inline}),
        autoSave:         newBoolean(LANG.op_save_s, preferences.booleanSave, {title:LANG.op_save_l}),
        autoLayout:       newBoolean(LANG.op_auto_s, preferences.booleanSave, {title:LANG.op_auto_l}),
        freeLayout:       newBoolean(LANG.op_free_s, preferences.booleanSave, {title:LANG.op_free_l}),
        spaceRandoX:      newBoolean(LANG.op_spcx_s, preferences.booleanSave, {title:LANG.op_spcx_l, show:isBelt}),
        spaceLayout:      newInput(LANG.op_spcr_s, {title:LANG.op_spcr_l, convert:toFloat, size:3, units}),
        _____:            newGroup(LANG.xp_menu, $('prefs-xpo'), {inline: true}),
        exportOcto:       newBoolean(`OctoPrint`, preferences.booleanSave, {title:LANG.op_exop_l}),
        exportThumb:      newBoolean(`Thumbnail`, preferences.booleanSave, {modes:FDM}),
        exportPreview:    newBoolean(`Code Preview`, preferences.booleanSave),
        _____:            newGroup(LANG.pt_menu, $('prefs-prt'), {inline}),
        detail:           newSelect(LANG.pt_qual_s, {title: LANG.pt_qual_l, action: preferences.detailSave}, "detail"),
        healMesh:         newBoolean(LANG.pt_heal_s, preferences.booleanSave, {title: LANG.pt_heal_l}),
        // threaded:         newBoolean(LANG.pt_thrd_s, preferences.booleanSave, {title: LANG.pt_thrd_l, modes:THREED}),
        assembly:         newBoolean(LANG.pt_assy_s, preferences.booleanSave, {title: LANG.pt_assy_l, modes:THREED}),
        webGPU:           newBoolean(LANG.pt_wgpu_s, preferences.booleanSave, {title: LANG.pt_wgpu_l, modes:THREED}),

        prefadd:          uc.checkpoint($('prefs-add')),

        /** FDM Settings */
        ...menuFDM(),

        /** CAM Settings */
        ...menuCAM(),

        /** LASER/DRAG/WJET/WEDM cut tool Settings */
        ...menuLaser(),

        /** SLA SETTINGS */
        ...menuSLA(),

        layers:             uc.setGroup($("layers")),

        settingsName:       $('settingsName'),
        settingsSave:       $('settingsSave'),
    });

    // run client mode initializations right after UI is bound
    // MUST run after main ui menu inits since they rely on passed state
    // that createPopOps disrupts (should be refactored)
    initCAM();
    initDRAG();
    initFDM();
    initLaser();
    initSLA();
    initWEDM();
    initWJET();

    // override old style settings two-button menu
    ui.settingsSave.onclick = () => {
        settingsOps.settingsSave(undefined, ui.settingsName.value);
    };

    // initialize modal controller
    modal.init({
        ui: {
            modal: ui.modal,
            modals: ui.modals
        },
        onShow: (which) => {
            api.event.emit('modal.show', which);
        },
        onHide: () => {
            api.event.emit('modal.hide');
        }
    });

    // expose modal to API
    api.modal = modal;

    // slider setup
    slider.init({
        ui: {
            layers: ui.layers,
            slider: ui.slider,
            sliderRange: ui.sliderRange,
            sliderHold: ui.sliderHold,
            sliderMid: ui.sliderMid,
            sliderLo: ui.sliderLo,
            sliderHi: ui.sliderHi,
            sliderMin: ui.sliderMin,
            sliderMax: ui.sliderMax,
            sliderZero: $('slider-zero'),
        },
        tracker: tracker,
        mobile: space.info.mob,
        onLayerChange: (hi, lo) => {
            // Visualization is handled by the code that calls setRange()
            // Don't call api.show.layer here as it creates circular dependency
        },
        onStackUpdate: (lo, hi) => {
            STACKS.setRange(lo, hi);
        },
        onSceneUpdate: () => {
            space.scene.active();
        }
    });

    // expose slider to API
    api.slider = slider;

    // initialize keyboard controller
    keyboard.init({
        api,
        platform,
        selection,
        slider,
        space,
        catalog,
        sdb,
        uc,
        setCtrl: set_ctrl,
        VIEWS,
        DOC,
        WIN,
        rotateInputSelection: selectionTools.rotateInputSelection,
        settingsLoad: settingsOps.settingsLoad
    });

    // expose keyboard to API
    api.keyboard = keyboard;

    // add mobile class to body if needed
    if (space.info.mob) {
        DOC.body.classList.add('mobile');
    }

    ui.load.onchange = function(event) {
        api.platform.load_files(event.target.files);
        ui.load.value = ''; // reset so you can re-import the same filee
    };

    // store layer preferences
    api.event.on('stack.show', label => {
        let mode = api.mode.get();
        let view = api.view.get();
        api.conf.get().labels[`${mode}-${view}-${label}`] = true;
    });

    api.event.on('stack.hide', label => {
        let mode = api.mode.get();
        let view = api.view.get();
        api.conf.get().labels[`${mode}-${view}-${label}`] = false;
    });

    // bind language choices
    $('lset-en').onclick = function() {
        sdb.setItem('kiri-lang', 'en-us');
        api.space.reload();
    };
    $('lset-da').onclick = function() {
        sdb.setItem('kiri-lang', 'da-dk');
        api.space.reload();
    };
    $('lset-de').onclick = function() {
        sdb.setItem('kiri-lang', 'de-de');
        api.space.reload();
    };
    $('lset-fr').onclick = function() {
        sdb.setItem('kiri-lang', 'fr-fr');
        api.space.reload();
    };
    $('lset-pl').onclick = function() {
        sdb.setItem('kiri-lang', 'pl-pl');
        api.space.reload();
    };
    $('lset-pt').onclick = function() {
        sdb.setItem('kiri-lang', 'pt-pt');
        api.space.reload();
    };
    $('lset-es').onclick = function() {
        sdb.setItem('kiri-lang', 'es-es');
        api.space.reload();
    };
    $('lset-zh').onclick = function() {
        sdb.setItem('kiri-lang', 'zh');
        api.space.reload();
    };

    space.event.addHandlers(self, [
        'dragover', fileOps.dragOverHandler,
        'dragleave', fileOps.dragLeave,
        'drop', fileOps.dropHandler
    ]);

    // Setup selection transformation bindings
    selectionTools.setupSelectionBindings(ui);

    $('lab-axis').onclick = () => {
        ui.lockX.checked =
        ui.lockY.checked =
        ui.lockZ.checked = !(
            ui.lockX.checked ||
            ui.lockY.checked ||
            ui.lockZ.checked
        );
    };

    $('scale-reset').onclick = $('lab-scale').onclick = () => {
        selection.scale(1 / ui.scaleX.was, 1 / ui.scaleY.was, 1 / ui.scaleZ.was);
        ui.scaleX.value = ui.scaleY.value = ui.scaleZ.value =
        ui.scaleX.was = ui.scaleY.was = ui.scaleZ.was = 1;
    };

    $('app-xpnd').onclick = () => {
        try {
            DOC.body.requestFullscreen();
        } catch (e) {
            event.emit('resize');
            moto.space.event.onResize();
        }
    };

    if (!DOC.body.requestFullscreen) {
        $('app-xpnd').style.display = 'none';
    }

    uc.onBlur([
        ui.toolName,
        ui.toolNum,
        ui.toolFluteDiam,
        ui.toolFluteLen,
        ui.toolShaftDiam,
        ui.toolShaftLen,
        ui.toolTaperTip,
    ], updateTool);

    ui.toolMetric.onclick = updateTool;
    ui.toolType.onchange = updateTool;
    // default show gcode pre
    ui.gcodePre.button.click();

    api.platform.update_size();

    // initialize interaction controller
    interact.init({
        api,
        space,
        platform,
        selection,
        ui,
        settings,
        VIEWS,
        onHover: (data) => {
            api.event.emit('mouse.hover', data);
        },
        onHoverDown: (data) => {
            api.event.emit('mouse.hover.down', data);
        },
        onHoverUp: (data) => {
            api.event.emit('mouse.hover.up', data);
        },
        onDragDone: (offset) => {
            api.event.emit('mouse.drag.done', offset);
        },
        onSelectionDrag: (delta) => {
            api.event.emit('selection.drag', delta);
        }
    });

    // expose interact to API
    api.interact = interact;

    // prevent safari from exiting full screen mode
    DOC.onkeydown = function (evt) {
        if (evt.code == 27) evt.preventDefault()
    }

    // block standard browser context menu
    DOC.oncontextmenu = (event) => {
        let et = event.target;
        if (et.tagName === 'CANVAS' || et.id === 'context-menu' || et.classList.contains('draggable')) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    };

    api.space.restore(init_two) || checkSeed(init_two) || init_two();
};

// SECOND STAGE INIT AFTER UI RESTORED
function init_two() {
    api.event.emit('init.two');

    // load script extensions
    if (SETUP.s) SETUP.s.forEach(function(lib) {
        let scr = DOC.createElement('script');
        scr.setAttribute('async', true);
        scr.setAttribute('defer', true);
        scr.setAttribute('src',`/code/${lib}.js`);
        DOC.body.appendChild(scr);
        stats.add('load_'+lib);
        api.event.emit('load.lib', lib);
    });

    // override stored settings
    if (SETUP.v) SETUP.v.forEach(function(kv) {
        kv = kv.split('=');
        sdb.setItem(kv[0],kv[1]);
    });

    // import octoprint settings
    if (SETUP.ophost) {
        let ohost = api.const.OCTO = {
            host: SETUP.ophost[0],
            apik: SETUP.opkey ? SETUP.opkey[0] : ''
        };
        sdb['octo-host'] = ohost.host;
        sdb['octo-apik'] = ohost.apik;
        console.log({octoprint:ohost});
    }

    // load workspace from url
    if (SETUP.wrk) {
        set_ctrl.import_url(`${proto}//${SETUP.wrk[0]}`, false);
    }

    // load an object from url
    if (SETUP.load) {
        console.log({load:SETUP});
        api.platform.load_url(`${proto}//${SETUP.load[0]}`);
    }

    // bind this to UI so main can call it on settings import
    ui.sync = function() {
        const current = settings();
        const control = current.controller;

        if (!control.devel) {
            // TODO: hide thin type 3 during development
            api.const.LISTS.thin.length = 3;
        }

        platform.deselect();
        catalog.addFileListener(fileOps.updateCatalog);
        space.view.setZoom(control.reverseZoom, control.zoomSpeed);
        space.platform.setGridZOff(undefined);
        space.platform.setZOff(0.05);
        space.view.setProjection(control.ortho ? 'orthographic' : 'perspective');

        // restore UI state from settings
        ui.antiAlias.checked = control.antiAlias;
        ui.assembly.checked = control.assembly;
        ui.autoLayout.checked = control.autoLayout;
        ui.autoSave.checked = control.autoSave;
        ui.devel.checked = control.devel;
        ui.freeLayout.checked = control.freeLayout;
        ui.healMesh.checked = control.healMesh;
        ui.manifold.checked = control.manifold;
        ui.ortho.checked = control.ortho;
        ui.reverseZoom.checked = control.reverseZoom;
        ui.showOrigin.checked = control.showOrigin;
        ui.showRulers.checked = control.showRulers;
        ui.showSpeeds.checked = control.showSpeeds;
        ui.spaceRandoX.checked = control.spaceRandoX;
        // ui.threaded.checked = setThreaded(control.threaded);
        ui.webGPU.checked = control.webGPU;

        preferences.setThreaded(true);
        preferences.lineTypeSave();
        preferences.detailSave();
        preferences.updateStats();

        // optional set-and-lock mode (hides mode menu)
        let SETMODE = SETUP.mode ? SETUP.mode[0] : null;

        // optional set-and-lock device (hides device menu)
        let DEVNAME = SETUP.dev ? SETUP.dev[0] : null;

        // setup default mode and enable mode locking, if set
        api.mode.set(SETMODE || STARTMODE || current.mode, SETMODE);

        // fill device list
        api.devices.refresh();

        // update ui fields from settings
        api.conf.update_fields();

        // default to ARRANGE view mode
        api.view.set(VIEWS.ARRANGE);

        // add ability to override (todo: restore?)
        // api.show.controls(api.feature.controls);

        // update everything dependent on the platform size
        platform.update_size();

        // load wasm if indicated
        client.wasm(control.assembly === true);
    };

    ui.sync();

    // clear alerts as they build up
    setInterval(api.event.alerts, 1000);

    // add hide-alerts-on-alert-click
    ui.alert.dialog.onclick = function() {
        api.event.alerts(true);
    };

    // enable modal hiding
    $('mod-x').onclick = api.modal.hide;

    if (!SETUP.s) console.log(`kiri | init main | ${version}`);

    // send init-done event
    api.event.emit('init-done', stats);

    // show gdpr if it's never been seen and we're not iframed
    const isLocal = LOCAL || WIN.location.host.split(':')[0] === 'localhost';
    if (!sdb.gdpr && WIN.self === WIN.top && !SETUP.debug && !isLocal) {
        $('gdpr').style.display = 'flex';
    }

    // warn of degraded functionality when SharedArrayBuffers are missing
    if (api.feature.work_alerts && !window.SharedArrayBuffer) {
        api.alerts.show("The security context of this", 10);
        api.alerts.show("Window blocks important functionality.", 10);
        api.alerts.show("Try a Chromium-base Browser instead", 10);
    }

    // add keyboard focus handler (must use for iframes)
    WIN.addEventListener('load', function () {
        WIN.focus();
        DOC.body.addEventListener('click', function() {
            WIN.focus();
        },false);
    });

    // dismiss gdpr alert
    $('gotit').onclick = () => {
        $('gdpr').style.display = 'none';
        sdb.gdpr = Date.now();
    };

    // Setup navigation button bindings
    navigation.setupNavigation(ui, WIN, LANG);

    // ui.modal.onclick = api.modal.hide;
    ui.modalBox.onclick = (ev) => { ev.stopPropagation() };

    // add app name hover info
    $('app-info').innerText = version;

    // show topline separator when iframed
    try { if (WIN.self !== WIN.top) $('top-sep').style.display = 'flex' } catch (e) { console.log(e) }

    // warn users they are running a beta release
    if (beta && beta > 0 && sdb.kiri_beta != beta) {
        api.show.alert("CAUTION");
        api.show.alert("this is a development release");
        api.show.alert("and may not function properly");
        sdb.kiri_beta = beta;
    }

    // hide url params but preserve version root (when present)
    let wlp = WIN.location.pathname;
    let kio = wlp.indexOf('/kiri/');
    if (kio >= 0) {
        history.replaceState({}, '', wlp.substring(0,kio + 6));
    }

    // lift curtain
    $('curtain').style.display = 'none';
}

// update static html elements with language overrides
function lang_rewrite() {
    // lk attribute causes inner text to be replaced with lang value
    for (let el of [...DOC.querySelectorAll("[lk]")]) {
        let key = el.getAttribute('lk');
        let val = LANG[key];
        if (val) {
            el.innerText = val;
        } else {
            console.log({missing_ln: key});
        }
    }
    // lkt attribute causes a title attribute to be set from lang value
    for (let el of [...DOC.querySelectorAll("[lkt]")]) {
        let key = el.getAttribute('lkt');
        let val = LANG[key];
        if (val) {
            el.setAttribute("title", val);
        } else {
            console.log({missing_ln: key});
        }
    }
}

// init lang must happen before all other init functions
function init_lang() {
    // if a language needs to load, the script is injected and loaded
    // first.  once this loads, or doesn't, the initialization begins
    let lang = SETUP.ln ? SETUP.ln[0] : sdb.getItem('kiri-lang') || api.language.get();
    api.event.emit('init.lang', lang);
    // inject language script if not english
    if (lang && lang !== 'en' && lang !== 'en-us') {
        let map = api.language.map(lang);
        let scr = DOC.createElement('script');
        // scr.setAttribute('defer',true);
        scr.setAttribute('src',`/kiri/lang/${map}.js`);
        (DOC.body || DOC.head).appendChild(scr);
        stats.set('ll',lang);
        scr.onload = function() {
            api.language.set(map);
            lang_rewrite();
            init_one();
        };
        scr.onerror = function(err) {
            console.log({language_load_error: err, lang})
            api.language.set();
            lang_rewrite();
            init_one();
        }
    } else {
        // set to browser default which will be overridden
        // by any future script loads (above)
        api.language.set();
        lang_rewrite();
        init_one();
    }
}

export function run() {
    client.start();
    init_lang();
    return api;
}
