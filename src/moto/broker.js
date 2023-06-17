/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("moto.broker", [], (root, exports) => {

class Broker {

    constructor() {
        this.topics = {};
        this.used = {};
        this.send = {};
        // using the pattern "broker.send(msg)" induces runtime errors
        // when there is not at least one registered listener for a topic
        // while also allowing for a more natural function call interface
        // and guarding against typos in topic names
    }

    topics() {
        return Object.keys(this.topics);
    }

    // create subscriptions for all functions in an object
    // a complement wrapObject on the subscription side
    listeners(object, root) {
        for (let [key, fn] of Object.entries(object)) {
            if (typeof fn === 'function') {
                key = root ? `${root}_${key}` : key;
                this.subscribe(key, fn);
            }
        }
    }

    // attach function to a topic
    // creates topic if new topic
    // creates a send function if new topic
    subscribe(topic, listener) {
        if (Array.isArray(topic)) {
            for (let t of topic) {
                this.subscribe(t, listener);
            }
            return this;
        }
        if (typeof topic !== 'string') {
            console.trace({invalid_topic: topic});
            return;
        }
        let topics = this.topics;
        let channel = topics[topic];
        if (!channel) {
            channel = topics[topic] = [];
        }
        if (channel.indexOf(listener) < 0) {
            let send = this.send;
            let name = topic.replace(/[\\ \.-]/g, '_');
            send[name] = send[name] = this.bind(topic);
            channel.push(listener);
            this.publish(".topic.add", topic);
        }
        return this;
    }

    unsubscribe(topic, listener) {
        let channel = this.topics[topic];
        if (!channel) {
            return;
        }
        let index = channel.indexOf(listener);
        if (index < 0) {
            return;
        }
        channel.splice(index,1);
        if (channel.length === 0) {
            delete this.topics[topic];
            this.publish(".topic.remove", topic);
        }
    }

    publish(topic, message, options = {}) {
        if (Array.isArray(topic)) {
            for (let t of topic) {
                this.publish(t, message, options);
            }
            return;
        }
        if (topic !== ".topic.publish") {
            this.publish(".topic.publish", {topic, message, options});
        }
        // store last seen message on a topic
        // acts as a tracker for all used topics
        this.used[topic] = message;
        let channel = this.topics[topic];
        if (channel && channel.length) {
            for (let listener of channel) {
                try {
                    listener(message, topic, options);
                } catch (e) {
                    // console.log({listener_error: e, topic, options, listener});
                    setTimeout(() => { throw e }, 1);
                }
            }
        } else if (topic.indexOf(".topic.") < 0) {
            if (self.dbug) {
                self.dbug.debug(`undelivered '${topic}'`, message);
            } else {
                console.log(`undelivered '${topic}'`, message);
            }
        }
        return message;
    }

    // return function bound to a topic for publishing
    bind(topic, message, options) {
        let broker = this;
        return function(msg, opt) {
            broker.publish(topic, message || msg, options || opt);
        }
    }

    // return function wrapper that publishes a message to a topic
    // the published message is the return data from the function call
    wrap(topic, fn) {
        let broker = this;
        return function() {
            return broker.publish(topic, fn(...arguments));
        }
    }

    // bind all functions in an object to a topic root
    // functions are replaced with wrappers that publish call results
    // a natural use case is wrapping api objects
    wrapObject(object, root) {
        for (let [key, fn] of Object.entries(object)) {
            if (typeof fn === 'function') {
                object[key] = this.wrap(`${root}_${key}`, fn);
            }
        }
    }

}

const { moto } = root;
gapp.broker = moto.broker = new Broker();

});
