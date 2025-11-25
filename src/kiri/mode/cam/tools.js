/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../../moto/webui.js';
import { api } from '../../core/api.js';
import { consts } from '../../core/consts.js';
import { settings as setconf } from '../../core/settings.js';
import { calcTaperLength, calcTaperAngle } from './tool.js';

const DEG2RAD = Math.PI / 180;

let { MODES } = consts,
    DOC = document,
    selectedTool = null,
    editTools = null,
    maxTool = 0,
    toolNames = ['endmill','ballmill','tapermill','drill'];

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
    ui.toolName.value = tool.name;
    ui.toolNum.value = tool.number;
    ui.toolFluteDiam.value = tool.flute_diam;
    ui.toolFluteLen.value = tool.flute_len;
    ui.toolShaftDiam.value = tool.shaft_diam;
    ui.toolShaftLen.value = tool.shaft_len;
    ui.toolTaperTip.value = tool.taper_tip || 0;
    ui.toolMetric.checked = tool.metric;
    ui.toolType.selectedIndex = toolNames.indexOf(tool.type);
    if (tool === 'tapermill') {
        ui.toolTaperAngle.value = calcTaperAngle(
            (tool.flute_diam - tool.taper_tip) / 2, tool.flute_len
        ).round(1);
    } else if(tool === 'drill'){
        ui.toolTaperAngle.value = 118;
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
    const { ui } = api;
    let type = selectedTool.type;
    let taper = type=== 'tapermill'
    let drill = type === 'drill'
    const drillAngleRad = 140 * Math.PI / 180
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

export function updateTool(ev) {
    const { ui } = api;
    selectedTool.name = ui.toolName.value;
    selectedTool.number = parseInt(ui.toolNum.value);
    selectedTool.flute_diam = parseFloat(ui.toolFluteDiam.value);
    selectedTool.flute_len = parseFloat(ui.toolFluteLen.value);
    selectedTool.shaft_diam = parseFloat(ui.toolShaftDiam.value);
    selectedTool.shaft_len = parseFloat(ui.toolShaftLen.value);
    selectedTool.taper_tip = parseFloat(ui.toolTaperTip.value);
    selectedTool.metric = ui.toolMetric.checked;
    selectedTool.type = toolNames[ui.toolType.selectedIndex];
    if (selectedTool.type === 'tapermill') {
        const rad = (selectedTool.flute_diam - selectedTool.taper_tip) / 2;
        if (ev && ev.target === ui.toolTaperAngle) {
            const angle = parseFloat(ev.target.value);
            const len = calcTaperLength(rad, angle * DEG2RAD);
            selectedTool.flute_len = len;
            ui.toolTaperAngle.value = angle.round(1);
            ui.toolFluteLen.value = selectedTool.flute_len.round(4);
        } else {
            ui.toolTaperAngle.value = calcTaperAngle(rad, selectedTool.flute_len).round(1);
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
    api.ui.toolsSave.disabled = !changed;
}

function generateToolCSV(){
    
    let {tools} = api.conf.get();

    let header = [
        'id',
        'number',
        'type',
        'name',
        'metric',
        'shaft_diam',
        'shaft_len',
        'flute_diam',
        'flute_len',
        'taper_tip',
        'order',
        'api_version='+ api.version,
    ].join(',');
    
    let acc = header + '\n';
    
    for(let [i,t] of tools.entries()) {
        acc += 
        [
            
            t.id,
            t.number,
            t.type,
            escapeCSV(t.name),
            t.metric ? 'true' : 'false',
            t.shaft_diam,
            t.shaft_len,
            t.flute_diam,
            t.flute_len,
            t.taper_tip,
            t.order,
        ].join(',') + (i == tools.length - 1 ? '' : '\n');
    }

    return acc;
}

function escapeCSV(x) {
    if (x == null) return "";
    x = x.toString();
    return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  }
  

  function splitCSVLine(text) {
    const line = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            // doubled quotes inside quoted sections
            if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if(char === ',') {
            if(!inQuotes) {
                line.push(current);
                current = "";
            }else{
                current += ',';
            }
        }else{
            current += char;
        }
    }

    line.push(current);

    return line;
}

export function decodeToolCSV(data){

    let apiVer;
    try{
        apiVer = data.split('\n')[0].split(',')[11].split('=')[1];
    }catch( err ){
        console.log(err)
        return [false, "malformed csv: cannot determine api version"];
    }

    // will need to implement logic in the future if the tool API changes
    console.log("got api version", apiVer)

    try{
        //get and parse tools line by line
        let tools = data.split( '\n' )
        .slice( 1 )
        .filter( line => line.length > 0 )
        .map( line => {
            console.log(splitCSVLine( line ))
            let [id, number, type, name, metric, shaft_diam, shaft_len, flute_diam, flute_len, taper_tip, order,] = splitCSVLine( line );
            console.log({id, number, type, name, metric, shaft_diam, shaft_len, flute_diam, flute_len, taper_tip})
            return {
                id: parseInt( id ),
                type: type.toString(),
                number: parseInt(number),
                name: name.toString(),
                metric: metric == 'true'? true : ( metric == 'false' ? false : null ),
                shaft_diam: parseFloat(shaft_diam),
                shaft_len: parseFloat(shaft_len),
                flute_diam: parseFloat(flute_diam),
                flute_len: parseFloat(flute_len),
                taper_tip: parseFloat(taper_tip),
                order: parseInt(order),
            }
        })

        let IDs = new Set();

        for(let tool of tools){
            //check  tool IDs
            if( tool.id == NaN ) throw "id must be a number";
            if( IDs.has(tool.id) ) throw "tool ids must be unique";
            IDs.add(tool.id);
            // check remaining fields
            if( toolNames.indexOf(tool.type) == -1 ) throw "tool type must be one of " + toolNames.join(', ');
            if( Number.isNaN(tool.number) ) throw "number must be a number";
            if( Number.isNaN(tool.metric) ) throw "metric must be a boolean";
            if( Number.isNaN(tool.shaft_diam) ) throw "shaft_diam must be a number";
            if( Number.isNaN(tool.shaft_len) ) throw "shaft_len must be a number";
            if( Number.isNaN(tool.flute_diam) ) throw "flute_diam must be a number";
            if( Number.isNaN(tool.flute_len) ) throw "flute_len must be a number";
            if( Number.isNaN(tool.taper_tip) ) throw "taper_tip must be a number";
            if( Number.isNaN(tool.order) ) throw "order must be a number";
        }

        return [true, {
            version: apiVer,
            tools,
            time: Date.now()
        }];

    }catch(err){
        return [ false, "malformed csv: " + err ];
    }
}

export function showTools() {
    if ( api.mode.get_id() !== MODES.CAM ) return;
    setconf.sync.get().then( _showTools );
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
    ui.toolsImportCSV.onclick = (ev) => api.event.import(ev);
    ui.toolsExportCSV.onclick = () => {
        api.uc.prompt("Export Tools Filename", "tools").then(name => {
            if (!name) {
                return;
            }
            api.util.download(generateToolCSV(), `${name}.csv`);
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
