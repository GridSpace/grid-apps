/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';
import { OpContour } from './op-contour.js';
import { OpDrill } from './op-drill.js';
import { OpGCode } from './op-gcode.js';
import { OpHelical } from './op-helical.js';
import { OpIndex } from './op-index.js';
import { OpLaserOff } from './op-laser-off.js';
import { OpLaserOn } from './op-laser-on.js';
import { OpLathe } from './op-lathe.js';
import { OpLevel } from './op-level.js';
import { OpOutline } from './op-outline.js';
import { OpPocket } from './op-pocket.js';
import { OpRegister } from './op-register.js';
import { OpRough } from './op-rough.js';
import { OpShadow } from './op-shadow.js';
import { OpTrace } from './op-trace.js';
import { OpXRay } from './op-xray.js';

export const ops = {
    "area":      OpArea,
    "contour":   OpContour,
    "drill":     OpDrill,
    "flip":      CamOp,
    "gcode":     OpGCode,
    "helical":   OpHelical,
    "index":     OpIndex,
    "laser off": OpLaserOff,
    "laser on":  OpLaserOn,
    "lathe":     OpLathe,
    "level":     OpLevel,
    "outline":   OpOutline,
    "pocket":    OpPocket,
    "register":  OpRegister,
    "rough":     OpRough,
    "shadow":    OpShadow,
    "trace":     OpTrace,
    "xray":      OpXRay
};
