/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../../core/api.js';
import { consts } from '../../core/consts.js';
import { settings as setconf } from '../../core/settings.js';
import { Tool, calcTaperAngle, calcTaperBallExtent, calcTaperLength } from './tool.js';

const DEG2RAD = Math.PI / 180;

let { MODES } = consts,
    DOC = document,
    selectedTool = null,
    editTools = null,
    maxTool = 0;

function settings() {
    return api.conf.get();
}

function renderTools() {
    api.ui.toolSelect.innerHTML = '';
    maxTool = 0;
    editTools.forEach(function(tool, index) {
        maxTool = Math.max(maxTool, tool.number);
        tool.order = index;
        let opt = DOC.createElement('option');
        opt.appendChild(DOC.createTextNode(tool.name));
        opt.onclick = function() { selectTool(tool) };
        api.ui.toolSelect.appendChild(opt);
    });
}

function selectTool(tool) {
    const { ui } = api;
    selectedTool = tool;

    api.util.rec2ui({
        toolName: selectedTool.name,
        toolType: selectedTool.type,
        toolNum: selectedTool.number,
        toolMetric: selectedTool.metric,
        toolShaftDiam: selectedTool.shaft_diam,
        toolShaftLen: selectedTool.shaft_len,
        toolFluteDiam: selectedTool.flute_diam,
        toolFluteLen: selectedTool.flute_len,
        toolTaperAngle: selectedTool.taper_angle,
        toolTaperTip: selectedTool.taper_tip,
    },{
        toolName: ui.toolName,
        toolType: ui.toolType,
        toolNum: ui.toolNum,
        toolMetric: ui.toolMetric,
        toolShaftDiam: ui.toolShaftDiam,
        toolShaftLen: ui.toolShaftLen,
        toolFluteDiam: ui.toolFluteDiam,
        toolFluteLen: ui.toolFluteLen,
        toolTaperAngle: ui.toolTaperAngle,
        toolTaperTip: ui.toolTaperTip,
    });

    if (tool.type === 'tapermill' || tool.type === 'taperball') {
        const ballRadius = tool.type === 'taperball' ? tool.taper_tip / 2 : 0;
        const taperLen = tool.flute_len - ballRadius;
        ui.toolTaperAngle.value =
            selectedTool.taper_angle =
            calcTaperAngle( (tool.flute_diam - tool.taper_tip) / 2, taperLen ).round(1);
    } else if (tool === 'drill') {
        ui.toolTaperAngle.value = selectedTool.taper_angle = 90;
    } else {
        ui.toolTaperAngle.value = selectedTool.taper_angle = 0;
    }

    renderTool2(tool);
}

