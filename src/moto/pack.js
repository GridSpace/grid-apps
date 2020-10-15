/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/**
 * adapted from
 * http://codeincomplete.com/posts/2011/5/7/bin_packing/
 */

(function (){

    if (!self.moto) self.moto = {};
    if (self.moto.Pack) return;

    self.moto.Pack = Packer;
    self.moto.Sort = function (a, b) {
        let aa = (a.w * a.h);
        let ab = (b.w * b.h);
        if (Math.abs(aa-ab) < 1) {
            return (b.w / b.h) - (a.w / a.h);
        } else {
            return ab - aa;
        }
    };

    function Packer (w, h, spacing) {
        this.root = { x: 0, y: 0, w: w, h: h };
        this.max = { w: 0, h: 0 };
        this.packed = false;
        this.spacing = typeof(spacing) === 'number' ? spacing : 1;
        this.pad = this.spacing / 2;
    }

    Packer.prototype = {

        simple: function (blocks) {
            let n = 0, block, x = 0, y = 0, mh = 0;
            while (n < blocks.length) {
                block = blocks[n++];
                block.fit = { x, y };
                this.max.w = Math.max(this.max.w, x + block.w);
                this.max.h = Math.max(this.max.h, y + block.h);
                mh = Math.max(mh, block.h);
                x += block.w + this.spacing;
                if (x > this.root.w) {
                    x = 0;
                    y += mh + this.spacing;
                    mh = 0;
                }
                if (y > this.root.h) {
                    return this;
                }
            }
            this.packed = true;
            return this;
        },

        fit: function (blocks, simple) {
            if (simple) {
                return this.simple(blocks);
            }
            let n = 0, node, block, w, h;
            while (n < blocks.length) {
                block = blocks[n++];
                w = block.w + this.spacing;
                h = block.h + this.spacing;
                if (node = this.findNode(this.root, w, h)) {
                    block.fit = this.splitNode(node, w, h);
                } else {
                    return this;
                }
            }
            this.packed = true;
            return this;
        },

        findNode: function (root, w, h) {
            if (root.used) {
                return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
            } else if (w <= root.w && h <= root.h) {
                return root;
            } else {
                return null;
            }
        },

        splitNode: function (node, w, h) {
            node.used = true;
            node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h };
            node.right = { x: node.x + w, y: node.y, w: node.w - w, h: h };
            this.max.w = Math.max(this.max.w, node.x + w);
            this.max.h = Math.max(this.max.h, node.y + h);
            return node;
        }

    };

})();
