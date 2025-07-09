/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { OpXRay } from './op-xray.js';
import { OpShadow } from './op-shadow.js';
import { OpLevel } from './op-level.js';
import { OpRough } from './op-rough.js';
import { OpOutline } from './op-outline.js';
import { OpContour } from './op-contour.js';
import { OpPocket } from './op-pocket.js';
import { OpLathe } from './op-lathe.js';
import { OpTrace } from './op-trace.js';
import { OpDrill } from './op-drill.js';
import { OpRegister } from './op-register.js';
import { OpLaserOn } from './op-laser-on.js';
import { OpLaserOff } from './op-laser-off.js';
import { OpGCode } from './op-gcode.js';
import { OpIndex } from './op-index.js';
import { CamOp } from './op.js';

export const ops = {
    "xray":      OpXRay,
    "shadow":    OpShadow,
    "level":     OpLevel,
    "rough":     OpRough,
    "outline":   OpOutline,
    "contour":   OpContour,
    "pocket":    OpPocket,
    "lathe":     OpLathe,
    "trace":     OpTrace,
    "drill":     OpDrill,
    "register":  OpRegister,
    "laser on":  OpLaserOn,
    "laser off": OpLaserOff,
    "gcode":     OpGCode,
    "index":     OpIndex,
    "flip":      CamOp
};