export function updateTool(ev) {
    const { ui } = api;

    let changed = {
        toolName: selectedTool.name,
        toolType: selectedTool.type,
        toolNum: selectedTool.number,
        toolMetric: selectedTool.metric,
        toolShaftDiam: selectedTool.shaft_diam,
        toolShaftLen: selectedTool.shaft_len,
        toolFluteDiam: selectedTool.flute_diam,
        toolFluteLen: selectedTool.flute_len,
        toolTaperAngle: selectedTool.taper_angle,
        toolTaperTip: selectedTool.taper_tip,
    };

    api.util.ui2rec(changed,{
        toolName: ui.toolName,
        toolType: ui.toolType,
        toolNum: ui.toolNum,
        toolMetric: ui.toolMetric,
        toolShaftDiam: ui.toolShaftDiam,
        toolShaftLen: ui.toolShaftLen,
        toolFluteDiam: ui.toolFluteDiam,
        toolFluteLen: ui.toolFluteLen,
        toolTaperAngle: ui.toolTaperAngle,
        toolTaperTip: ui.toolTaperTip,
    });

    selectedTool.name = changed.toolName;
    selectedTool.type = changed.toolType;
    selectedTool.number = changed.toolNum;
    selectedTool.metric = changed.toolMetric;
    selectedTool.shaft_diam = changed.toolShaftDiam;
    selectedTool.shaft_len = changed.toolShaftLen;
    selectedTool.flute_diam = changed.toolFluteDiam;
    selectedTool.flute_len = changed.toolFluteLen;
    selectedTool.taper_angle = changed.toolTaperAngle;
    selectedTool.taper_tip = changed.toolTaperTip;

    if (selectedTool.type === 'tapermill' || selectedTool.type === 'taperball') {
        const rad = (selectedTool.flute_diam - selectedTool.taper_tip) / 2;
        const ballRadius = selectedTool.type === 'taperball' ? selectedTool.taper_tip / 2 : 0;

        if (ev && ev.target === ui.toolTaperAngle) {
            const angle = parseFloat(ev.target.value || 5);
            const len = calcTaperLength(rad, angle * DEG2RAD);
            selectedTool.flute_len = len + ballRadius;
            ui.toolTaperAngle.value = angle.round(1);
            ui.toolFluteLen.value = selectedTool.flute_len.round(4);
        } else {
            const taperLen = selectedTool.flute_len - ballRadius;
            ui.toolTaperAngle.value =
                selectedTool.taper_angle =
                calcTaperAngle(rad, taperLen).round(1);
        }
    } else {
        ui.toolTaperAngle.value = selectedTool.taper_angle = 0;
    }

    renderTools();
    setToolChanged(true);
    renderTool2(selectedTool);
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
    const { ui } = api;
    let type = selectedTool.type;
    let taper = type === 'tapermill';
    let taperball = type === 'taperball';
    let drill = type === 'drill';
    const drillAngleRad = 140 * Math.PI / 180;
    ui.toolTaperAngle.disabled = (taper || taperball) ? undefined : 'true';
    ui.toolTaperTip.disabled = (taper || taperball) ? undefined : 'true';
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
            drillTip = drill ?  0.5 * tool.flute_diam * Math.sin(drillAngleRad) : 0,
            total_len = shaft + flute+drillTip,
            units = dim.h / total_len,
            shaft_len = (shaft / total_len) * max.h,
            flute_len = (flute / total_len) * max.h,
            drill_tip_len = (drillTip / total_len) * max.h,
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
        if (taper) {
            let yoff = off.y + shaft_len;
            // let mid = dim.w / 2;
            parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                `M ${off.x + flute_off} ${yoff}`,
                `L ${off.x + taper_off} ${yoff + flute_len}`,
                `L ${dim.w - off.x - taper_off} ${yoff + flute_len}`,
                `L ${dim.w - off.x - flute_off} ${yoff}`,
                `z`
            ].join('\n')}});
        } else if (taperball) {
            // taper ball: taper body + ball tip at bottom
            let yoff = off.y + shaft_len;
            let ball_radius = tool.taper_tip / 2;
            let ball_radius_pix = ball_radius * units;
            let taper_len_pix = flute_len - ball_radius_pix;
            let yball = yoff + taper_len_pix;
            let rad = ball_radius_pix;
            let xstart = off.x + flute_off;
            let xend = dim.w - off.x - flute_off;
            let xtip_left = off.x + taper_off;
            let xtip_right = dim.w - off.x - taper_off;

            // draw taper trapezoid down to where ball starts
            parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                `M ${xstart} ${yoff}`,
                `L ${xtip_left} ${yball}`,
                `L ${xtip_right} ${yball}`,
                `L ${xend} ${yoff}`,
                `z`
            ].join('\n')}});

            // draw ball arc at bottom
            parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                `M ${xtip_left} ${yball}`,
                `A ${rad} ${rad} 0 0 0 ${xtip_right} ${yball}`,
            ].join('\n')}});
        } else if(drill){
            const x1 = off.x + flute_off,
            y1 = off.y + shaft_len,
            x2 = dim.w - off.x - flute_off,
            y2 = y1 + flute_len,
            xMid = dim.w / 2

            parts.push({path: {stroke_width, stroke, fill:flute_fill, d:[
                `M ${x1} ${y1}`, //move to top left
                `L ${x1} ${y2}`, //line to bottom left
                `L ${xMid} ${y2+drill_tip_len}`, //line to bottom mid point
                `L ${x2} ${y2}`, //line to bottom right
                `L ${x2} ${y1}`, //line to top right
                `z`
            ].join('\n')}});
            //add drill flute lines
            parts.push({ line: {
                x1, y1, x2, y2: (y1 + y2) / 2,
                stroke, stroke_width: stroke_thin
            } });
            parts.push({ line: {
                x1, y1: (y1 + y2) / 2, x2, y2,
                stroke, stroke_width: stroke_thin
            } });
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

function renderTool2(tool) {
    const { ui } = api;
    $('tool-view').innerHTML = '<svg id="tool-svg" width="100%" height="100%"></svg>';
    setTimeout(() => {
        let svg = $('tool-svg');
        let pad = 10;
        let dim = { w: svg.clientWidth, h: svg.clientHeight };
        let max = { w: dim.w - pad * 2, h: dim.h - pad * 2 };
        let off = { x: pad, y: pad };

        // Create Tool instance and generate profile
        const toolInst = new Tool(settings(), tool.id);
        const resolution = (toolInst.maxDiameter() / toolInst.unitScale()) / 20;
        toolInst.generateProfile(resolution);

        const profile = toolInst.profile;
        const { pix } = toolInst.profileDim;
        const center = Math.floor(pix / 2);

        console.log({ profile });

        // Extract cross-section at y=0 (center line)
        // Profile is stored as [dx, dy, z_offset, dx, dy, z_offset, ...]
        let crossSection = [];
        for (let i = 0; i < profile.length; i += 3) {
            let dx = profile[i];
            let dy = profile[i + 1];
            let z = profile[i + 2];

            // Only take points where dy is approximately 0 (center line)
            if (Math.abs(dy) < 0.01) {
                crossSection.push({ x: dx * resolution, z });
            }
        }

        // Find bounds
        let minZ = Math.min(...crossSection.map(p => p.z), -toolInst.fluteLength());
        let maxZ = Math.max(...crossSection.map(p => p.z), 0);
        let minX = Math.min(...crossSection.map(p => p.x));
        let maxX = Math.max(...crossSection.map(p => p.x));

        let zRange = maxZ - minZ;
        let xRange = maxX - minX;

        // Scale to fit
        let scale = Math.min(max.h / zRange, max.w / xRange);

        console.log(JSON.stringify({ scale, minX, maxX, xRange, minZ, maxZ, zRange }));

        // Draw vertical lines for each point
        let parts = [];
        let stroke = "#777777";
        let stroke_width = 1;

        crossSection.forEach(p => {
            let x = off.x + (p.x - minX) * scale;
            let y1 = off.y + max.h;  // bottom (tip of tool)
            let y2 = off.y + max.h - (p.z - minZ) * scale;

            parts.push({ line: {
                x1: x,
                y1: y1,
                x2: x,
                y2: y2,
                stroke,
                stroke_width
            }});
        });

        svg.innerHTML = otag(parts);
    }, 10);
}

function setToolChanged(changed) {
    editTools.changed = changed;
    api.ui.toolsSave.disabled = !changed;
}

export function showTools() {
    if (api.mode.get_id() !== MODES.CAM) return;
    setconf.sync.get().then(_showTools);
}

function _showTools() {
    const { ui } = api;

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
        setconf.sync.put();
    };
    ui.toolsImport.onclick = (ev) => api.event.import(ev);
    ui.toolsExport.onclick = () => {
        api.uc.prompt("Export Tools Filename", "tools").then(name => {
            if (!name) {
                return;
            }
            const record = {
                version: api.version,
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

export const tools = {
    updateTool,
    showTools
};
