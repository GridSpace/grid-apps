/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let gapp = self.gapp = self.gapp || {},
    moto = self.moto = self.moto || {},
    time = Date.now;

if (moto.worker) return;

// allow license to inject module
self.gapp = self.gapp || moto;

let isinit = false;
let endpoints = {};

// code is running in the worker / server context
const dispatch = moto.worker = {

    register: (name, fn) => {
        endpoints[name] = fn;
        sync(name);
    },

    send: (msg) => {
        self.postMessage(msg);
    },

    sync: (name) => {
        if (name) {
            if (isinit) dispatch.send({register: [name]});
        } else {
            dispatch.send({register: Object.keys(endpoints)});
        }
    },

    onmessage: (e) => {

        if (e.data === '--init--') {
            isinit = true;
            dispatch.sync();
            return;
        }

        let time_recv = time(),
            msg = e.data || {},
            run = endpoints[msg.task],
            send = {
                data : function(data,direct) {
                    dispatch.send({
                        seq: msg.seq,
                        task: msg.task,
                        done: false,
                        data: data
                    }, direct);
                },
                done : function(data,direct) {
                    dispatch.send({
                        seq: msg.seq,
                        task: msg.task,
                        done: true,
                        data: data
                    }, direct);
                }
            };

        if (run) {
            try {
                let time_xfer = (time_recv - msg.time),
                    output = run(msg.data, send),
                    time_send = time(),
                    time_proc = time_send - time_recv;

                if (output) dispatch.send({
                    seq: msg.seq,
                    task: msg.task,
                    time_send: time_xfer,
                    time_proc: time_proc,
                    // replaced on reply side
                    time_recv: time(),
                    data: output
                });
            } catch (wrkerr) {
                // console.log(wrkerr);
                console.trace(wrkerr.stack);
                send.done({error: wrkerr.toString()});
            }
        } else {
            console.log({worker_unhandled: e, msg, fn: dispatch[msg.task]});
        }
    }

};

// attach onmessage hanler
self.onmessage = dispatch.onmessage;

})();
