/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("moto.worker", [], (root, exports) => {

let endpoints = {};

// code is running in the worker / server context
const dispatch = exports({

    // bind an endpoint name to a function
    bind(name, fn) {
        endpoints[name] = fn;
        dispatch.send({bind: name});
    },

    // bind all functions in an object
    bindObject(object, root, recurse) {
        recurse = recurse || root === undefined;
        for (let [key, fn] of Object.entries(object)) {
            key = root ? `${root}_${key}` : key;
            if (typeof fn === 'function') {
                dispatch.bind(key, fn);
            } else if (recurse) {
                dispatch.bindObject(fn, key, recurse);
            }
        }
    },

    // allow workers to publish messages on the client side
    publish(topic, message) {
        dispatch.send({publish: topic, message});
    },

    ready() {
        dispatch.send({ready: true});
    },

    send(msg) {
        self.postMessage(msg);
    },

    onmessage(e) {
        let msg = e.data,
            run = endpoints[msg.task],
            async = false,
            done = false,
            send = {
                // puts function in async mode
                // prevents auto send.done() on function return
                async() {
                    async = true;
                },
                data(data, direct) {
                    if (canSend(data)) {
                        dispatch.send({ done: false, data: data }, direct);
                    }
                },
                done(data, direct) {
                    if (canSend(data)) {
                        dispatch.send({ done: true, data: data }, direct);
                        done = true;
                    }
                },
                error(data) {
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
                if (!done && (data || async === false)) {
                    send.done(data);
                }
            } catch (error) {
                if (error.stack) {
                    console.trace(error.stack);
                }
                send.error(error.toString());
                // dispatch.send({ data: {error: error.toString()}, done: true });
            }
        } else {
            console.log({worker_unhandled: e});
            send.error(`no registered endpoint: ${msg.task}`);
        }
    }

});

// attach onmessage hanler
self.onmessage = dispatch.onmessage;

});
