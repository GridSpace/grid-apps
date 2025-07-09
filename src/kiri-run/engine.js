/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import { api } from '../kiri/api.js';
import { conf } from '../kiri/conf.js';
import { client } from '../kiri/client.js';
import { load } from '../load/file.js';
import { newWidget } from '../kiri/widget.js';

class Engine {
    constructor() {
        this.widget = newWidget();
        this.settings = {
            mode: "FDM",
            controller: {},
            render: false,
            filter: { FDM: "internal" },
            device: conf.defaults.fdm.d, // device profile
            process: conf.defaults.fdm.p, // slicing settings
            widget: { [this.widget.id]: {} }
        };
        this.listener = () => { };
    }

    load(url) {
        return new Promise((accept, reject) => {
            try {
                new load.STL().load(url, vertices => {
                    this.listener({ loaded: url, vertices });
                    this.widget.loadVertices(vertices).center();
                    accept(this);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    clear() {
        api.platform.clear();
    }

    parse(data) {
        return new Promise((accept, reject) => {
            try {
                let vertices = new load.STL().parse(data);
                this.listener({ parsed: data, vertices });
                this.widget.loadVertices(vertices).center();
                accept(this);
            } catch (error) {
                reject(error);
            }
        });
    }

    setListener(listener) {
        this.listener = listener;
        return this;
    }

    setRender(bool) {
        this.settings.render = bool;
        return this;
    }

    /**
     * Sets the mode of the engine. Valid modes are:
     * @param {"FDM"|"CAM"|"LASER"|"SLA"} mode - the mode to set
     * @returns {Engine} this
     */
    setMode(mode) {
        this.settings.mode = mode;
        return this;
    }

    setDevice(device) {
        Object.assign(this.settings.device, device);
        return this;
    }

    setProcess(process) {
        Object.assign(this.settings.process, process);
        return this;
    }

    setController(controller) {
        let ctrl = this.settings.controller;
        Object.assign(ctrl, controller);
        if (ctrl.threaded) {
            client.pool.start();
        } else {
            client.pool.stop();
        }
        return this;
    }

    setTools(tools) {
        this.settings.tools = tools;
        return this;
    }

    setStock(stock) {
        let { settings } = this;
        let { process } = settings;
        settings.stock = stock;
        process.camStockX = stock.x;
        process.camStockY = stock.y;
        process.camStockZ = stock.z;
        return this;
    }

    setOrigin(x, y, z) {
        this.settings.origin = { x, y, z };
        return this;
    }

    moveTo(x, y, z) {
        this.widget.move(x, y, z, true);
        return this;
    }

    move(x, y, z) {
        this.widget.move(x, y, z);
        return this;
    }

    scale(x, y, z) {
        this.widget.scale(x, y, z);
        return this;
    }

    rotate(x, y, z) {
        this.widget.rotate(x, y, z);
        return this;
    }

    slice() {
        return new Promise((accept, reject) => {
            client.clear();
            client.sync([this.widget]);
            client.rotate(this.settings);
            client.slice(this.settings, this.widget, msg => {
                this.listener({ slice: msg });
                if (msg.error) {
                    reject(msg.error);
                }
                if (msg.done) {
                    accept(this);
                }
            });
        });
    }

    prepare() {
        return new Promise((accept, reject) => {
            client.prepare(this.settings, update => {
                this.listener({ prepare: { update } });
            }, done => {
                this.listener({ prepare: { done: true } });
                accept(this);
            });
        });
    }

    export() {
        return new Promise((accept, reject) => {
            let output = [];
            client.export(this.settings, segment => {
                if (typeof segment === 'string') {
                    this.listener({ export: { segment } });
                    output.push(segment);
                }
            }, done => {
                this.listener({ export: { done } });
                accept(output.join('\r\n'));
            });
        });
    }
}

export function newEngine() {
    return new Engine();
}

export { Engine };
