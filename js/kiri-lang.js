/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_lang = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.lang) return;

    let KIRI = self.kiri,
        LANG = self.kiri.lang = {},
        lset = navigator.language.toLocaleLowerCase();

    LANG.set = function() {
        let map, key, keys = [...arguments];
        for (let i=0; i<keys.length; i++)
        {
            key = keys[i]
            if (!(map = LANG[key])) {
                continue;
            }
            let missing = [];
            let invalid = [];
            // default to EN values when missing
            Object.keys(LANG.en).forEach(key => {
                if (!map[key]) {
                    map[key] = LANG.en[key];
                    missing.push(key);
                }
            });
            // update current map from chosen map
            Object.keys(map).forEach(key => {
                if (LANG.en[key]) {
                    LANG.current[key] = map[key];
                } else {
                    invalid.push(key);
                }
            });
            if (missing.length) {
                console.log(`language map "${key}" missing keys [${missing.length}]: ${missing.join(', ')}`);
            }
            if (invalid.length) {
                console.log(`language map "${key}" invalid keys [${invalid.length}]: ${invalid.join(', ')}`);
            }
            return key;
        }
        return undefined;
    }

    // english. other language maps will defer to english
    // map for any missing key/value pairs
    LANG['en'] =
    LANG['en-us'] = {
        version:        "version",

        // DEVICE dialog (_s = label, _l = hover help)
        dv_gr_dev:      "device",
        dv_name_s:      "name",
        dv_name_l:      "device name",
        dv_fila_s:      "filament",
        dv_fila_l:      "diameter in millimeters",
        dv_nozl_s:      "nozzle",
        dv_nozl_l:      "diameter in millimeters",
        dv_bedw_s:      "bed width",
        dv_bedw_l:      "millimeters",
        dv_bedd_s:      "bed depth",
        dv_bedd_l:      "millimeters",
        dv_bedh_s:      "max height",
        dv_bedh_l:      "max build height\nin millimeters",
        dv_spmx_s:      "max spindle rpm",
        dv_spmx_l:      "max spindle speed\n0 to disable",
        dv_xtab_s:      "extrude absolute",
        dv_xtab_l:      "extrusion moves absolute",
        dv_orgc_s:      "origin center",
        dv_orgc_l:      "bed origin center",
        dv_orgt_s:      "origin top",
        dv_orgt_l:      "part z origin top",
        dv_bedc_s:      "circular bed",
        dv_bedc_l:      "device bed is circular",

        // DEVICE dialog gcode (_s = label, _l = hover help)
        dv_gr_gco:      "gcode",
        dv_fanp_s:      "fan power",
        dv_fanp_l:      "set cooling fan power",
        dv_prog_s:      "progress",
        dv_prog_l:      "output on each % progress",
        dv_layr_s:      "layer",
        dv_layr_l:      "output at each\nlayer change",
        dv_tksp_s:      "token spacing",
        dv_tksp_l:      "gcode token spacer",
        dv_strc_s:      "strip comments",
        dv_strc_l:      "strip gcode comments",
        dv_fext_s:      "file extension",
        dv_fext_l:      "file name extension",
        dv_dwll_s:      "dwell",
        dv_dwll_l:      "gcode dwell script",
        dv_tool_s:      "tool change",
        dv_tool_l:      "tool change script",
        dv_sspd_s:      "spindle speed",
        dv_sspd_l:      "set spindle speed",
        dv_paus_s:      "pause",
        dv_paus_l:      "gcode pause script",
        dv_head_s:      "header",
        dv_head_l:      "gcode header script",
        dv_foot_s:      "footer",
        dv_foot_l:      "gcode footer script",
        dv_lzon_s:      "laser on",
        dv_lzon_l:      "gcode laser on script",
        dv_lzof_s:      "laser off",
        dv_lzof_l:      "gcode laser off script",

        // MODE menu
        mo_menu:        "mode",
        mo_fdmp:        "FDM Printing",
        mo_lazr:        "Laser Cutting",
        mo_cncm:        "CNC Milling",

        // SETUP menu
        su_menu:        "setup",
        su_devi:        "Devices",
        su_tool:        "Tools",
        su_locl:        "Local",
        su_help:        "Help",

        // FUNCTION menu
        fn_menu:        "function",
        fn_impo:        "Import",
        fn_arra:        "Arrange",
        fn_slic:        "Slice",
        fn_prev:        "Preview",
        fn_expo:        "Export",

        // VIEW menu
        vu_menu:        "view",
        vu_home:        "home",
        vu_rset:        "reset",
        vu_sptp:        "top",
        vu_spfr:        "front",
        vu_splt:        "left",
        vu_sprt:        "right",

        // WORKSPACE menu
        ws_menu:        "workspace",
        ws_save:        "Save",
        ws_cler:        "Clear",

        // OPTIONS menu
        op_menu:        "options",
        op_show_s:      "show origin",
        op_show_l:      "show device or process origin",
        op_alig_s:      "align top",
        op_alig_l:      "align parts to the\ntallest part when\nno stock is set",
        op_auto_s:      "auto layout",
        op_auto_l:      "automatically layout platform\nwhen new items added\nor when arrange clicked\nmore than once",
        op_free_s:      "free layout",
        op_free_l:      "permit dragable layout",
        op_invr_s:      "invert zoom",
        op_invr_l:      "invert mouse wheel\nscroll zoom",
        op_unit_s:      "units",
        op_unit_l:      "workspace units affects\nspeeds and distances",

        // LAYERS pop-menu
        la_menu:        "layers",
        la_olin:        "outline",
        la_trce:        "trace",
        la_face:        "facing",
        la_ruff:        "roughing",
        la_fini:        "finishing",
        la_finx:        "finish x",
        la_finy:        "finish y",
        la_dlta:        "delta",
        la_slds:        "solids",
        la_fill:        "solid fill",
        la_sprs:        "sparse",
        la_sprt:        "support",
        la_prnt:        "print",
        la_move:        "moves",

        // SETTINGS menu
        se_menu:        "settings",
        se_load:        "load",
        se_save:        "save",
        se_xprt:        "expert",
        se_bsic:        "basic",

        // SLICING menu
        sl_menu:        "slicing",
        sl_lahi_s:      "layer height",
        sl_lahi_l:      "height of each slice\nlayer in millimeters",
        sl_shel_s:      "shell count",
        sl_shel_l:      "number of perimeter\nwalls to generate",
        sl_ltop_s:      "top layers",
        sl_ltop_l:      "number of solid layers\nto enforce at the\ntop of the print",
        sl_lsld_s:      "solid layers",
        sl_lsld_l:      "solid fill areas computed\nfrom layer deltas. see\nlayer pop menu",
        sl_lbot_s:      "base layers",
        sl_lbot_l:      "number of solid layers\nto enforce at the\nbottom of the print",

        // FILL menu
        fi_menu:        "fill",
        fi_type:        "type",
        fi_pcnt_s:      "percentage",
        fi_pcnt_l:      "fill density values\n0.0 - 1.0",
        fi_angl_s:      "solid angle",
        fi_angl_l:      "base angle in degrees",
        fi_over_s:      "overlap",
        fi_over_l:      "overlap with shell and fill\nas % of nozzle width\nhigher bonds better\n0.0 - 1.0",

        // FIRST LAYER menu
        fl_menu:        "first layer",
        fl_lahi_s:      "layer height",
        fl_lahi_l:      "height of each slice\nin millimeters\nshould be >= slice height",
        fl_rate_s:      "shell speed",
        fl_rate_h:      "printing max speed\nin millimeters / minute",
        fl_frat_s:      "fill speed",
        fl_frat_l:      "printing max speed\nin millimeters / minute",
        fl_mult_s:      "print factor",
        fl_mult_l:      "extrusion multiplier\n0.0 - 2.0",
        fl_skrt_s:      "skirt count",
        fl_skrt_l:      "number of first-layer offset\nbrims to generate",
        fl_skro_s:      "skirt offset",
        fl_skro_l:      "skirt offset from part\nin millimeters",
        fl_nozl_s:      "nozzle temp",
        fl_nozl_l:      "degrees in celsius\noutput setting used\nwhen this is zero",
        fl_bedd_s:      "bed temp",
        fl_bedd_l:      "degrees in celsius\noutput setting used\nwhen this is zero",

        // SUPPORT menu
        sp_menu:        "support",

    };

    LANG['test'] = { bogus: "not a valid key" };

    Object.keys(LANG.en).forEach(key => {
        LANG.test[key] = `*${LANG.en[key]}*`;
    });

    LANG.current = {};

    LANG.set(lset, lset.split('-')[0]);

})();
