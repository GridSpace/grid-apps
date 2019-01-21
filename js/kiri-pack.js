/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_pack = exports;

/**
 * adapted from
 * http://codeincomplete.com/posts/2011/5/7/bin_packing/
 */

(function (){

    function Packer (w, h, spacing) {
        this.root = { x: 0, y: 0, w: w, h: h };
        this.max = { w: 0, h: 0 };
        this.packed = false;
        this.spacing = typeof(spacing) === 'number' ? spacing : 1;
        this.pad = this.spacing / 2;
    }

    Packer.prototype = {

        fit: function (blocks) {
            var n = 0, node, block, w, h;
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

    if (!self.moto) self.moto = {};
    self.moto.Pack = Packer;

})();
