/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../../app/api.js';

let LANG = api.language.current;
let { SLA } = api.const.MODES,
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBoolean, newGroup, newInput, newSelect } = uc,
    driven = true,
    separator = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

export function menu() {

    return {

    /** Left Side Menu */

    slaProc:             newGroup(LANG.sa_menu, $('sla-slice'), { modes:SLA, group:"sla-slice", driven, separator }),
    slaSlice:            newInput(LANG.sa_lahe_s, {title:LANG.sa_lahe_l, convert:toFloat}),
    slaShell:            newInput(LANG.sa_shel_s, {title:LANG.sa_shel_l, convert:toFloat}),
    slaOpenTop:          newBoolean(LANG.sa_otop_s, onBooleanClick, {title:LANG.sa_otop_l}),
    slaOpenBase:         newBoolean(LANG.sa_obas_s, onBooleanClick, {title:LANG.sa_obas_l}),
    slaLayers:           newGroup(LANG.sa_layr_m, $('sla-layers'), { modes:SLA, group:"sla-layers", driven, separator }),
    slaLayerOn:          newInput(LANG.sa_lton_s, {title:LANG.sa_lton_l, convert:toFloat}),
    slaLayerOff:         newInput(LANG.sa_ltof_s, {title:LANG.sa_ltof_l, convert:toFloat}),
    slaPeelDist:         newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:toFloat}),
    slaPeelLiftRate:     newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:toFloat}),
    slaPeelDropRate:     newInput(LANG.sa_pldr_s, {title:LANG.sa_pldr_l, convert:toFloat}),
    slaBase:             newGroup(LANG.sa_base_m, $('sla-base'), { modes:SLA, group:"sla-base", driven, separator }),
    slaBaseLayers:       newInput(LANG.sa_balc_s, {title:LANG.sa_balc_l, convert:toInt}),
    slaBaseOn:           newInput(LANG.sa_lton_s, {title:LANG.sa_bltn_l, convert:toFloat}),
    slaBaseOff:          newInput(LANG.sa_ltof_s, {title:LANG.sa_bltf_l, convert:toFloat}),
    slaBasePeelDist:     newInput(LANG.sa_pldi_s, {title:LANG.sa_pldi_l, convert:toFloat}),
    slaBasePeelLiftRate: newInput(LANG.sa_pllr_s, {title:LANG.sa_pllr_l, convert:toFloat}),
    slaFill:             newGroup(LANG.sa_infl_m, $('sla-fill'), { modes:SLA, group:"sla-infill", driven, separator }),
    slaFillDensity:      newInput(LANG.sa_ifdn_s, {title:LANG.sa_ifdn_l, convert:toFloat, bound:bound(0,1)}),
    slaFillLine:         newInput(LANG.sa_iflw_s, {title:LANG.sa_iflw_l, convert:toFloat, bound:bound(0,5)}),
    slaSupport:          newGroup(LANG.sa_supp_m, $('sla-support'), { modes:SLA, group:"sla-support", driven, separator }),
    slaSupportLayers:    newInput(LANG.sa_slyr_s, {title:LANG.sa_slyr_l, convert:toInt,   bound:bound(5,100)}),
    slaSupportGap:       newInput(LANG.sa_slgp_s, {title:LANG.sa_slgp_l, convert:toInt,   bound:bound(3,30)}),
    slaSupportDensity:   newInput(LANG.sa_sldn_s, {title:LANG.sa_sldn_l, convert:toFloat, bound:bound(0.01,0.9)}),
    slaSupportSize:      newInput(LANG.sa_slsz_s, {title:LANG.sa_slsz_l, convert:toFloat, bound:bound(0.1,1)}),
    slaSupportPoints:    newInput(LANG.sa_slpt_s, {title:LANG.sa_slpt_l, convert:toInt,   bound:bound(3,10)}),
    slaSupportEnable:    newBoolean(LANG.enable, onBooleanClick, {title:LANG.sl_slen_l}),
    slaOutput:           newGroup(LANG.sa_outp_m, $('sla-output'), { modes:SLA, driven, separator, group:"sla-output" }),
    slaFirstOffset:      newInput(LANG.sa_opzo_s, {title:LANG.sa_opzo_l, convert:toFloat, bound:bound(0,1)}),
    slaAntiAlias:        newSelect(LANG.sa_opaa_s, {title:LANG.sa_opaa_l}, "antialias"),

    };

}
