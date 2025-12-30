/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../api.js';
import { bind } from './bind.js';
import { version } from '../../../moto/license.js';
import { fileOps } from '../file-ops.js';
import { init as initCAM } from '../../mode/cam/init-ui.js';
import { init as initDRAG } from '../../mode/drag/init-ui.js';
import { init as initFDM } from '../../mode/fdm/init-ui.js';
import { init as initLaser } from '../../mode/laser/init-ui.js';
import { init as initSLA } from '../../mode/sla/init-ui.js';
import { init as initWEDM } from '../../mode/wedm/init-ui.js';
import { init as initWJET } from '../../mode/wjet/init-ui.js';
import { interact } from '../mouse.js';
import { keyboard } from '../keyboard.js';
import { local as sdb } from '../../../data/local.js';
import { menu as menuCAM } from '../../mode/cam/init-menu.js';
import { menu as menuFDM } from '../../mode/fdm/init-menu.js';
import { menu as menuLaser } from '../../mode/laser/init-menu.js';
import { menu as menuSLA } from '../../mode/sla/init-menu.js';
import { modal } from '../modal.js';
import { preferences } from '../preferences.js';
import { settings as set_ctrl } from '../conf/manager.js';
import { settingsOps } from '../conf/settings.js';
import { slider } from '../slider.js';
import { space } from '../../../moto/space.js';
import { LAST, MODES, SEED, VIEWS } from '../../core/consts.js';

import STACKS from '../stacks.js';
import '../frame.js';

let { SETUP } = api.const,
    { CAM, SLA, FDM, LASER, DRAG, WJET, WEDM } = MODES,
    { catalog, platform, selection, stats } = api,
    { input_binding, input_position, input_rotate } = selection,
    DOC = self.document,
    WIN = self.window,
    LANG = api.language.current,
    TWOD    = [ LASER, DRAG, WJET, WEDM ],
    TWONED  = [ LASER, DRAG, WJET ],
    THREED  = [ FDM, CAM, SLA ],
    GCODE   = [ FDM, CAM, ...TWOD ],
    CAM_LZR = [ CAM, ...TWOD ],
    FDM_LZN = [ FDM, ...TWONED ],
    NO_WEDM = [ FDM, CAM, SLA, LASER, DRAG, WJET ],
    FDM_CAM = [ FDM, CAM ],
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
    } else if (sdb[LAST] !== version) {
        sdb[LAST] = version;
        api.help.show();
    }
    then();
    return false;
}

// upon restore, seed presets
api.event.emit('preset', api.conf.dbo());

// api.event.on("set.threaded", bool => setThreaded(bool));

export function onBooleanClick(el) {
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

// function keys(o) {
//     let key, list = [];
//     for (key in o) { if (o.hasOwnProperty(key)) list.push(key) }
//     return list.sort();
// }

function isBelt() {
    return api.device.isBelt();
}

function isNotBelt() {
    return !isBelt();
}

function onResize() {
    if (WIN.innerHeight < 800) {
        ui.modalBox.classList.add('mh85');
    } else {
        ui.modalBox.classList.remove('mh85');
    }
    api.view.update_slider();
}

// MAIN UI INITIALIZATION FUNCTION
export function init_input() {
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

    // window resize handlers
    WIN.addEventListener("resize", onResize);
    event.on('resize', onResize);

    // configure moto.space
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
    api.device.export = settingsOps.export_device;

    Object.assign(ui, {
        tracker:            tracker,
        container:          container,

        // static html --> ui bindings
        ...bind(),

        /** Device Browser / Editor */

        _____:            newDiv({ class: "f-col t-body t-inset", addto: $('dev-config'), set:true }),
        device:           newGroup(LANG.dv_gr_dev, null, {group:"ddev", inline, class:"noshow"}),

        _____:            newGroup("workspace", null, {group:"dext", inline}),
        bedWidth:         newInput('X (width)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.update_device}),
        bedDepth:         newInput('Y (depth)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.update_device}),
        maxHeight:        newInput('Z (height)', {title:LANG.dv_bedw_l, convert:toFloat, size:6, units, round:2, action:settingsOps.update_device}),
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
        settingsOps.settings_save(undefined, ui.settingsName.value);
    };

    // initialize and expose modal to API
    api.modal = modal.init({
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

    // initialize and expose slider to API
    api.slider = slider.init({
        ui,
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

    // initialize and expose keyboard to API
    api.keyboard = keyboard.init({
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
        rotateInputSelection: input_rotate,
        settingsLoad: settingsOps.settings_load
    });

    // add mobile class to body if needed
    if (space.info.mob) {
        DOC.body.classList.add('mobile');
    }

    ui.load.onchange = (event) => {
        api.platform.load_files(event.target.files);
        ui.load.value = ''; // reset so you can re-import the same filee
    };

    // store layer preferences
    api.event.on('stack.show', (label) => {
        let mode = api.mode.get();
        let view = api.view.get();
        api.conf.get().labels[`${mode}-${view}-${label}`] = true;
    });

    api.event.on('stack.hide', (label) => {
        let mode = api.mode.get();
        let view = api.view.get();
        api.conf.get().labels[`${mode}-${view}-${label}`] = false;
    });

    // bind menu language choices
    let lang_map = [
        [ 'lset-en', 'en-us' ],
        [ 'lset-da', 'da-dk' ],
        [ 'lset-de', 'de-de' ],
        [ 'lset-fr', 'fr-fr' ],
        [ 'lset-pl', 'pl-pl' ],
        [ 'lset-pt', 'pt-pt' ],
        [ 'lset-es', 'es-es' ],
        [ 'lset-zh', 'zh' ],
    ]
    for (let [ btn, lang ] of lang_map) {
        $(btn).onclick = () => {
            sdb.setItem('kiri-lang', lang);
            api.space.reload();
        };
    }

    space.event.addHandlers(self, [
        'dragover', fileOps.dragOverHandler,
        'dragleave', fileOps.dragLeave,
        'drop', fileOps.dropHandler
    ]);

    // Setup selection transformation bindings
    input_binding(ui);

    $('lab-axis').onclick = () => {
        ui.lock.X.checked =
        ui.lock.Y.checked =
        ui.lock.Z.checked = !(
            ui.lock.X.checked ||
            ui.lock.Y.checked ||
            ui.lock.Z.checked
        );
    };

    $('scale-reset').onclick = $('lab-scale').onclick = () => {
        selection.scale(1 / ui.scale.X.was, 1 / ui.scale.Y.was, 1 / ui.scale.Z.was);
        ui.scale.X.value = ui.scale.Y.value = ui.scale.Z.value =
        ui.scale.X.was = ui.scale.Y.was = ui.scale.Z.was = 1;
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

    return new Promise(resolve => {
        api.space.restore(() => checkSeed(resolve));
    });
};
