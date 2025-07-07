/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/**
 * adapted from
 * http://codeincomplete.com/posts/2011/5/7/bin_packing/
 */

gapp.register("kiri.pack", [], (root, exports) => {

const { kiri } = root;

class Packer {
    constructor(w, h, spacing, opt = {}) {
        this.w = w;
        this.h = h;
        this.spacing = spacing;
        this.opt = opt;
        this.init();
    }

    init() {
        const { w, h, spacing, opt } = this;
        this.root = { x: 0, y: 0, w: w, h: h };
        this.max = { w: 0, h: 0 };
        this.packed = false;
        this.spacing = typeof(spacing) === 'number' ? spacing : 1;
        this.opt = opt;
        this.pad = this.spacing / 2;
    }

    get size() {
        return { w: this.w, h: this. h };
    }

    resize(w, h) {
        this.w = w;
        this.h = h;
        return this;
    }

    rescale(wm, hm) {
        this.w *= wm;
        this.h *= hm;
        return this;
    }

    pack(blocks, onretry) {
        for (;;) {
            let simple = this.opt.simple;
            this.fit(blocks, simple);
            if (!this.packed && onretry && onretry(this)) {
                this.init();
                continue;
            }
            return this;
        }
    }

    // array of blocks/tiles with {w,h} properties
    fit(blocks, simple) {
        if (simple) {
            return this.#fit_simple(blocks);
        } else {
            return this.#fit_split(blocks);
        }
    }

    // array of blocks/tiles with {w,h} properties
    #fit_simple(blocks) {
        let x = 0, y = 0, mh = 0, maxx = 0, maxy = 0;
        let spacing = this.spacing;
        for (let block of blocks) {
            block.fit = { x, y };
            this.max.w = Math.max(this.max.w, x + block.w);
            this.max.h = Math.max(this.max.h, y + block.h);
            maxx = Math.max(maxx, x);
            maxy = Math.max(maxy, y);
            mh = Math.max(mh, block.h);
            x += block.w;
            if (x > this.root.w) {
                x = 0;
                y = y + mh + spacing;
                mh = 0;
            } else {
                x += spacing;
            }
            if (y > this.root.h) {
                return this;
            }
        }
        if (this.opt.invx) {
            for (let block of blocks) {
                block.fit.x = maxx - block.fit.x;
            }
        }
        if (this.opt.invy) {
            for (let block of blocks) {
                block.fit.y = maxy - block.fit.y;
            }
        }
        this.packed = true;
        return this;
    }

    // array of blocks/tiles with {w,h} properties
    #fit_split(blocks) {
        let node, w, h;
        for (let block of blocks) {
            w = block.w;
            h = block.h;
            if (node = this.#findNode(this.root, w, h)) {
                block.fit = this.#splitNode(node, w, h);
            } else {
                return this;
            }
        }
        this.packed = true;
        return this;
    }

    #findNode(root, w, h) {
        if (root.used) {
            return this.#findNode(root.right, w, h) || this.#findNode(root.down, w, h);
        } else if (w <= root.w && h <= root.h) {
            return root;
        } else {
            return null;
        }
    }

    #splitNode(node, w, h) {
        let spacing = this.spacing;
        node.used = true;
        node.down = {
            x: node.x,
            y: node.y + h + spacing,
            w: node.w,
            h: node.h - h
        };
        node.right = {
            x: node.x + w + spacing,
            y: node.y,
            w: node.w - w,
            h: h
        };
        this.max.w = Math.max(this.max.w, node.x + w);
        this.max.h = Math.max(this.max.h, node.y + h);
        return node;
    }
}

kiri.Pack = Packer;

});
