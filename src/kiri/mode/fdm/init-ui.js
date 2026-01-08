/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPoint } from '../../../geo/point.js';
import { $ } from '../../../moto/webui.js';
import { api } from '../../app/api.js';
import { colorSchemeRegistry } from '../../app/color/schemes.js';
import { conf } from '../../app/conf/defaults.js';
import { addPaintOverlayTexture, updatePaintOverlay } from '../../app/paint.js';

const { VIEWS } = api.const;

const LANG = api.language.current;

let lastView,
    addingSupports = false,
    removingSupports = false,
    isFdmMode = false,
    alert = [],
    down;

export function init() {
    const { ui } = api;
    const proc_keys = Object.keys(conf.defaults.fdm.p);
    const rangeVars = {
        // slice
        // "sliceHeight": LANG.sl_lahi_s,
        "sliceShells": LANG.sl_shel_s,
        "sliceFillType": LANG.fi_type,
        "sliceFillWidth": LANG.fi_wdth_s,
        "sliceFillSparse": LANG.fi_pcnt_s,
        "sliceFillGrow": LANG.fi_grow_s,
        "sliceSolidMinArea": LANG.ad_msol_s,
        "sliceTopLayers": LANG.sl_ltop_s,
        "sliceBottomLayers": LANG.sl_lbot_s,
        "firstLayerRate": LANG.fl_rate_s,
        "firstLayerFanSpeed": LANG.ou_fans_s,
        // prepare
        "sliceShellOrder": LANG.sl_ordr_s,
        "sliceFillOverlap": LANG.fi_over_s,
        "outputFeedrate": LANG.ou_feed_s,
        "outputFinishrate": LANG.ou_fini_s,
        "outputShellMult": LANG.ou_shml_s,
        "outputFillMult": LANG.ou_flml_s,
        "outputSparseMult": LANG.ou_spml_s,
        "outputRetractWipe": LANG.ad_wpln_s,
        "outputAlternating": LANG.ad_altr_s,
        "outputShortPoly": LANG.ad_spol_s,
        "outputMinSpeed": LANG.ad_mins_s,
        "outputCoastDist": LANG.ad_scst_s,
        "outputLoops": LANG.ag_loop_s,
        "sliceSupportDensity": LANG.sp_dens_s,
        "sliceSupportOffset": LANG.sp_offs_s,
        "sliceLayerStart": LANG.sl_strt_s,
        "firstLayerBrim": LANG.fl_brim_s,
        "firstLayerBrimIn": LANG.fl_brin_s,
        "firstLayerBrimTrig": LANG.fl_brmn_s,
        "firstLayerBrimGap": LANG.fl_brgp_s,
        // export
        "zHopDistance": LANG.ad_zhop_s,
        "arcTolerance": LANG.ad_zhop_s,
        "antiBacklash": LANG.ad_abkl_s,
        "outputTemp": LANG.ou_nozl_s,
        "outputBedTemp": LANG.ou_bedd_s,
        "outputFanSpeed": LANG.ou_fans_s,
        "outputRetractDist": LANG.ad_rdst_s,
        "outputRetractSpeed": LANG.ad_rrat_s,
        "outputRetractDwell": LANG.ad_rdwl_s,
        "outputLayerRetract": LANG.ad_lret_s
    };

    for (let key of Object.keys(rangeVars)) {
        if (ui[key]) {
            ui[key].range = true;
        }
    }

    function clearRanges() {
        api.conf.get().process.ranges = [];
        ui.fdmRanges.innerHTML = '';
    }

    function onEventFDM(topic, fn) {
        return api.event.on(topic, function() {
            if (!isFdmMode) return;
            fn(...arguments);
        });
    }

    // re-render ranges menu
    function updateRanges(ranges = []) {
        let html = [];
        let bind = [];
        let now = Date.now();
        let sorted = ranges.sort((a,b) => b.lo - a.lo);
        for (let range of sorted) {
            let id = (now++).toString(36);
            let rows = Object.entries(range.fields).map(a => `<div><label class="pad">${rangeVars[a[0]]}</label><span></span><label class="val">${a[1]}</label></div>`).join('');
            let hover = `<div id="hov_${id}" class="range-detail">${rows}</div>`;
            let info = `<button id="sel_${id}" class="j-center grow">${range.lo} - ${range.hi}</button><button id="del_${id}"><i class="fa fa-trash"></i></button>`;
            html.appendAll([
                `<div id="rng_${id}" class="range-info">${hover}${info}</div>`
            ]);
            bind.push({id, range});
        }
        ui.fdmRanges.innerHTML = html.join('');
        for (let rec of bind) {
            $(`sel_${rec.id}`).onclick = () => {
              api.show.layer(rec.range.hi, rec.range.lo);
            };
            $(`del_${rec.id}`).onclick = () => {
                let io = ranges.indexOf(rec.range);
                ranges.splice(io,1);
                updateRanges(ranges);
            };
          }
    }

    api.event.on("function.animate", (mode) => {
        if (!(isFdmMode && lastView === VIEWS.PREVIEW)) {
            return;
        }
        let slider = $('top-slider');
        slider.style.display = 'flex';
        slider.oninput = slider.onchange = (ev) => {
            api.const.STACKS.setFraction(parseInt(ev.target.value)/1000);
            api.space.update();
        };
        $('anim-slider').value = 500;
        api.const.STACKS.setFraction(0.5);
    });

    api.event.on("mode.set", mode => {
        isFdmMode = mode === 'FDM';
        // hide/show fdm mode elements
        for (let el of [...document.getElementsByClassName('mode-fdm')]) {
            api.uc.setClass(el, 'hide', !isFdmMode);
        }
    });

    api.event.on("view.set", view => {
        $('top-slider').style.display = 'none';
        lastView = view;
        supportDone();
        // let ranges = api.conf.get().process.ranges;
        if (isFdmMode) {
            if (lastView === VIEWS.SLICE) {
                for (let key of proc_keys) {
                    if (ui[key] && !ui[key].range) {
                        ui[key].disabled = true;
                    }
                }
            } else {
                for (let key of proc_keys) {
                    if (ui[key]) ui[key].disabled = false;
                }
            }
        }
    });

    api.event.on("range.updates", updateRanges);

    api.event.on("settings.load", (settings) => {
        if (settings.mode !== 'FDM') return;
        updateRanges(settings.process.ranges);
    });

    api.event.on("settings.saved", (settings) => {
        updateRanges(settings.process.ranges);
    });

    api.event.on("button.click", target => {
        switch (target) {
            case api.ui.ssmAdd: return supportStart({ remove: false });
            case api.ui.ssmDel: return supportStart({ remove: true });
            case api.ui.ssmClr: return supportClear();
        }
    });

    onEventFDM("key.esc", supportDone);

    onEventFDM("slice.begin", supportDone);

    // onEventFDM("slice.end", api.noop);

    onEventFDM("selection.scale", () => {
        clearRanges();
        supportClear()
    });

    // onEventFDM("widget.delete", api.noop);

    // onEventFDM("widget.duplicate", api.noop);

    // onEventFDM("widget.mirror", api.noop);

    onEventFDM("widget.rotate", rot => {
        let {widget, x, y, z} = rot;
        if (x || y) {
            clearWidgetSupports(widget);
        } else {
            // rotate supports when rotation is constrained to Z axis
            rotateWidgetPaint(widget, z);
        }
        api.conf.save();
    });

    onEventFDM("mouse.hover.up", (on = {}) => {
        if (!addingSupports) {
            return;
        }
        let { object } = on;
        if (object && down.z < 0) {
            let { point } = object;
            let { widget } = object.object;
            supportUpdate(point, widget, removingSupports);
        }
    });

    onEventFDM("mouse.hover", data => {
        if (!addingSupports) {
            return;
        }
    });
}

