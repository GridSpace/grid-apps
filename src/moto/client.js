/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let moto = self.moto = self.moto || {},
    ccvalue = self.navigator ? navigator.hardwareConcurrency || 1 : 1,
    ccmax = ccvalue > 3 ? ccvalue - 1 : 0,
    workcc = false, // concurrent or not
    workurl = null, // url to load worker
    worknum = 1,    // number of workers to start
    workers = [],   // array of all workers
    queue = [];     // array of work requests

if (moto.client) return;

gapp.register('moto.client');

// code is running in the browser / client context
let client = moto.client = {

    live: () => {
        return workers.length;
    },

    free: () => {
        return workers.filter(w => w.run === null).length;
    },

    max: () => {
        return ccmax;
    },

    fn: {},

    bind: (task) => {
        if (!client.fn[task]) {
            client.fn[task] = (data, options) => {
                return client.call(task, data, options);
            };
        }
    },

    call: (task, data, options = {}) => {
        let { direct, stream } = options;
        return new Promise((resolve, reject) => {
            let ondata, ondone, onerror = reject;
            if (!stream) {
                let accum = [];
                ondata = (data) => {
                    accum.push(data);
                };
                ondone = () => {
                    resolve(accum);
                };
            } else {
                ondata = stream;
                ondone = resolve;
            }
            client.queue(task, data, { direct, ondata, ondone, onerror });
        });
    },

    queue: (task, data, options = {}) => {
        queue.push({task, data, options});
        client.kick();
    },

    kick: () => {
        if (queue.length === 0) {
            return;
        }

        let rec, worker;
        outer: for (let qrec of queue) {
            let { options } = qrec;
            let { index } = options;
            if (index >= 0) {
                // worker designated by index
                let mod = index % workers.length;
                if (workers[mod].run === null) {
                    worker = workers[mod];
                    rec = qrec;
                    break;
                }
            } else {
                // first available worker
                for (let i=0; i<workers.length; i++) {
                    if (workers[i].run === null) {
                        worker = workers[i];
                        rec = qrec;
                        break outer;
                    }
                }
            }
        }

        if (!rec) {
            // nothing runnable
            return;
        }

        // remove queue item
        let qindex = queue.indexOf(rec);
        if (qindex < 0) {
            throw "invalid queue record";
        }
        queue.splice(qindex,1);

        let { task, data, options } = rec;
        let { direct, ondone, ondata, onerror } = options;

        if (ondone || ondata) {
            worker.run = { ondone, ondata, onerror };
        }

        let msg = {
            task,
            data,
            stream: ondata ? true : false
        };
        try {
            worker.postMessage(msg, direct);
        } catch (error) {
            console.trace('work send error', {data, error});
        }
    },

    // factory can be overridden
    spawn: function(url = workurl) {
        if (self.createWorker) {
            return self.createWorker();
        } else {
            return new Worker(workurl = url);
        }
    },

    // return number of running requests
    running: function() {
        return workers.filter(w => w.run).length;
    },

    stop: function() {
        for (let w of workers) {
            w.terminate();
        }
        workers = [];
    },

    // same as restart
    start: function(url = workurl, cc = workcc || 1) {
        workcc = cc;
        worknum = Math.min(ccmax, workcc);
        workurl = url;
        client.restart(url, cc);
    },

    restart: function() {
        client.stop();

        // send cancel/error notification to requestors
        for (let w of workers.filter(w => w.run)) {
            if (w.run.ondone) {
                w.run.ondone({error: "cancelled operation"});
            }
        }

        for (let i=0; i<worknum; i++) {
            let worker = client.spawn(workurl);
            worker.run = null;
            worker.index = i;
            worker.onmessage = function(e) {
                let reply = e.data;
                if (reply.bind) {
                    client.bind(reply.bind);
                    return;
                }

                if (worker.run === null) {
                    console.log({client_unhandled: e});
                    throw "message on idle worker";
                }

                let { done, data, error } = reply;
                let { ondone, ondata, onerror } = worker.run;
                let handled = false;

                if (error) {
                    onerror(error);
                    worker.run = null;
                    handled = true;
                    client.kick();
                }

                if (ondata && data) {
                    ondata(data);
                    handled = true;
                }

                if (done) {
                    ondone();
                    worker.run = null;
                    handled = true;
                    client.kick();
                }

                if (!handled) {
                    console.log({client_unhandled: e});
                    throw "client unhandled reply";
                }
            };

            workers.push(worker);
        }

        client.kick();
    }

};

})();
