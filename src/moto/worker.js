/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let gapp = self.gapp = self.gapp || {},
    moto = self.moto = self.moto || gapp,
    time = Date.now;

if (moto.worker) return;

// allow license to inject module
self.gapp = self.gapp || moto;

let endpoints = {};

// code is running in the worker / server context
const dispatch = moto.worker = {

    bind: (name, fn) => {
        endpoints[name] = fn;
        dispatch.send({bind: name});
    },

    send: (msg) => {
        self.postMessage(msg);
    },

    onmessage: (e) => {
        let msg = e.data,
            run = endpoints[msg.task],
            done = false,
            send = {
                data: (data, direct) => {
                    if (canSend(data)) {
                        dispatch.send({ done: false, data: data }, direct);
                    }
                },
                done: (data, direct) => {
                    if (canSend(data)) {
                        dispatch.send({ done: true, data: data }, direct);
                        done = true;
                    }
                },
                error: (data) => {
                    if (canSend(data)) {
                        done = true;
                        dispatch.send({ error: data });
                    }
                }
            },
            canSend = (data) => {
                if (done) {
                    console.log("unexpected reply dropped", {data, msg});
                }
                return !done;
            };

        if (run) {
            try {
                let data = run(msg.data, send);
                if (data) {
                    send.done(data);
                }
            } catch (error) {
                console.trace(error.stack);
                dispatch.send({ data: {error: error.toString()}, done: true });
            }
        } else {
            console.log({worker_unhandled: e});
            send.error(`no registered endpoint: ${msg.task}`);
        }
    }

};

// attach onmessage hanler
self.onmessage = dispatch.onmessage;

})();
