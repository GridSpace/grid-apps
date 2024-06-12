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
        this.root = { x: 0, y: 0, w: w, h: h };
        this.max = { w: 0, h: 0 };
        this.packed = false;
        this.spacing = typeof(spacing) === 'number' ? spacing : 1;
        this.opt = opt;
        this.pad = this.spacing / 2;
    }

    // array of blocks/tiles with {w,h} properties
    simple(blocks) {
        let n = 0, block, x = 0, y = 0, mh = 0, maxx = 0, maxy = 0;
        let spacing = blocks.length > 1 ? this.spacing : 0;
        while (n < blocks.length) {
            block = blocks[n++];
            block.fit = { x, y };
            this.max.w = Math.max(this.max.w, x + block.w);
            this.max.h = Math.max(this.max.h, y + block.h);
            maxx = Math.max(maxx, x);
            maxy = Math.max(maxy, y);
            mh = Math.max(mh, block.h);
            x += block.w + spacing;
            if (x > this.root.w) {
                x = 0;
                y = y + mh + spacing;
                mh = 0;
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

    fit(blocks, simple) {
        if (simple) {
            return this.simple(blocks);
        }
        let n = 0, node, block, w, h;
        let spacing = blocks.length > 1 ? this.spacing : 0;
        while (n < blocks.length) {
            block = blocks[n++];
            w = block.w + spacing;
            h = block.h + spacing;
            if (node = this.findNode(this.root, w, h)) {
                block.fit = this.splitNode(node, w, h);
            } else {
                return this;
            }
        }
        this.packed = true;
        return this;
    }

    findNode(root, w, h) {
        if (root.used) {
            return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
        } else if (w <= root.w && h <= root.h) {
            return root;
        } else {
            return null;
        }
    }

    splitNode(node, w, h) {
        node.used = true;
        node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h };
        node.right = { x: node.x + w, y: node.y, w: node.w - w, h: h };
        this.max.w = Math.max(this.max.w, node.x + w);
        this.max.h = Math.max(this.max.h, node.y + h);
        return node;
    }
}

kiri.Pack = Packer;

});
