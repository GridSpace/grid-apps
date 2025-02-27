/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.cam.driver
gapp.register("kiri-mode.cam.tools", [], (root, exports) => {

const { kiri } = root;
const { driver } = kiri;
const { CAM } = driver;

const HPI = Math.PI/2;
const RAD2DEG = 180/Math.PI;

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

    maxDiameter() {
        return Math.max(this.fluteDiameter(), this.tipDiameter(), this.shaftDiameter());
    }

    traceOffset() {
        return (this.isTaperMill() ? this.tipDiameter() : this.fluteDiameter()) / 2;
    }

    contourOffset(step) {
        const diam = Math.min(this.isTaperMill() ? this.tipDiameter() : this.fluteDiameter());
        return diam ? diam * step : step;
    }

    setTaperLengthFromAngle(angle) {
        const rad = (this.flute_diam - this.taper_tip) / 2;
        return this.flute_len = CAM.calcTaperLength(rad, angle);
    }

    getTaperAngle() {
        return CAM.calcTaperAngle((this.flute_diam - this.taper_tip) / 2, this.flute_len);
    }

    shaftLength() {
        return this.unitScale() * this.tool.shaft_len;
    }

    shaftDiameter() {
        return this.unitScale() * this.tool.shaft_diam;
    }

    isBallMill() {
        return this.tool.type === "ballmill";
    }

    isTaperMill() {
        return this.tool.type === "tapermill";
    }

    generateProfile(resolution) {
        // generate tool profile
        let ball = this.isBallMill(),
            taper = this.isTaperMill(),
            tip_diameter = this.tipDiameter(),
            shaft_offset = this.fluteLength(),
            flute_diameter = this.fluteDiameter(),
            shaft_diameter = this.shaftDiameter(),
            max_diameter = Math.max(flute_diameter, shaft_diameter),
            shaft_pix_float = max_diameter / resolution,
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
            rpixsq = flute_radius_pix_float * flute_radius_pix_float,
            maxo = -Infinity;

        // for each point in tool profile, check inside radius
        for (let x = 0; x < profile_pix_iter; x++) {
            for (let y = 0; y < profile_pix_iter; y++) {
                let dx = x - toolCenter,
                    dy = y - toolCenter,
                    dist_from_center = Math.sqrt(dx * dx + dy * dy);
                if (dist_from_center <= flute_radius_pix_float) {
                    maxo = Math.max(maxo, dx, dy);
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

        // convert to shared array for use with minions
        const profile = new Float32Array(new SharedArrayBuffer(toolOffset.length * 4));
        profile.set(toolOffset);

        this.profile = profile;
        this.profileDim = {
            size: shaft_diameter,
            pix: profile_pix_iter + 2,
            maxo
        };

        return this;
    }
}

CAM.Tool = Tool;

CAM.calcTaperAngle = function(rad, len) {
    return (Math.atan(rad / len) * RAD2DEG);
};

CAM.calcTaperLength = function(rad, angle) {
    return (rad / Math.tan(angle));
};

CAM.getToolDiameter = function(settings, id) {
    return new CAM.Tool(settings, id).fluteDiameter();
};

});
