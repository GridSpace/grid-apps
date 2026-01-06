/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../../app/api.js';
import { conf } from '../../app/conf/defaults.js';
import { addPaintOverlayTexture, updatePaintOverlay } from '../../app/paint.js';

const { Matrix4, Vector3, BufferAttribute, BufferGeometryUtils, Raycaster, Euler } = THREE;
const { VIEWS } = api.const;

const LANG = api.language.current;

let lastView,
    addingSupports = false,
    isFdmMode = false,
    alert = [],
    func = {};

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
        func.sdone();
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
            case api.ui.ssaGen: return func.sgen();
            case api.ui.ssmAdd: return func.sadd();
            case api.ui.ssmDun: return func.sdone();
            case api.ui.ssmClr: return func.sclear();
        }
    });

    // auto-detect supports
    func.sgen = () => {
        let alerts = [];
        alerts.push(api.show.alert("analyzing part(s)...", 1000));
        setTimeout(() => api.hide.alert(undefined,alerts), 2000);
    }

    // manual add supports
    func.sadd = () => {
        if (addingSupports) {
            return func.sdone();
        }
        alert = api.show.alert("[esc] key cancels support editing", 1000);
        let down;
        api.feature.hover = addingSupports = true;
        api.feature.on_mouse_down = (int) => {
            if (int) {
                let { point } = int;
                down = { point, widget: int.object.widget };
            }
            return api.widgets.meshes();
        };
        api.feature.on_mouse_drag = ({ int }) => {
            if (int?.length) {
                func.sadd_point(int[0].point, down.widget);
            }
            return [ down.widget.mesh ];
            // return api.widgets.meshes();
        };
        api.widgets.each(w => {
            let mat = w.cache.mat = w.mesh.material[0];
            mat = w.mesh.material[0] = mat.clone();
            mat.needsUpdate = true;
            if (!w.anno.paint) {
                w.anno.paint = [];
            }
            addPaintOverlayTexture(mat, w.anno.paint, new THREE.Color(0x4488ff));
        })
        api.space.update();
    }

    func.sadd_point = (point, widget) => {
        let { x, y, z } = point;
        let rec = {
            point: { x, y:-z, z:y },
            radius: 2
        };
        // return console.log({ on, widget, point });
        let paint = widget.anno.paint;
        paint.push(rec);
        updatePaintOverlay(widget.mesh.material[0], paint);
        api.space.update();
        // api.conf.save();

    };

    // manual add done
    func.sdone = () => {
        if (!addingSupports) {
            return;
        }
        api.feature.hover = addingSupports = false;
        api.feature.on_mouse_down = undefined;
        api.feature.on_mouse_drag = undefined;
        api.hide.alert(alert);
        api.widgets.each(w => {
            w.mesh.material[0] = w.cache.mat;
            delete w.cache.mat;
        });
    }

    // manual supports clear
    func.sclear = () => {
        func.sdone();
        api.widgets.each(w => clearWidgetSupports(w));
        api.conf.save();
    }

    api.event.on("slice.begin", () => {
        if (!isFdmMode) {
            return;
        }
        func.sdone();
    });

    api.event.on("slice.end", () => {
        if (!isFdmMode) {
            return;
        }
    });

    api.event.on("key.esc", () => {
        if (isFdmMode) {
            func.sdone()
        }
    });

    api.event.on("selection.scale", () => {
        if (isFdmMode) {
            clearRanges();
            func.sclear();
        }
    });

    api.event.on("widget.delete", widget => {
        if (isFdmMode) {
            clearRanges();
        }
    });

    api.event.on("widget.duplicate", (widget, oldwidget) => {
        if (!isFdmMode) {
            return;
        }
    });

    api.event.on("widget.mirror", widget => {
        if (!isFdmMode) {
            return;
        }
    });

    api.event.on("widget.rotate", rot => {
        if (!isFdmMode) {
            return;
        }
        let {widget, x, y, z} = rot;
        if (x || y) {
            clearWidgetSupports(widget);
        } else {
            // todo rotate supports when it's only a Z rotation
        }
    });

    api.event.on("mouse.hover.up", func.hoverup = (on = {}) => {
        if (!(addingSupports && isFdmMode)) {
            return;
        }
        let { object } = on;
        if (object) {
            let { point } = object;
            let { widget } = object.object;
            func.sadd_point(point, widget);
        }
    });

    api.event.on("mouse.hover", data => {
        if (!(addingSupports && isFdmMode)) {
            return;
        }
        const { int, type, point, event } = data;
    });
}

function clearWidgetSupports(widget) {
    widget.anno.paint = [];
}
