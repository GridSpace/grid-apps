/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $, h } from '../../../moto/webui.js';
import { api } from '../../core/api.js';
import { env } from './client.js';
import { Tool } from './tool.js';
import { opFlip } from './cl-flip.js';
import { selectHoles } from './cl-hole.js';
import { surfaceAdd } from './cl-surface.js';
import { traceAdd } from './cl-trace.js';

const { MODES } = api.const;
const { uc: UC } = api;
const { alerts, conf } = api;
const { current: LANG } = api.language;

let seed = Date.now();

function hasIndexing() {
    return env.isIndexed;
}

function hasSpindle() {
    return env.current.device.spindleMax > 0;
}

function zTop() {
    return api.conf.get().process.camZTop > 0;
}

function zBottom() {
    return api.conf.get().process.camZBottom > 0;
}

// create custom gcode editor function
function gcodeEditor(label, field) {
    return function () {
        opGCode(label, field);
    }
}

function opGCode(label, field = 'gcode') {
    api.dialog.show('any');
    const { c_gcode } = h.bind(
        $('mod-any'), h.div({ id: "camop_dialog" }, [
            h.label(label || 'custom gcode operation'),
            h.textarea({ id: "c_gcode", rows: 15, cols: 50 }),
            h.button({
                _: 'done', onclick: () => {
                    api.dialog.hide();
                    api.conf.save();
                }
            })
        ])
    );
    let av = env.poppedRec[field] || [];
    c_gcode.value = typeof (av) === 'string' ? av : av.join('\n');
    c_gcode.onkeyup = (el) => {
        env.poppedRec[field] = c_gcode.value.trim().split('\n');
    };
    c_gcode.focus();
}

/**
 * Create a new popup operation (popOp) for a given type.
 * @param {string} type - the name of the popOp to create
 * @param {object} map - an object mapping popOp keys to either a string
 * (representing a key in current.process) or a value (to be used as the default).
 * @returns {object} the newly created popOp.
 */
export function createPopOp(type, map) {
    let op = env.popOp[type] = {
        div: UC.newElement('div', { id: `${type}-op`, class: "cam-pop-op" }),
        use: (rec) => {
            op.rec = rec;
            for (let [key, val] of Object.entries(op.inputs)) {
                let type = val.type;
                let from = map[key];
                let rval = rec[key];
                // fill undef entries older defines
                if (type && (rval === null || rval === undefined)) {
                    if (typeof (from) === 'string') {
                        rec[key] = env.current.process[from];
                    } else if (from !== undefined) {
                        rec[key] = from;
                    } else {
                        console.log('error', { key, val, type, from });
                    }
                }
            }
            api.util.rec2ui(rec, op.inputs);
            op.hideshow();
        },
        using: (rec) => {
            return op.rec === rec;
        },
        bind: (ev) => {
            console.log({ bind: type, map, op });
            api.util.ui2rec(op.rec, op.inputs);

            const settings = conf.get();
            const { tool } = new Tool(settings, op.rec.tool); //get tool by id
            const opType = op.rec.type
            const drillOrRegister = opType == "drill" || opType == "register"

            if (!drillOrRegister && tool.type == "drill") {
                alerts.show(`Warning: Drills should not be used for ${opType} operations.`)
            }
            else if (drillOrRegister && tool.type != "drill") {
                alerts.show(`Warning: Only drills should be used for drilling operations.`)
            }

            for (let [key, val] of Object.entries(op.rec)) {
                let saveTo = map[key];
                if (saveTo && typeof (key) === 'string' && !key.startsWith("~")) {
                    env.current.process[saveTo] = val;
                }
            }
            api.conf.save();
            op.hideshow();
        },
        new: () => {
            let rec = { type };
            for (let [key, src] of Object.entries(map)) {
                rec[key] = typeof (src) === 'string'
                    ? env.current.process[src.replace('~', '')]
                    : src;
            }
            return rec;
        },
        hideshow: () => {
            for (let inp of Object.values(op.inputs)) {
                let parent = inp.parentElement;
                if (parent && parent.setVisible && parent.__opt.show) {
                    parent.setVisible(parent.__opt.show(op, api.conf.get()));
                }
            }
        },
        addNote: () => {
            if (!op.note && type !== 'flip') {
                const divid = `div-${++seed}`;
                const noteid = `note-${++seed}`;
                const div = document.createElement('div');
                div.setAttribute('id', divid);
                div.classList.add('pop-tics')
                op.div.appendChild(div);
                div.innerHTML = h.build(
                    h.div([h.label({ id: noteid })])
                );
                op.note = { divid, noteid };
            }
            if (op.note) {
                const { divid, noteid } = op.note;
                const div = $(divid);
                if (div) div.onclick = () => {
                    api.uc.prompt('Edit Note for Operation', env.poppedRec.note || '').then(note => {
                        if (note !== undefined && note !== null) {
                            env.poppedRec.note = op.x = note;
                            api.conf.save();
                        }
                        opRender();
                    });
                };
                const note = $(noteid);
                if (note) note.innerText = env.poppedRec.note || '';
            }
        },
        group: [],
    };

    /**
     * @function createRecordGetter
     * @description Creates a getter function for the current record.
     *              The getter will bind the current record to the op before returning it.
     *              This is useful for passing a record to a pre-slice function
     * @returns {function} A getter function for the current record.
     */
    op.createRecordGetter = () => {
        return () => {
            op.bind();
            return op.rec;
        }
    }

    UC.restore({
        addTo: op.div,
        bindTo: op.bind,
        lastDiv: op.div,
        lastGroup: op.group
    });
    return op;
}

