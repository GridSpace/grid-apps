/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let MOTO = self.moto = self.moto || {},
    time = Date.now;

// allow license to inject module
self.gapp = self.gapp || MOTO;

// code is running in the worker / server context
const dispatch = MOTO.worker = {

    send: (msg) => {
        self.postMessage(msg);
    },

    onmessage: (e) => {

        if (e.data === '--init--') {
            console.log('worker got init');
            return;
        }

        let time_recv = time(),
            msg = e.data || {},
            run = dispatch[msg.task],
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
