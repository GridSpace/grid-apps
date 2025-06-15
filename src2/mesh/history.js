/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { broker } from "../moto/broker.js";
import { target } from "./sketch.js";

class History {
    #pos = -1;
    #stack = [];
    #offset; // store final drag move
    #target; // store sketch drag target
    #tracking = false;

    constructor() {
        broker.subscribe({

            app_ready() {
                this.#tracking = true
            },

            drag_start(selected) {},

            drag(opt) {
                this.#target = target();
                this.#offset = opt.offset;
            },

            drag_end(selected) {
                // console.log({
                //     drag_end: selected,
                //     offset: this.#offset,
                //     target: this.#target
                // });
                const { x, y, z } = this.#offset;
                broker.publish('move', {
                    target: this.#target,
                    set: selected,
                    dx: x,
                    dy: y,
                    dz: z
                });
            },

            move(data) {
                const { target, set, dx, dy, dz } = data;
                this.push('move', {
                    set, dx: -dx, dy: -dy, dz: -dz, target
                }, {
                    set, dx, dy, dz, target
                });
            },

            rotate(data) {
                const { set, dx, dy, dz } = data;
                this.push('rotate', {
                    set, dx: -dx, dy: -dy, dz: -dz
                }, {
                    set, dx, dy, dz
                });
            },

            scale(data) {
                const { set, dx, dy, dz } = data;
                this.push('scale', {
                    set, dx: 1/dx, dy: 1/dy, dz: 1/dz
                }, {
                    set, dx, dy, dz
                });
            },

        }, this);
    }

    push(type, undo, redo) {
        this.#stack.length = ++this.#pos;
        this.#stack.push({
            type,
            undo,
            redo
        });
    }

    // update(redo, undo) {
    //     let peek = this.#stack.peek();
    //     if (peek) {
    //         Object.assign(peek, {
    //             redo: redo || peek.redo,
    //             undo: undo || peek.undo
    //         });
    //     }
    // }

    do(type, data) {
        // console.log({ type, data });
        switch (type) {
            case 'move': {
                let { set, dx, dy, dz, target } = data;
                for (let grp of set) {
                    grp.move(dx, dy, dz, target);
                }
                break;
            }
            // case 'position': {
            //     for (let { model, pos } of data) {
            //         model.position(...pos);
            //     }
            //     break;
            // }
            case 'rotate': {
                let { set, dx, dy, dz } = data;
                for (let grp of set) {
                    grp.rotate(dx, dy, dz);
                }
                break;
            }
            case 'scale': {
                let { set, dx, dy, dz } = data;
                for (let grp of set) {
                    grp.scale(dx, dy, dz);
                }
                break;
            }
            default:
                console.warn(`invalid record type: ${type}`);
        }
    }

    undo() {
        if (this.#pos >= 0) {
            const rec = this.#stack[this.#pos--];
            this.do(rec.type, rec.undo);
            broker.publish("history_undo", rec);
        }
    }

    redo() {
        if (this.#stack.length && this.#pos >= -1 && this.#pos < this.#stack.length - 1) {
            const rec = this.#stack[++this.#pos];
            this.do(rec.type, rec.redo);
            broker.publish("history_redo", rec);
        }
    }
}

export const history = new History();
