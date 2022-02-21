/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("kiri-mode.cam.tools", [], (root, exports) => {

const { kiri } = root;
const { driver } = kiri;
const { CAM } = driver;

const HPI = Math.PI/2;

class Tool {
    constructor(settings, id, number) {
        if (number >= 0) {
            this.tool = settings.tools.filter(tool => tool.number == number)[0];
        } else {
            this.tool = settings.tools.filter(tool => tool.id == id)[0];
        }
        if (!this.tool) {
            this.tool = Object.assign({}, settings.tools[0]);
            this.tool.number = number >= 0 ? number : this.tool.number;
            this.tool.id = id >= 0 ? id : this.tool.id;
        }
    }

    getID() {
        return this.tool.id;
    }

    getName() {
        return this.tool.name;
    }

    getType() {
        return this.tool.type;
    }

    getNumber() {
        return this.tool.number;
    }

    isMetric() {
        return this.tool.metric;
    }

    unitScale() {
        return this.isMetric() ? 1 : 25.4;
    }

    fluteLength() {
        return this.unitScale() * this.tool.flute_len;
    }

    fluteDiameter() {
        return this.unitScale() * this.tool.flute_diam;
    }

    tipDiameter() {
        return this.unitScale() * this.tool.taper_tip;
    }

    shaftLength() {
        return this.unitScale() * this.tool.shaft_len;
    }

    shaftDiameter() {
        return this.unitScale() * this.tool.shaft_diam;
    }

    generateProfile(resolution) {
        // generate tool profile
        let type = this.getType(),
            ball = type === "ballmill",
            taper = type === "tapermill",
            tip_diameter = this.tipDiameter(),
            shaft_offset = this.fluteLength(),
            flute_diameter = this.fluteDiameter(),
            shaft_diameter = this.shaftDiameter(),
            shaft_radius = shaft_diameter / 2,
            shaft_pix_float = shaft_diameter / resolution,
            shaft_pix_int = Math.round(shaft_pix_float),
            shaft_radius_pix_float = shaft_pix_float / 2,
            flute_radius = flute_diameter / 2,
            flute_pix_float = flute_diameter / resolution,
            flute_radius_pix_float = flute_pix_float / 2,
            tip_pix_float = tip_diameter / resolution,
            tip_radius_pix_float = tip_pix_float / 2,
            tip_max_radius_offset = flute_radius_pix_float - tip_radius_pix_float,
            profile_pix_iter = shaft_pix_int + (1 - shaft_pix_int % 2),
            toolCenter = (shaft_pix_int - (shaft_pix_int % 2)) / 2,
            toolOffset = [],
            larger_shaft = shaft_diameter - flute_diameter > 0.001,
            rpixsq = flute_radius_pix_float * flute_radius_pix_float;

        // for each point in tool profile, check inside radius
        for (let x = 0; x < profile_pix_iter; x++) {
            for (let y = 0; y < profile_pix_iter; y++) {
                let dx = x - toolCenter,
                    dy = y - toolCenter,
                    dist_from_center = Math.sqrt(dx * dx + dy * dy);
                if (dist_from_center <= flute_radius_pix_float) {
                    // console.log({x,y,dx,dy,dist:dist_from_center,ln:dbl.length})
                    // flute offset points
                    let z_offset = 0;
                    if (ball) {
                        let rd = dist_from_center * dist_from_center;
                        z_offset = Math.sqrt(rpixsq - rd) * resolution - flute_radius;
                        // z_offset = (1 - Math.cos((dist_from_center / flute_radius_pix_float) * HPI)) * -flute_radius;
                    } else if (taper && dist_from_center >= tip_radius_pix_float) {
                        z_offset = ((dist_from_center - tip_radius_pix_float) / tip_max_radius_offset) * -shaft_offset;
                    }
                    toolOffset.push(dx, dy, z_offset);
                } else if (shaft_offset && larger_shaft && dist_from_center <= shaft_radius_pix_float) {
                    // shaft offset points
                    toolOffset.push(dx, dy, -shaft_offset);
                }
            }
        }

        this.profile = toolOffset;
        this.profileDim = {
            size: shaft_diameter,
            pix: profile_pix_iter + 2
        };
        return this;
    }
}

CAM.Tool = Tool;

CAM.getToolDiameter = function(settings, id) {
    return new CAM.Tool(settings, id).fluteDiameter();
};

});
