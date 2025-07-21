/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

export class CamOp {
    constructor(state, op) {
        this.state = state;
        this.op = op
    }

    type() {
        return this.op.type;
    }

    weight() {
        return 1;
    }

    async slice() { }

    prepare() { }
}
