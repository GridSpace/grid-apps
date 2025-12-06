/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

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
        this.work_units = settings.controller.units === 'mm' ? 1 : 25.4;
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

    // for taper tips, returns value in tool units
    // otherwise returns a fraction of the flute diameter in tool units
    getStepSize(frac) {
        return (this.hasTaper() ? frac : this.fluteDiameter() * (frac ?? 1)) * this.work_units;
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
        return (this.hasTaper() ? this.tipDiameter() : this.fluteDiameter()) / 2;
    }

    contourOffset(step) {
        const diam = Math.min(this.hasTaper() ? this.tipDiameter() : this.fluteDiameter());
        return diam ? diam * step : step;
    }

    // setTaperLengthFromAngle(angle) {
    //     const rad = (this.flute_diam - this.taper_tip) / 2;
    //     return this.flute_len = calcTaperLength(rad, angle);
    // }

    getTaperAngle() {
        let { flute_diam, flute_len, taper_tip } = this.tool;
        return calcTaperAngle((flute_diam - taper_tip) / 2, flute_len);
    }

    // getTaperBallExtent() {
    //     let rad = this.tipDiameter() / 2;
    //     let ang = this.getTaperAngle() * DEG2RAD;
    //     return calcTaperBallExtent(rad, ang);
    // }

    shaftLength() {
        return this.unitScale() * this.tool.shaft_len;
    }

    /**
     * returns the length of the drill tip as a function of the flute diameter,
     * given a 118 deg point angle. the result is in workspace units.
     *
     * @return {number} length of the drill tip.
     */
    drillTipLength() {
        const drillAngleRad = 140 * Math.PI / 180;
        return 0.5 * this.fluteDiameter() * Math.sin(drillAngleRad);
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

    isTaperBall() {
        return this.tool.type === "taperball";
    }

    isDrill() {
        return this.tool.type === "drill";
    }

    hasTaper() {
        return this.isTaperMill() || this.isTaperBall();
    }

    /**
     * generate tool profile with resolution number of pixels. the result is a
     * Float32Array stored in `this.profile` and `this.profileDim` containing
     * dimensions of the profile in pixels and shared array buffer size.
     *
     * @param {number} resolution - number of pixels for the tool profile
     *
     * @return {Tool} this
     */
    generateProfile(resolution) {
        // generate tool profile
        let ball = this.isBallMill(),
            taperball = this.isTaperBall(),
            taper = this.hasTaper(),
            drill = this.isDrill(),
            tip_diameter = this.tipDiameter(),
            flute_diameter = this.fluteDiameter(),
            flute_length = this.fluteLength(),
            flute_radius = flute_diameter / 2,
            shaft_diameter = Math.max(flute_diameter, this.shaftDiameter()),
            max_diameter = Math.max(flute_diameter, shaft_diameter),
            larger_shaft = shaft_diameter - flute_diameter > 0.001,
            pix_shaft_dia_float = max_diameter / resolution,
            pix_shaft_dia_int = Math.round(pix_shaft_dia_float),
            pix_shaft_rad_float = pix_shaft_dia_float / 2,
            pix_flute_dia_float = flute_diameter / resolution,
            pix_flute_rad_float = pix_flute_dia_float / 2,
            pix_tip_dia_float = tip_diameter / resolution,
            pix_tip_rad_float = pix_tip_dia_float / 2,
            tip_max_radius_offset = pix_flute_rad_float - pix_tip_rad_float,
            pix_profile_iter = pix_shaft_dia_int + (1 - pix_shaft_dia_int % 2),
            toolCenter = (pix_shaft_dia_int - (pix_shaft_dia_int % 2)) / 2,
            toolOffset = [],
            maxo = -Infinity,
            // ball taper magic
            a = this.getTaperAngle() * DEG2RAD,
            r = (tip_diameter/2) * (1 + Math.sin(a)) / Math.cos(a),
            h = r * Math.sin(a),
            b = r * Math.cos(a),
            pix_b = b / resolution,
            pix_r = r / resolution;

        // for each point in tool profile, check inside radius
        for (let x = 0; x < pix_profile_iter; x++) {
            for (let y = 0; y < pix_profile_iter; y++) {
                let dx = x - toolCenter,
                    dy = y - toolCenter,
                    dist_from_center = Math.sqrt(dx * dx + dy * dy);
                if (dist_from_center <= pix_flute_rad_float) { // if xy point inside flute radius
                    maxo = Math.max(maxo, dx, dy);
                    // flute offset points
                    let z_offset = 0;
                    if (ball) {
                        let ball_rad_sq = dist_from_center * dist_from_center;
                        let ball_rpixsq = pix_flute_rad_float * pix_flute_rad_float;
                        z_offset = Math.sqrt(ball_rpixsq - ball_rad_sq) * resolution - flute_radius;
                    } else if (taperball) {
                        // taperball: spherical tip, conical above
                        if (dist_from_center <= pix_b) {
                            // inside ball radius - spherical surface
                            let ball_rad_sq = dist_from_center * dist_from_center;
                            let ball_rpixsq = pix_r * pix_r;
                            z_offset = Math.sqrt(ball_rpixsq - ball_rad_sq) * resolution - r;
                        } else {
                            // outside ball radius - conical taper
                            z_offset = ((dist_from_center - pix_tip_rad_float) / tip_max_radius_offset) * -flute_length;
                        }
                    } else if (taper && dist_from_center >= pix_tip_rad_float) {
                        // if tapered and not in the flat tip radius
                        z_offset = ((dist_from_center - pix_tip_rad_float) / tip_max_radius_offset) * -flute_length;
                    } else if (drill) {
                        z_offset = -dist_from_center / 45;
                    }
                    toolOffset.push(dx, dy, z_offset);
                } else if (flute_length && larger_shaft && dist_from_center <= pix_shaft_rad_float) {
                    // shaft offset points
                    toolOffset.push(dx, dy, -flute_length);
                }
            }
        }

        // convert to shared array for use with minions
        const profile = new Float32Array(new SharedArrayBuffer(toolOffset.length * 4));
        profile.set(toolOffset);

        this.profile = profile;
        this.profileDim = {
            size: shaft_diameter,
            pix: pix_profile_iter + 2,
            maxo
        };

        return this;
    }
}

function calcTaperAngle(rad, len) {
    return (Math.atan(rad / len) * RAD2DEG);
}

function calcTaperLength(rad, angle) {
    return (rad / Math.tan(angle));
}

function calcTaperBallExtent(rad, angle) {
    return rad * (1 - Math.sin(angle * 2));
}

function getToolDiameter(settings, id) {
    return new Tool(settings, id).fluteDiameter();
}

export {
    Tool,
    calcTaperAngle,
    calcTaperBallExtent,
    calcTaperLength,
    getToolDiameter
};
