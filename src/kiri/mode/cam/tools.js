/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../../app/api.js';
import { consts } from '../../core/consts.js';
import { settings as setconf } from '../../app/conf/manager.js';
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
        const taperLen = tool.flute_len;
        ui.toolTaperAngle.value =
            selectedTool.taper_angle =
            calcTaperAngle( (tool.flute_diam - tool.taper_tip) / 2, taperLen ).round(1);
    } else if (tool === 'drill') {
        ui.toolTaperAngle.value = selectedTool.taper_angle = 90;
    } else {
        ui.toolTaperAngle.value = selectedTool.taper_angle = 0;
    }

    renderTool(tool);
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
    renderTool(selectedTool);
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
    $('tool-view').innerHTML = '<svg id="tool-svg" width="100%" height="100%"></svg>';
    setTimeout(() => {
        let svg = $('tool-svg');
        let pad = 10;
        let dim = { w: svg.clientWidth, h: svg.clientHeight };
        let max = { w: dim.w - pad * 2, h: dim.h - pad * 2 };
        let off = { x: pad, y: pad };

        // Create Tool instance and generate profile
        const toolInst = new Tool(settings(), tool.id);
        const resolution = (toolInst.maxDiameter() / toolInst.unitScale()) / 100;
        toolInst.generateProfile(resolution);

        const profile = toolInst.profile;
        const { pix } = toolInst.profileDim;

        // Extract cross-section at y=0 (center line)
        // Profile is stored as [dx, dy, z_offset, dx, dy, z_offset, ...]
        let crossSection = [];
        for (let i = 0; i < profile.length; i += 3) {
            let dx = profile[i];
            let dy = profile[i + 1];
            let  z = profile[i + 2];
            // Only take points where dy is approximately 0 (center line)
            if (Math.abs(dy) < 0.01) {
                crossSection.push({ x: dx * resolution, z });
            }
        }

        // Section lengths
        let slen = toolInst.shaftLength();
        let flen = toolInst.fluteLength();

        // Find bounds
        let minZ = Math.min(...crossSection.map(p => p.z), -(slen + flen));
        let maxZ = Math.max(...crossSection.map(p => p.z), 0);
        let minX = Math.min(...crossSection.map(p => p.x));
        let maxX = Math.max(...crossSection.map(p => p.x));
        let zRange = maxZ - minZ;
        let xRange = maxX - minX;

        // Scale to fit
        let scale = Math.min(max.h / zRange, max.w / xRange);

        // Center horizontally if tool is narrower than viewport
        let xOffset = off.x + (max.w - xRange * scale) / 2;

        // Draw vertical lines for each point
        let parts = [];
        let stroke_width = 1;

        crossSection.forEach(p => {
            let x  = xOffset + (p.x - minX) * scale;
            let y1 = dim.h - off.y - (maxZ - p.z) * scale;   // tip point
            let y2 = dim.h - off.y - (flen) * scale;         // top flute
            let y3 = dim.h - off.y - (slen + flen) * scale;  // top shaft

            // flute
            parts.push({ line: {
                x1: x,
                x2: x,
                y1: y1,
                y2: y2,
                stroke: "#999999",
                stroke_width
            }});

            // shaft
            parts.push({ line: {
                x1: x,
                x2: x,
                y1: y2,
                y2: y3,
                stroke: "#666666",
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
