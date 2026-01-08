/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';

export class OpLoop extends CamOp {
    weight() {
        return 0;  // No weight, acts as marker
    }

    async slice() {
        // No-op: expansion happens in slice.js
    }

    prepare() {
        // No-op: ignored during g-code generation
    }
}
