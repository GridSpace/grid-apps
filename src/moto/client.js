/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

let gapp = self.gapp = self.gapp || {},
    moto = self.moto = self.moto || {},
    time = function() { return new Date().getTime() },
    restarting = false,
    running = {},
    workurl = null,
    worker = null,
    seqid = 1;

if (moto.client) return;

/**
 * @param {Function} fn name of function in moto.worker
 * @param {Object} data to send to server
 * @param {Function} onreply function to call on reply messages
 * @param {Object[]} zerocopy array of objects to pass using zerocopy
 */
function send(fn, data, onreply, zerocopy) {
    let seq = seqid++;

    if (onreply) {
        // establish listener and track replies
        running[seq] = { fn:onreply };
    }
    let msg = {
        seq: seq,
        task: fn,
        time: time(),
        data: data
    };
    try {
        worker.postMessage(msg, zerocopy);
    } catch (error) {
        console.trace('work send error', {data, error});
    }
}

// code is running in the browser / client context
let client = moto.client = {
    send: send,

    // factory can be overridden
    newWorker: function(url = workurl) {
        if (self.createWorker) {
            return self.createWorker();
        } else {
            return new Worker(workurl = url);
        }
    },

    // return number of running requests
    current: function() {
        let current = 0;
        for (let rec of Object.values(running)) {
            if (rec.fn) current++;
        }
        return current;
    },

    stop: function() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
    },

    // same as restart
    start: function(url) {
        client.restart(url);
    },

    restart: function(url) {
        // prevent re-entry from cancel callback
        if (restarting) {
            return;
        }

        client.stop();

        restarting = true;

        for (let key in running) {
            let rec = running[key];
            if (rec.fn) {
                rec.fn({error: "cancelled operation"});
            }
        }

        running = {};
        worker = client.newWorker(url);

        // bind to client to enable synth injections
        client.onmessage = worker.onmessage = function(e) {
            let now = time(),
                reply = e.data,
                record = running[reply.seq],
                onreply = record ? record.fn : undefined;

            if (reply.register) {
                // console.log({register: reply.register});
                return;
            }

            if (reply.done) {
                delete running[reply.seq];
            }

            // calculate and replace recv time
            reply.time_recv = now - reply.time_recv;

            if (onreply) {
                onreply(reply.data, reply);
            } else {
                console.log({drop_reply: reply});
            }
        };

        // signal worker client is ready
        worker.postMessage("--init--");

        restarting = false;
    }

};

})();