function clearWidgetSupports(widget) {
    delete widget.anno.support;
    widget.anno.paint = [];
}

function rotateWidgetPaint(widget, angle) {
    if (!widget.anno.paint?.length) {
        return;
    }

    // Z rotation angle in radians
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Rotate each paint point around the Z axis
    for (let paintPoint of widget.anno.paint) {
        const { point } = paintPoint;
        const x = point.x;
        const y = point.y;
        point.x = x * cos - y * sin;
        point.y = x * sin + y * cos;
    }
}

// start manual add supports
function supportStart({ remove } = { remove: false }) {
    if (addingSupports) {
        supportDone();
        if (removingSupports === remove) {
            return;
        }
    }
    removingSupports = remove;
    alert = api.show.alert(`[esc] key cancels ${remove?'removing':'adding'} supports`, 1000);
    api.feature.hover = addingSupports = true;
    api.feature.on_mouse_down = (int) => {
        if (int) {
            let { point } = int;
            down = { point, widget: int.object.widget, z: int.face.normal.z };
        }
        return api.widgets.meshes();
    };
    api.feature.on_mouse_drag = ({ int }) => {
        if (int?.length && int[0].face.normal.z < 0) {
            supportUpdate(int[0].point, down.widget, remove);
        }
        return [ down.widget.mesh ];
        // return api.widgets.meshes();
    };
    // Get paint color from scheme
    const mode = api.mode.get_id();
    const theme = api.space.is_dark() ? 'dark' : 'light';
    const scheme = colorSchemeRegistry.getScheme(mode, theme);
    const paintColor = scheme.operations?.paint?.overlay ?? 0x4488ff;

    api.widgets.each(w => {
        // Use pushVisualState to track the paint operation
        w.pushVisualState('paint', {
            material: w.mesh.material[0],
            restoreCallback: () => {
                w.mesh.material[0] = w.cache.mat;
                delete w.cache.mat;
            }
        });

        let mat = w.cache.mat = w.mesh.material[0];
        mat = w.mesh.material[0] = mat.clone();
        mat.needsUpdate = true;
        if (!w.anno.paint) {
            w.anno.paint = [];
        }
        addPaintOverlayTexture(mat, w.anno.paint, new THREE.Color(paintColor));
    })
    api.space.update();
}

function supportUpdate(point, widget, remove) {
    let { x, y, z } = point;
    let rec = {
        point: { x, y:-z, z:y },
        radius: 2
    };
    // return console.log({ on, widget, point });
    let paint = widget.anno.paint;
    let pt = newPoint(x, -z, y);
    for (let r of paint) {
        let { point } = r;
        let dist = newPoint(point.x, point.y, point.z).distTo2D(pt);
        if (remove && dist < 2) {
            r.delete = true;
        } else if (dist < 1) {
            return;
        }
    }
    if (remove) {
        paint = widget.anno.paint = paint.filter(rec => !rec.delete);
    } else {
        paint.push(rec);
    }
    updatePaintOverlay(widget.mesh.material[0], paint);
    api.space.update();
    api.conf.save();
};

// manual add done
function supportDone() {
    if (!addingSupports) {
        return;
    }
    api.feature.hover = addingSupports = false;
    api.feature.on_mouse_down = undefined;
    api.feature.on_mouse_drag = undefined;
    api.hide.alert(alert);
    api.widgets.each(w => {
        // Use popVisualState to restore original material
        w.popVisualState('paint');
    });
}

// manual supports clear
function supportClear() {
    supportDone();
    api.widgets.each(w => clearWidgetSupports(w));
    api.conf.save();
}
