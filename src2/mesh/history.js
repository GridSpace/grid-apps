/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { broker } from "../moto/broker.js";

class History {
    #pos = -1;
    #stack = [];
    #tracking = false;

    constructor() {
        broker.subscribe({

            app_ready() {
                this.#tracking = true
            },

            drag_start(selected) {
                this.push('position', selected.map(model => ({
                    model,
                    pos: model.position().toArray()
                })));
            },

            drag_end(selected) {
                this.update(selected.map(model => ({
                    model,
                    pos: model.position().toArray()
                })));
            },

            move(data) {
                console.log('move', data);
            },

            rotate(data) {
                console.log('rotate', data);
            },

            scale(data) {
                console.log('scale', data);
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

    update(redo, undo) {
        let peek = this.#stack.peek();
        if (peek) {
            Object.assign(peek, {
                redo: redo || peek.redo,
                undo: undo || peek.undo
            });
        }
    }

    do(type, data) {
        switch (type) {
            case 'position':
                for (let { model, pos } of data) {
                    model.position(...pos);
                }
                break;
            default:
                console.warn(`invalid record type: ${type}`);
        }
    }

    undo() {
        if (this.#pos >= 0) {
            const rec = this.#stack[this.#pos--];
            this.do(rec.type, rec.undo);
        }
    }

    redo() {
        if (this.#stack.length && this.#pos >= -1 && this.#pos < this.#stack.length - 1) {
            const rec = this.#stack[++this.#pos];
            this.do(rec.type, rec.redo);
        }
    }
}

export const history = new History();
