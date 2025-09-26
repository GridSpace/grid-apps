/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';

let LANG = api.language.current;
let { FDM } = api.const.MODES,
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBlank, newButton, newBoolean, newGroup, newInput, newSelect, newRow } = uc,
    driven = true,
    hideable = true,
    separator = true,
    trigger = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

function onButtonClick(el) {
    api.event.emit('click.button', el);
}

function thinWallSave() {
    let opt = ui.sliceDetectThin;
    let level = opt.options[opt.selectedIndex];
    if (level) {
        api.conf.get().process.sliceDetectThin = level.value;
        api.conf.save();
    }
}

function isMultiHead() {
    let dev = api.conf.get().device;
    return isNotBelt() && dev.extruders && dev.extruders.length > 1;
}

function optSelected(sel) {
    let opt = sel.options[sel.selectedIndex];
    return opt ? opt.value : undefined;
}

function hasInfill() {
    return optSelected(ui.sliceFillType) !== 'none'
}

function fillIsLinear() {
    return hasInfill() && optSelected(ui.sliceFillType) === 'linear';
}

function zIntShow() {
    return settings().controller.devel;
}

function isBelt() {
    return api.device.isBelt();
}

function isNotBelt() {
    return !isBelt();
}

export function menu() {

    return {

    /** Left Side Menu */

    _____:               newGroup(LANG.sl_menu, $('fdm-layers'), { modes:FDM, driven, hideable, separator, group:"fdm-layers" }),
    sliceHeight:         newInput(LANG.sl_lahi_s, { title:LANG.sl_lahi_l, convert:toFloat }),
    sliceMinHeight:      newInput(LANG.ad_minl_s, { title:LANG.ad_minl_l, convert:toFloat, bound:bound(0,3.0), show:() => ui.sliceAdaptive.checked }),
    sliceTopLayers:      newInput(LANG.sl_ltop_s, { title:LANG.sl_ltop_l, convert:toInt }),
    sliceBottomLayers:   newInput(LANG.sl_lbot_s, { title:LANG.sl_lbot_l, convert:toInt }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceAdaptive:       newBoolean(LANG.ad_adap_s, onBooleanClick, { title: LANG.ad_adap_l }),
    outputLayerRetract:  newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l}),
    sliceLayerStart:     newSelect(LANG.sl_strt_s, {title:LANG.sl_strt_l}, "start"),
    _____:               newGroup(LANG.sw_menu, $('fdm-walls'), { modes:FDM, driven, hideable, separator, group:"fdm-walls" }),
    sliceShells:         newInput(LANG.sl_shel_s, { title:LANG.sl_shel_l, convert:toFloat }),
    sliceLineWidth:      newInput(LANG.sl_line_s, { title:LANG.sl_line_l, convert:toFloat, bound:bound(0,5) }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceShellOrder:     newSelect(LANG.sl_ordr_s, { title:LANG.sl_ordr_l}, "shell"),
    sliceDetectThin:     newSelect(LANG.ad_thin_s, { title: LANG.ad_thin_l, action: thinWallSave }, "thin"),
    outputAlternating:   newBoolean(LANG.ad_altr_s, onBooleanClick, {title:LANG.ad_altr_l}),
    sliceZInterleave:    newBoolean(LANG.ad_zint_s, onBooleanClick, {title:LANG.ad_zint_l, show:zIntShow}),
    _____:               newGroup(LANG.fs_menu, $('fdm-solid'), { modes:FDM, driven, hideable, separator, group:"fdm-solid" }),
    sliceFillAngle:      newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:toFloat}),
    sliceFillOverlap:    newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:toFloat, bound:bound(0.0,2.0)}),
    sliceFillGrow:       newInput(LANG.fi_grow_s, {title:LANG.fi_grow_l, convert:toFloat}),
    sliceSolidMinArea:   newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:toFloat}),
    _____:               newGroup(LANG.fi_menu, $('fdm-fill'), { modes:FDM, driven, hideable, separator, group:"fdm-fill" }),
    sliceFillType:       newSelect(LANG.fi_type, {trigger}, "infill"),
    sliceFillSparse:     newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:toFloat, bound:bound(0.0,1.0), show:hasInfill}),
    sliceFillRepeat:     newInput(LANG.fi_rept_s, {title:LANG.fi_rept_l, convert:toInt,   bound:bound(1,10),    show:fillIsLinear}),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceFillRate:       newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:toInt,   bound:bound(0,500)}),
    sliceSolidRate:      newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:toInt,   bound:bound(0,500)}),
    _____:               newGroup(LANG.fh_menu, $('fdm-heat'), { modes:FDM, driven, hideable, separator, group:"fdm-heat" }),
    outputTemp:          newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:toInt}),
    outputBedTemp:       newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:toInt}),
    _____:               newGroup(LANG.fc_menu, $('fdm-cool'), { modes:FDM, driven, hideable, separator, group:"fdm-cool" }),
    outputFanLayer:      newInput(LANG.ou_fanl_s, { title:LANG.ou_fanl_l, convert:toInt,   bound:bound(0,255) }),
    outputFanSpeed:      newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt, bound:bound(0,255)}),
    _____:               newGroup(LANG.sp_menu, $('fdm-support'), { modes:FDM, driven, hideable, separator, group:"fdm-supp" }),
    sliceSupportNozzle:  newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, show:isMultiHead}, "extruders"),
    sliceSupportDensity: newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:toFloat, bound:bound(0.0,1.0)}),
    sliceSupportSize:    newInput(LANG.sp_size_s, {title:LANG.sp_size_l, convert:toFloat, bound:bound(1.0,200.0)}),
    sliceSupportOffset:  newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, convert:toFloat, bound:bound(0.0,200.0)}),
    sliceSupportGap:     newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, convert:toInt,   bound:bound(0,5)}),
    sliceSupportArea:    newInput(LANG.sp_area_s, {title:LANG.sp_area_l, convert:toFloat, bound:bound(0.0,200.0)}),
    sliceSupportExtra:   newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, convert:toFloat, bound:bound(0.0,10.0)}),
    sliceSupportGrow:    newInput(LANG.sp_grow_s, {title:LANG.sp_grow_l, convert:toFloat, bound:bound(0.0,10.0)}),
    sliceSupportAngle:   newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, convert:toFloat, bound:bound(0.0,90.0)}),
    sliceSupportSpan:    newInput(LANG.sp_span_s, {title:LANG.sp_span_l, convert:toFloat, bound:bound(0.0,200.0), show:() => ui.sliceSupportEnable.checked }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceSupportEnable:  newBoolean(LANG.sp_auto_s, onBooleanClick, {title:LANG.sp_auto_l, show:isNotBelt}),
    sliceSupportOutline: newBoolean(LANG.sp_outl_s, onBooleanClick, {title:LANG.sp_outl_l}),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceSupportGen:     newRow([
        ui.ssaGen = newButton(LANG.sp_detect, onButtonClick, {class: "f-col grow a-center"})
    ], { modes: FDM, class: "ext-buttons f-row grow" }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceSupportManual: newRow([
        (ui.ssmAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
        (ui.ssmDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
        (ui.ssmClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
    ], {class:"ext-buttons f-row"}),
    _____:               newGroup(LANG.fl_menu, $('fdm-base'), { modes:FDM, driven, hideable, separator, group:"fdm-base" }),
    firstSliceHeight:    newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:toFloat, show:isNotBelt}),
    firstLayerNozzleTemp:newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:toInt,   show:isNotBelt}),
    firstLayerBedTemp:   newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:toInt,   show:isNotBelt}),
    separator:           newBlank({ class:"set-sep", driven }),
    firstLayerFanSpeed:  newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt,   bound:bound(0,255), show:isBelt}),
    firstLayerYOffset:   newInput(LANG.fl_zoff_s, {title:LANG.fl_zoff_l, convert:toFloat, show:isBelt}),
    firstLayerFlatten:   newInput(LANG.fl_flat_s, {title:LANG.fl_flat_l, convert:toFloat, show:isBelt}),
    firstLayerRate:      newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:toFloat}),
    firstLayerFillRate:  newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:toFloat, show:isNotBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
    firstLayerLineMult:  newInput(LANG.fl_sfac_s, {title:LANG.fl_sfac_l, convert:toFloat, bound:bound(0.5,2), show:isNotBelt}),
    firstLayerPrintMult: newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:toFloat}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    firstLayerBrim:      newInput(LANG.fl_brim_s, {title:LANG.fl_brim_l, convert:toInt,   show:isBelt}),
    firstLayerBrimIn:    newInput(LANG.fl_brin_s, {title:LANG.fl_brin_l, convert:toInt,   show:isBelt}),
    firstLayerBrimTrig:  newInput(LANG.fl_brmn_s, {title:LANG.fl_brmn_l, convert:toInt,   show:isBelt}),
    firstLayerBrimGap:   newInput(LANG.fl_brgp_s, {title:LANG.fl_brgp_l, convert:toFloat, show:isBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    firstLayerBeltLead:  newInput(LANG.fl_bled_s, {title:LANG.fl_bled_l, convert:toFloat, show:isBelt}),
    firstLayerBeltBump:  newInput(LANG.fl_blmp_s, {title:LANG.fl_blmp_l, convert:toFloat, bound:bound(0, 10), show:isBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
    outputBrimCount:     newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:toInt,   show:isNotBelt}),
    outputBrimOffset:    newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:toFloat, show:isNotBelt}),
    outputRaftSpacing:   newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:toFloat, bound:bound(0.0,3.0), show: () => ui.outputRaft.checked && isNotBelt() }),
    separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
    outputRaft:          newBoolean(LANG.fr_nabl_s, onBooleanClick, {title:LANG.fr_nabl_l, trigger, show:() => isNotBelt()}),
    outputDraftShield:   newBoolean(LANG.fr_draf_s, onBooleanClick, {title:LANG.fr_draf_l, trigger, show:() => isNotBelt()}),
    _____:               newGroup(LANG.ou_menu, $('fdm-output'), { modes:FDM, driven, hideable, separator, group:"fdm-out" }),
    outputFeedrate:      newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:toInt}),
    outputFinishrate:    newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:toInt}),
    outputSeekrate:      newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:toInt}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputShellMult:     newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    outputFillMult:      newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    outputSparseMult:    newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputRetractDist:   newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:toFloat}),
    outputRetractSpeed:  newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:toInt}),
    outputRetractWipe:   newInput(LANG.ad_wpln_s, {title:LANG.ad_wpln_l, convert:toFloat, bound:bound(0.0,10)}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputAvoidGaps:     newBoolean(LANG.ad_agap_s, onBooleanClick, {title:LANG.ad_agap_l}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    outputBeltFirst:     newBoolean(LANG.ad_lbir_s, onBooleanClick, {title:LANG.ad_lbir_l, show:isBelt}),
    _____:               newGroup(LANG.ad_menu, $('fdm-expert'), { modes:FDM, driven, hideable, separator, group:"fdm-xprt" }),
    sliceAngle:          newInput(LANG.sl_angl_s, {title:LANG.sl_angl_l, convert:toFloat, show:isBelt}),
    antiBacklash:        newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, convert:toFloat, bound:bound(0,3)}),
    arcTolerance:        newInput(LANG.ad_arct_s, {title:LANG.ad_arct_l, convert:toFloat, bound:bound(0,1.0), show:() => { return isNotBelt() }}),
    outputRetractDwell:  newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:toInt}),
    outputMinSpeed:      newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, convert:toFloat, bound:bound(1,200)}),
    outputPurgeTower:    newInput(LANG.ad_purg_s, {title:LANG.ad_purg_l, convert:toInt,   bound:bound(0,1000)}),
    outputShortPoly:     newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, convert:toFloat, bound:bound(0,10000)}),
    outputCoastDist:     newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, convert:toFloat, bound:bound(0.0,10)}),
    zHopDistance:        newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, convert:toFloat, bound:bound(0,3.0)}),
    outputLoops:         newInput(LANG.ag_loop_s, {title:LANG.ag_loop_l, convert:toInt,   bound:bound(-1,1000), show:isBelt}),

    fdmRanges:    $('fdm-ranges'),

    };
}
