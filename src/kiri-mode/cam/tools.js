/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri.api
// dep: kiri.consts
// dep: kiri.settings
gapp.register("kiri-mode.cam.tools", (root, exports) => {

    const DEG2RAD = Math.PI / 180;
    let { kiri } = root,
        { api, consts } = kiri,
        { uc, ui } = api,
        { MODES } = consts,
        DOC = document,
        selectedTool = null,
        editTools = null,
        maxTool = 0;

    api.show.tools = showTools;

    // extend API
    Object.assign(api.tool, {
        update: updateTool
    });

    function settings() {
        return api.conf.get();
    }

    function renderTools() {
        ui.toolSelect.innerHTML = '';
        maxTool = 0;
        editTools.forEach(function(tool, index) {
            maxTool = Math.max(maxTool, tool.number);
            tool.order = index;
            let opt = DOC.createElement('option');
            opt.appendChild(DOC.createTextNode(tool.name));
            opt.onclick = function() { selectTool(tool) };
            ui.toolSelect.appendChild(opt);
        });
    }

    function selectTool(tool) {
        selectedTool = tool;
        ui.toolName.value = tool.name;
        ui.toolNum.value = tool.number;
        ui.toolFluteDiam.value = tool.flute_diam;
        ui.toolFluteLen.value = tool.flute_len;
        ui.toolShaftDiam.value = tool.shaft_diam;
        ui.toolShaftLen.value = tool.shaft_len;
        ui.toolTaperTip.value = tool.taper_tip || 0;
        ui.toolMetric.checked = tool.metric;
        ui.toolType.selectedIndex = ['endmill','ballmill','tapermill'].indexOf(tool.type);
        if (tool.type === 'tapermill') {
            ui.toolTaperAngle.value = kiri.driver.CAM.calcTaperAngle(
                (tool.flute_diam - tool.taper_tip) / 2, tool.flute_len
            ).round(1);
        } else {
            ui.toolTaperAngle.value = 0;
        }
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
        ui.toolTaperAngle.disabled = taper ? undefined : 'true';
        ui.toolTaperTip.disabled = taper ? undefined : 'true';
        $('tool-view').innerHTML = '<svg id="tool-svg" width="100%" height="100%"></svg>';
        setTimeout(() => {
            let svg = $('tool-svg'),
                pad = 10,
                dim = { w: svg.clientWidth, h: svg.clientHeight },
                max = { w: dim.w - pad * 2, h: dim.h - pad * 2},
                off = { x: pad, y: pad },
                isBall = type === "ballmill",
                shaft_fill = "#cccccc",
                flute_fill = "#dddddd",
                stroke = "#777777",
                stroke_width = 3,
                stroke_thin = stroke_width / 2,
                shaft = tool.shaft_len || 1,
                flute = tool.flute_len || 1,
                total_len = shaft + flute,
                units = dim.h / total_len,
                shaft_len = (shaft / total_len) * max.h,
                flute_len = ((flute / total_len) * max.h),
                shaft_diam = tool.shaft_diam * units,
                flute_diam = tool.flute_diam * units,
                // total_wid = Math.max(flute_diam, shaft_diam),
                shaft_off = (max.w - shaft_diam) / 2,
                flute_off = (max.w - flute_diam) / 2,
                taper_off = (max.w - (tool.taper_tip || 0) * units) / 2,
                parts = [
                    // shaft rectangle
                    { rect: {
                        x: off.x + shaft_off,
                        y: off.y,
                        width: max.w - shaft_off * 2,
                        height: shaft_len,
                        fill: shaft_fill,
                        stroke_width,
                        stroke
                    } }
                ];
            if (type === "tapermill") {
                let yoff = off.y + shaft_len;
                // let mid = dim.w / 2;
                parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                    `M ${off.x + flute_off} ${yoff}`,
                    `L ${off.x + taper_off} ${yoff + flute_len}`,
                    `L ${dim.w - off.x - taper_off} ${yoff + flute_len}`,
                    `L ${dim.w - off.x - flute_off} ${yoff}`,
                    `z`
                ].join('\n')}});
            } else {
                let fl = isBall ? flute_len - flute_diam/2 : flute_len;
                let x1 = off.x + flute_off;
                let y1 = off.y + shaft_len;
                let x2 = x1 + max.w - flute_off * 2;
                let y2 = y1 + fl;
                // flute rectangle
                parts.push({ rect: {
                    x: off.x + flute_off,
                    y: off.y + shaft_len,
                    width: max.w - flute_off * 2,
                    height: fl,
                    fill: flute_fill,
                    stroke_width,
                    stroke,
                } });
                // hatch "fill" flute
                parts.push({ line: { x1, y1, x2, y2, stroke, stroke_width: stroke_thin } });
                parts.push({ line: {
                    x1: (x1 + x2) / 2, y1, x2, y2: (y1 + y2) / 2,
                    stroke, stroke_width: stroke_thin
                } });
                parts.push({ line: {
                    x1, y1: (y1 + y2) / 2, x2: (x1 + x2) / 2, y2,
                    stroke, stroke_width: stroke_thin
                } });
            }
            if (isBall) {
                let rad = (max.w - flute_off * 2) / 2;
                let xend = dim.w - off.x - flute_off;
                let yoff = off.y + shaft_len + flute_len + stroke_width/2 - flute_diam/2;
                parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                    `M ${off.x + flute_off} ${yoff}`,
                    `A ${rad} ${rad} 0 0 0 ${xend} ${yoff}`,
                    // `L ${off.x + flute_off} ${yoff}`
                ].join('\n')}})
            }
            svg.innerHTML = otag(parts);
        }, 10);
    }

    function updateTool(ev) {
        selectedTool.name = ui.toolName.value;
        selectedTool.number = parseInt(ui.toolNum.value);
        selectedTool.flute_diam = parseFloat(ui.toolFluteDiam.value);
        selectedTool.flute_len = parseFloat(ui.toolFluteLen.value);
        selectedTool.shaft_diam = parseFloat(ui.toolShaftDiam.value);
        selectedTool.shaft_len = parseFloat(ui.toolShaftLen.value);
        selectedTool.taper_tip = parseFloat(ui.toolTaperTip.value);
        selectedTool.metric = ui.toolMetric.checked;
        selectedTool.type = ['endmill','ballmill','tapermill'][ui.toolType.selectedIndex];
        if (selectedTool.type === 'tapermill') {
            const CAM = kiri.driver.CAM;
            const rad = (selectedTool.flute_diam - selectedTool.taper_tip) / 2;
            if (ev && ev.target === ui.toolTaperAngle) {
                const angle = parseFloat(ev.target.value);
                const len = CAM.calcTaperLength(rad, angle * DEG2RAD);
                selectedTool.flute_len = len;
                ui.toolTaperAngle.value = angle.round(1);
                ui.toolFluteLen.value = selectedTool.flute_len.round(4);
            } else {
                ui.toolTaperAngle.value = CAM.calcTaperAngle(rad, selectedTool.flute_len).round(1);
            }
        } else {
            ui.toolTaperAngle.value = 0;
        }
        renderTools();
        ui.toolSelect.selectedIndex = selectedTool.order;
        setToolChanged(true);
        renderTool(selectedTool);
    }

    function setToolChanged(changed) {
        editTools.changed = changed;
        ui.toolsSave.disabled = !changed;
    }

    function showTools() {
        if (api.mode.get_id() !== MODES.CAM) return;
        api.settings.sync.get().then(_showTools);
    }

    function _showTools() {
        let selectedIndex = null;

        editTools = settings().tools.slice().sort((a,b) => {
            return a.name > b.name ? 1 : -1;
        });

        setToolChanged(false);

        ui.toolsClose.onclick = function() {
            if (editTools.changed && !confirm("abandon changes?")) return;
            api.dialog.hide();
        };
        ui.toolAdd.onclick = function() {
            let metric = settings().controller.units === 'mm';
            editTools.push(Object.assign({
                id: Date.now(),
                number: maxTool + 1,
                name: "new tool",
                type: "endmill",
                taper_tip: 0,
                metric
            }, metric ? {
                shaft_diam: 2,
                shaft_len: 15,
                flute_diam: 2,
                flute_len: 20,
            } : {
                shaft_diam: 0.25,
                shaft_len: 1.5,
                flute_diam: 0.25,
                flute_len: 2,
            }));
            setToolChanged(true);
            renderTools();
            ui.toolSelect.selectedIndex = editTools.length-1;
            selectTool(editTools[editTools.length-1]);
        };
        ui.toolCopy.onclick = function() {
            let clone = Object.assign({}, selectedTool);
            let { name } = clone;
            let split = name.split(' ');
            let endv = parseInt(split.pop());
            if (endv) {
                name = split.join(' ') + ' ' + (endv + 1);
            } else {
                name = `${name} 2`;
            }
            clone.id = Date.now();
            clone.number = maxTool + 1;
            clone.name = name;
            editTools.push(clone);
            setToolChanged(true);
            renderTools();
            ui.toolSelect.selectedIndex = editTools.length-1;
            selectTool(editTools[editTools.length-1]);
        };
        ui.toolDelete.onclick = function() {
            editTools.remove(selectedTool);
            setToolChanged(true);
            renderTools();
        };
        ui.toolsSave.onclick = function() {
            if (selectedTool) updateTool();
            settings().tools = editTools.sort((a,b) => {
                return a.name < b.name ? -1 : 1;
            });
            setToolChanged(false);
            api.conf.save();
            api.conf.update_fields();
            api.event.settings();
            api.settings.sync.put();
        };
        ui.toolsImport.onclick = (ev) => api.event.import(ev);
        ui.toolsExport.onclick = () => {
            uc.prompt("Export Tools Filename", "tools").then(name => {
                if (!name) {
                    return;
                }
                const record = {
                    version: kiri.version,
                    tools: api.conf.get().tools,
                    time: Date.now()
                };
                api.util.download(api.util.b64enc(record), `${name}.km`);
            });
        };

        renderTools();
        if (editTools.length > 0) {
            selectTool(editTools[0]);
            ui.toolSelect.selectedIndex = 0;
        } else {
            ui.toolAdd.onclick();
        }

        api.dialog.show('tools');
        ui.toolSelect.focus();
    }

});