/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from '../work/op-area.js';
import { OpContour } from '../work/op-contour.js';
import { OpDrill } from '../work/op-drill.js';
import { OpGCode } from '../work/op-gcode.js';
import { OpHelical } from '../work/op-helical.js';
import { OpIndex } from '../work/op-index.js';
import { OpLaserOff } from '../work/op-laser-off.js';
import { OpLaserOn } from '../work/op-laser-on.js';
import { OpLathe } from '../work/op-lathe.js';
import { OpLevel } from '../work/op-level.js';
import { OpLoop } from '../work/op-loop.js';
import { OpOutline } from '../work/op-outline.js';
import { OpPocket } from '../work/op-pocket.js';
import { OpRegister } from '../work/op-register.js';
import { OpRough } from '../work/op-rough.js';
import { OpShadow } from '../work/op-shadow.js';
import { OpTrace } from '../work/op-trace.js';
import { OpXRay } from '../work/op-xray.js';

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
    "loop":      OpLoop,
    "outline":   OpOutline,
    "pocket":    OpPocket,
    "register":  OpRegister,
    "rough":     OpRough,
    "shadow":    OpShadow,
    "trace":     OpTrace,
    "xray":      OpXRay
};