export function createPopOps() {
    createPopOp('level', {
        tool: 'camLevelTool',
        spindle: 'camLevelSpindle',
        step: 'camLevelOver',
        rate: 'camLevelSpeed',
        down: 'camLevelDown',
        over: 'camLevelOver',
        stock: 'camLevelStock'
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 1.0) }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        down: UC.newInput(LANG.cc_loff_s, { title: LANG.cc_loff_l, convert: UC.toFloat, units: true }),
        over: UC.newInput(LANG.cc_lxyo_s, { title: LANG.cc_lxyo_l, convert: UC.toFloat, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        stock: UC.newBoolean(LANG.cc_lsto_s, undefined, { title: LANG.cc_lsto_l }),
    };

    createPopOp('rough', {
        tool: 'camRoughTool',
        spindle: 'camRoughSpindle',
        down: 'camRoughDown',
        step: 'camRoughOver',
        rate: 'camRoughSpeed',
        plunge: 'camRoughPlunge',
        leave: 'camRoughStock',
        leavez: 'camRoughStockZ',
        all: 'camRoughAll',
        voids: 'camRoughVoid',
        flats: 'camRoughFlat',
        inside: 'camRoughIn',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        plunge: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 1.0) }),
        leave: UC.newInput(LANG.cr_lsto_s, { title: LANG.cr_lsto_l, convert: UC.toFloat, units: true }),
        leavez: UC.newInput(LANG.cr_lstz_s, { title: LANG.cr_lstz_l, convert: UC.toFloat, bound: UC.bound(0, 10), units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        all: UC.newBoolean(LANG.cr_clst_s, undefined, { title: LANG.cr_clst_l, show: hasIndexing }),
        voids: UC.newBoolean(LANG.cr_clrp_s, undefined, { title: LANG.cr_clrp_l }),
        flats: UC.newBoolean(LANG.cr_clrf_s, undefined, { title: LANG.cr_clrf_l }),
        inside: UC.newBoolean(LANG.cr_olin_s, undefined, { title: LANG.cr_olin_l }),
        sep: UC.newBlank({ class: "pop-sep" }),
        exp: UC.newExpand("overrides"),
        ov_topz: UC.newInput(LANG.ou_ztop_s, { title: LANG.ou_ztop_l, convert: UC.toFloat, units: true }),
        ov_botz: UC.newInput(LANG.ou_zbot_s, { title: LANG.ou_zbot_l, convert: UC.toFloat, units: true }),
        ov_conv: UC.newBoolean(LANG.ou_conv_s, undefined, { title: LANG.ou_conv_l }),
        exp_end: UC.endExpand(),
    };

    createPopOp('outline', {
        tool: 'camOutlineTool',
        spindle: 'camOutlineSpindle',
        step: 'camOutlineOver',
        steps: 'camOutlineOverCount',
        down: 'camOutlineDown',
        rate: 'camOutlineSpeed',
        plunge: 'camOutlinePlunge',
        dogbones: 'camOutlineDogbone',
        omitvoid: 'camOutlineOmitVoid',
        omitthru: 'camOutlineOmitThru',
        outside: 'camOutlineOut',
        inside: 'camOutlineIn',
        wide: 'camOutlineWide',
        top: 'camOutlineTop',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        plunge: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 1.0), show: () => env.popOp.outline.rec.wide }),
        steps: UC.newInput(LANG.cc_sovc_s, { title: LANG.cc_sovc_l, convert: UC.toInt, bound: UC.bound(1, 5), show: () => env.popOp.outline.rec.wide }),
        sep: UC.newBlank({ class: "pop-sep" }),
        top: UC.newBoolean(LANG.co_clrt_s, undefined, { title: LANG.co_clrt_l }),
        inside: UC.newBoolean(LANG.co_olin_s, undefined, { title: LANG.co_olin_l, show: (op) => { return !op.inputs.outside.checked } }),
        outside: UC.newBoolean(LANG.co_olot_s, undefined, { title: LANG.co_olot_l, show: (op) => { return !op.inputs.inside.checked } }),
        sep: UC.newBlank({ class: "pop-sep" }),
        omitthru: UC.newBoolean(LANG.co_omit_s, undefined, { title: LANG.co_omit_l, xshow: (op) => { return op.inputs.outside.checked } }),
        omitvoid: UC.newBoolean(LANG.co_omvd_s, undefined, { title: LANG.co_omvd_l, xshow: (op) => { return op.inputs.outside.checked } }),
        wide: UC.newBoolean(LANG.co_wide_s, undefined, { title: LANG.co_wide_l, show: (op) => { return !op.inputs.inside.checked } }),
        dogbones: UC.newBoolean(LANG.co_dogb_s, undefined, { title: LANG.co_dogb_l, show: (op) => { return !op.inputs.wide.checked } }),
        sep: UC.newBlank({ class: "pop-sep" }),
        exp: UC.newExpand("overrides"),
        ov_topz: UC.newInput(LANG.ou_ztop_s, { title: LANG.ou_ztop_l, convert: UC.toFloat, units: true }),
        ov_botz: UC.newInput(LANG.ou_zbot_s, { title: LANG.ou_zbot_l, convert: UC.toFloat, units: true }),
        ov_conv: UC.newBoolean(LANG.ou_conv_s, undefined, { title: LANG.ou_conv_l }),
        exp_end: UC.endExpand(),
    };

    const contourFilter = gcodeEditor('Layer Filter', 'filter');

    createPopOp('contour', {
        tool: 'camContourTool',
        spindle: 'camContourSpindle',
        step: 'camContourOver',
        rate: 'camContourSpeed',
        angle: 'camContourAngle',
        leave: 'camContourLeave',
        tolerance: 'camTolerance',
        flatness: 'camFlatness',
        reduction: 'camContourReduce',
        bridging: 'camContourBridge',
        bottom: 'camContourBottom',
        curves: 'camContourCurves',
        inside: 'camContourIn',
        filter: 'camContourFilter',
        axis: 'X'
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        axis: UC.newSelect(LANG.cd_axis, {}, "xyaxis"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 10.0) }),
        leave: UC.newInput(LANG.cf_leav_s, { title: LANG.cf_leav_l, convert: UC.toFloat, bound: UC.bound(0, 100) }),
        sep: UC.newBlank({ class: "pop-sep" }),
        angle: UC.newInput(LANG.cf_angl_s, { title: LANG.cf_angl_l, convert: UC.toFloat, bound: UC.bound(45, 90), show: (op) => op.inputs.curves.checked }),
        flatness: UC.newInput(LANG.ou_flat_s, { title: LANG.ou_flat_l, convert: UC.toFloat, bound: UC.bound(0, 1.0), units: false, round: 4 }),
        tolerance: UC.newInput(LANG.ou_toll_s, { title: LANG.ou_toll_l, convert: UC.toFloat, bound: UC.bound(0, 10.0), units: true, round: 4 }),
        reduction: UC.newInput(LANG.ou_redu_s, { title: LANG.ou_redu_l, convert: UC.toInt, bound: UC.bound(0, 10), units: false }),
        // bridging:  UC.newInput(LANG.ou_brdg_s, {title:LANG.ou_brdg_l, convert:UC.toFloat, bound:UC.bound(0,1000.0), units:true, round:4, show:(op) => op.inputs.curves.checked}),
        sep: UC.newBlank({ class: "pop-sep" }),
        curves: UC.newBoolean(LANG.cf_curv_s, undefined, { title: LANG.cf_curv_l }),
        inside: UC.newBoolean(LANG.cf_olin_s, undefined, { title: LANG.cf_olin_l }),
        bottom: UC.newBoolean(LANG.cf_botm_s, undefined, { title: LANG.cf_botm_l, show: (op, conf) => conf ? conf.process.camZBottom : 0 }),
        filter: UC.newRow([UC.newButton(LANG.filter, contourFilter)], { class: "ext-buttons f-row" })
    };

    createPopOp('lathe', {
        tool: 'camLatheTool',
        spindle: 'camLatheSpindle',
        step: 'camLatheOver',
        angle: 'camLatheAngle',
        rate: 'camLatheSpeed',
        tolerance: 'camTolerance',
        filter: 'camContourFilter',
        leave: 'camContourLeave',
        linear: 'camLatheLinear'
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        // axis:      UC.newSelect(LANG.cd_axis, {}, "xyaxis"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 100.0) }),
        angle: UC.newInput(LANG.cc_sang_s, { title: LANG.cc_sang_l, convert: UC.toFloat, bound: UC.bound(0.01, 180.0) }),
        sep: UC.newBlank({ class: "pop-sep" }),
        tolerance: UC.newInput(LANG.ou_toll_s, { title: LANG.ou_toll_l, convert: UC.toFloat, bound: UC.bound(0, 10.0), units: true, round: 4 }),
        leave: UC.newInput(LANG.cf_leav_s, { title: LANG.cf_leav_l, convert: UC.toFloat, bound: UC.bound(0, 100) }),
        sep: UC.newBlank({ class: "pop-sep" }),
        linear: UC.newBoolean(LANG.ci_line_s, undefined, { title: LANG.ci_line_l }),
        // filter:    UC.newRow([ UC.newButton(LANG.filter, contourFilter) ], {class:"ext-buttons f-row"})
    };

    function canDogBones() {
        if (!env.poppedRec) return false;
        return env.poppedRec.mode === 'follow';// && env.poppedRec.offset && env.poppedRec.offset !== 'none';
    }

    function canDogBonesRev() {
        return canDogBones() && env.poppedRec.dogbone;
    }

    function zDogSep() {
        return canDogBones() || zBottom();
    }

    createPopOp('trace', {
        mode: 'camTraceType',
        offset: 'camTraceOffset',
        spindle: 'camTraceSpindle',
        tool: 'camTraceTool',
        step: 'camTraceOver',
        down: 'camTraceDown',
        thru: 'camTraceThru',
        rate: 'camTraceSpeed',
        plunge: 'camTracePlunge',
        offover: 'camTraceOffOver',
        dogbone: 'camTraceDogbone',
        revbone: 'camTraceDogbone',
        merge: 'camTraceMerge',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        mode: UC.newSelect(LANG.cu_type_s, { title: LANG.cu_type_l }, "trace"),
        offset: UC.newSelect(LANG.cc_offs_s, { title: LANG.cc_offs_l, show: () => (env.poppedRec.mode === 'follow') }, "traceoff"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        plunge: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 1.0), show: (op) => env.popOp.trace.rec.mode === "clear" }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true }),
        thru: UC.newInput(LANG.cc_thru_s, { title: LANG.cc_thru_l, convert: UC.toFloat, units: true }),
        offover: UC.newInput(LANG.cc_offd_s, { title: LANG.cc_offd_l, convert: UC.toFloat, units: true, show: () => env.poppedRec.offset !== "none" || env.poppedRec.mode === "clear" }),
        sep: UC.newBlank({ class: "pop-sep", modes: MODES.CAM, xshow: zDogSep }),
        merge: UC.newBoolean(LANG.co_merg_s, undefined, { title: LANG.co_merg_l, show: () => !env.popOp.trace.rec.down }),
        dogbone: UC.newBoolean(LANG.co_dogb_s, undefined, { title: LANG.co_dogb_l, show: canDogBones }),
        revbone: UC.newBoolean(LANG.co_dogr_s, undefined, { title: LANG.co_dogr_l, show: canDogBonesRev }),
        exp: UC.newExpand("overrides"),
        sep: UC.newBlank({ class: "pop-sep" }),
        ov_topz: UC.newInput(LANG.ou_ztop_s, { title: LANG.ou_ztop_l, convert: UC.toFloat, units: true }),
        ov_botz: UC.newInput(LANG.ou_zbot_s, { title: LANG.ou_zbot_l, convert: UC.toFloat, units: true }),
        ov_conv: UC.newBoolean(LANG.ou_conv_s, undefined, { title: LANG.ou_conv_l }),
        exp_end: UC.endExpand(),
        sep: UC.newBlank({ class: "pop-sep" }),
        menu: UC.newRow([UC.newButton("select", traceAdd)], { class: "ext-buttons f-row" }),
    };

    createPopOp('pocket', {
        spindle: 'camPocketSpindle',
        tool: 'camPocketTool',
        step: 'camPocketOver',
        down: 'camPocketDown',
        rate: 'camPocketSpeed',
        plunge: 'camPocketPlunge',
        expand: 'camPocketExpand',
        smooth: 'camPocketSmooth',
        refine: 'camPocketRefine',
        follow: 'camPocketFollow',
        contour: 'camPocketContour',
        engrave: 'camPocketEngrave',
        outline: 'camPocketOutline',
        ov_topz: 0,
        ov_botz: 0,
        ov_conv: '~camConventional',
        tolerance: 'camTolerance',
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true }),
        plunge: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        sep: UC.newBlank({ class: "pop-sep" }),
        step: UC.newInput(LANG.cc_sovr_s, { title: LANG.cc_sovr_l, convert: UC.toFloat, bound: UC.bound(0.01, 1.0) }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true, show: () => !env.poppedRec.contour }),
        sep: UC.newBlank({ class: "pop-sep" }),
        expand: UC.newInput(LANG.cp_xpnd_s, { title: LANG.cp_xpnd_l, convert: UC.toFloat, units: true, xshow: () => !env.poppedRec.contour }),
        refine: UC.newInput(LANG.cp_refi_s, { title: LANG.cp_refi_l, convert: UC.toInt, show: () => env.poppedRec.contour }),
        smooth: UC.newInput(LANG.cp_smoo_s, { title: LANG.cp_smoo_l, convert: UC.toInt }),
        tolerance: UC.newInput(LANG.ou_toll_s, { title: LANG.ou_toll_l, convert: UC.toFloat, bound: UC.bound(0, 10.0), units: true, round: 4, show: () => env.poppedRec.contour }),
        follow: UC.newInput(LANG.cp_foll_s, { title: LANG.cp_foll_l, convert: UC.toFloat }),
        sep: UC.newBlank({ class: "pop-sep" }),
        contour: UC.newBoolean(LANG.cp_cont_s, undefined, { title: LANG.cp_cont_s }),
        engrave: UC.newBoolean(LANG.cp_engr_s, undefined, { title: LANG.cp_engr_l, show: () => env.poppedRec.contour }),
        outline: UC.newBoolean(LANG.cp_outl_s, undefined, { title: LANG.cp_outl_l }),
        exp: UC.newExpand("overrides"),
        sep: UC.newBlank({ class: "pop-sep" }),
        ov_topz: UC.newInput(LANG.ou_ztop_s, { title: LANG.ou_ztop_l, convert: UC.toFloat, units: true }),
        ov_botz: UC.newInput(LANG.ou_zbot_s, { title: LANG.ou_zbot_l, convert: UC.toFloat, units: true }),
        ov_conv: UC.newBoolean(LANG.ou_conv_s, undefined, { title: LANG.ou_conv_l }),
        exp_end: UC.endExpand(),
        sep: UC.newBlank({ class: "pop-sep" }),
        menu: UC.newRow([UC.newButton("select", surfaceAdd)], { class: "ext-buttons f-row" }),
    };

    createPopOp('drill', {
        tool: 'camDrillTool',
        spindle: 'camDrillSpindle',
        down: 'camDrillDown',
        rate: 'camDrillDownSpeed',
        dwell: 'camDrillDwell',
        lift: 'camDrillLift',
        mark: 'camDrillMark',
        precision: 'camDrillPrecision',
        thru: 'camDrillThru',
        fromTop: 'camDrillFromStockTop',
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true }),
        dwell: UC.newInput(LANG.cd_dwll_s, { title: LANG.cd_dwll_l, convert: UC.toFloat }),
        lift: UC.newInput(LANG.cd_lift_s, { title: LANG.cd_lift_l, convert: UC.toFloat, units: true, show: () => !env.poppedRec.mark }),
        mark: UC.newBoolean(LANG.cd_mark_s, undefined, { title: LANG.cd_mark_l, show: () => !env.poppedRec.fromTop }),
        fromTop: UC.newBoolean(LANG.cd_ftop_s, undefined, { title: LANG.cd_ftop_l, show: () => !env.poppedRec.mark }),
        sep: UC.newBlank({ class: "pop-sep" }),
        thru: UC.newInput(LANG.cd_dtru_s, { title: LANG.cd_dtru_l, convert: UC.toFloat, units: true, show: () => !env.poppedRec.mark }),
        precision: UC.newInput(LANG.cd_prcn_s, { title: LANG.cd_prcn_l, convert: UC.toFloat, units: true, show: () => !env.poppedRec.mark }),
        sep: UC.newBlank({ class: "pop-sep", }),
        actions: UC.newRow([
            UC.newButton(LANG.select, () => selectHoles(true), { title: LANG.cd_seli_l }),
            UC.newButton(LANG.cd_sela_s, () => selectHoles(false), { title: LANG.cd_sela_l })
        ], { class: "ext-buttons f-col" })
    };

    createPopOp('register', {
        tool: 'camDrillTool',
        spindle: 'camDrillSpindle',
        down: 'camDrillDown',
        rate: 'camDrillDownSpeed',
        dwell: 'camDrillDwell',
        lift: 'camDrillLift',
        feed: 'camRegisterSpeed',
        thru: 'camRegisterThru'
    }).inputs = {
        tool: UC.newSelect(LANG.cc_tool, {}, "tools"),
        axis: UC.newSelect(LANG.cd_axis, {}, "regaxis"),
        points: UC.newSelect(LANG.cd_points, { show: () => env.poppedRec.axis !== '-' }, "regpoints"),
        sep: UC.newBlank({ class: "pop-sep" }),
        spindle: UC.newInput(LANG.cc_spnd_s, { title: LANG.cc_spnd_l, convert: UC.toInt, show: hasSpindle }),
        rate: UC.newInput(LANG.cc_plng_s, { title: LANG.cc_plng_l, convert: UC.toInt, units: true }),
        feed: UC.newInput(LANG.cc_feed_s, { title: LANG.cc_feed_l, convert: UC.toInt, units: true, show: () => env.poppedRec.axis === '-' }),
        sep: UC.newBlank({ class: "pop-sep" }),
        down: UC.newInput(LANG.cc_sdwn_s, { title: LANG.cc_sdwn_l, convert: UC.toFloat, units: true }),
        dwell: UC.newInput(LANG.cd_dwll_s, { title: LANG.cd_dwll_l, convert: UC.toFloat, show: () => env.poppedRec.axis !== '-' }),
        lift: UC.newInput(LANG.cd_lift_s, { title: LANG.cd_lift_l, convert: UC.toFloat, units: true, show: () => env.poppedRec.axis !== '-' }),
        sep: UC.newBlank({ class: "pop-sep" }),
        thru: UC.newInput(LANG.cd_thru_s, { title: LANG.cd_thru_l, convert: UC.toFloat, units: true }),
    };

    createPopOp('flip', {
        axis: 'camFlipAxis',
        invert: 'camFlipInvert'
    }).inputs = {
        axis: UC.newSelect(LANG.cd_axis, {}, "regaxis"),
        sep: UC.newBlank({ class: "pop-sep", modes: MODES.CAM, show: zBottom }),
        invert: UC.newBoolean(LANG.cf_nvrt_s, undefined, { title: LANG.cf_nvrt_l, show: zBottom }),
        sep: UC.newBlank({ class: "pop-sep" }),
        action: UC.newRow([UC.newButton(LANG.cf_menu, opFlip)], { class: "ext-buttons f-row" })
    };

    createPopOp('gcode', {
        gcode: 'camCustomGcode',
    }).inputs = {
        action: UC.newRow([UC.newButton(LANG.edit, gcodeEditor())], { class: "ext-buttons f-row" })
    };

    function angleTowardZUp() {
        api.event.emit('tool.mesh.face-up');
    }

    createPopOp('index', {
        degrees: 'camIndexAxis',
        absolute: 'camIndexAbs'
    }).inputs = {
        degrees: UC.newInput(LANG.ci_degr_s, { title: LANG.ci_degr_l, convert: UC.toFloat, bound: UC.bound(-360, 360.0) }),
        absolute: UC.newBoolean(LANG.ci_abso_s, undefined, { title: LANG.ci_abso_l }),
        select: UC.newRow([UC.newButton(LANG.ci_face_s, angleTowardZUp)], { class: "ext-buttons f-row" })
    };

    const editEnable = gcodeEditor('Laser Enable Script', 'enable');
    const editOn = gcodeEditor('Laser On Script', 'on');
    const editOff = gcodeEditor('Laser Off Script', 'off');

    createPopOp('laser on', {
        enable: 'camLaserEnable',
        on: 'camLaserOn',
        off: 'camLaserOff',
        power: 'camLaserPower',
        adapt: 'camLaserAdaptive',
        adaptrp: 'camLaserAdaptMod',
        flat: 'camLaserFlatten',
        flatz: 'camLaserFlatZ',
        minp: 'camLaserPowerMin',
        maxp: 'camLaserPowerMax',
        minz: 'camLaserZMin',
        maxz: 'camLaserZMax',
    }).inputs = {
        enable: UC.newRow([UC.newButton(LANG.enable, editEnable)], { class: "ext-buttons f-row" }),
        on: UC.newRow([UC.newButton(LANG.on, editOn)], { class: "ext-buttons f-row" }),
        off: UC.newRow([UC.newButton(LANG.off, editOff)], { class: "ext-buttons f-row" }),
        sep: UC.newBlank({ class: "pop-sep" }),
        power: UC.newInput(LANG.cl_powr_s, { title: LANG.cl_powr_l, convert: UC.toFloat, bound: UC.bound(0, 1.0), show: () => !env.poppedRec.adapt }),
        maxp: UC.newInput(LANG.cl_maxp_s, { title: LANG.cl_maxp_l, convert: UC.toFloat, bound: UC.bound(0, 1.0), show: () => env.poppedRec.adapt }),
        minp: UC.newInput(LANG.cl_minp_s, { title: LANG.cl_minp_l, convert: UC.toFloat, bound: UC.bound(0, 1.0), show: () => env.poppedRec.adapt }),
        maxz: UC.newInput(LANG.cl_maxz_s, { title: LANG.cl_maxz_l, convert: UC.toFloat, show: () => env.poppedRec.adapt }),
        minz: UC.newInput(LANG.cl_minz_s, { title: LANG.cl_minz_l, convert: UC.toFloat, show: () => env.poppedRec.adapt }),
        flatz: UC.newInput(LANG.cl_flaz_s, { title: LANG.cl_flaz_l, convert: UC.toFloat, show: () => env.poppedRec.flat }),
        sep: UC.newBlank({ class: "pop-sep" }),
        adapt: UC.newBoolean(LANG.cl_adap_s, undefined, { title: LANG.cl_adap_l }),
        adaptrp: UC.newBoolean(LANG.cl_adrp_s, undefined, { title: LANG.cl_adrp_l, show: () => env.poppedRec.adapt }),
        flat: UC.newBoolean(LANG.cl_flat_s, undefined, { title: LANG.cl_flat_l }),
    };

    const editDisable = gcodeEditor('Laser Disable Script', 'disable');

    createPopOp('laser off', {
        disable: 'camLaserDisable',
    }).inputs = {
        disable: UC.newRow([UC.newButton(LANG.disable, editDisable)], { class: "ext-buttons f-row" }),
    };

    createPopOp('|', {}).inputs = {};
}
