/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let KIRI = self.kiri = self.kiri || {};
KIRI.newEngine = ()=> { return new Engine ()};

if (!KIRI.api) {
    KIRI.api = {
        event: {
            emit: () => {}
        }
    };
}

class Engine {
    constructor() {
        this.widget = KIRI.newWidget();
        this.settings = {
            mode: "FDM",
            controller: {},
            render: false,
            filter: { FDM: "internal" },
            device: KIRI.conf.defaults.fdm.d, // device profile
            process: KIRI.conf.defaults.fdm.p, // slicing settings
            widget: { [ this.widget.id ]: {} }
        };
        this.listener = () => {};
    }

    load(url) {
        return new Promise((accept, reject) => {
            try {
                new moto.STL().load(url, vertices => {
                    this.listener({loaded: url, vertices});
                    this.widget.loadVertices(vertices).center();
                    accept(this);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    parse(data) {
        return new Promise((accept, reject) => {
            try {
                let vertices = new moto.STL().parse(data);
                this.listener({parsed: data, vertices});
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
            KIRI.client.clear();
            KIRI.client.sync([ this.widget ]);
            KIRI.client.slice(this.settings, this.widget, msg => {
                this.listener({slice:msg});
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
            KIRI.client.prepare(this.settings, update => {
                this.listener({prepare:{update}});
            }, done => {
                this.listener({prepare:{done:true}});
                accept(this);
            });
        });
    }

    export() {
        return new Promise((accept, reject) => {
            let output = [];
            KIRI.client.export(this.settings, segment => {
                this.listener({export:{segment}});
                output.push(segment);
            }, done => {
                this.listener({export:{done}});
                accept(output.join('\r\n'));
            });
        });
    }
}

})();
