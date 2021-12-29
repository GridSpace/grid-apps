/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

if (gapp.broker) return;

class Broker {
    constructor() {
        this.topics = {};
        this.used = {};
    }

    topics() {
        return Object.keys(this.topics);
    }

    subscribe(topic, listener) {
        if (Array.isArray(topic)) {
            for (let t of topic) {
                this.subscribe(t, listener);
            }
            return;
        }
        let topics = this.topics;
        let channel = topics[topic];
        if (!channel) {
            channel = topics[topic] = [];
        }
        if (channel.indexOf(listener) < 0) {
            channel.push(listener);
            this.publish(".topic.add", topic);
        }
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
            dbug.debug(`undelivered '${topic}'`, message);
        }
    }

    // return function bound to a topic
    bind(topic, message, options) {
        let broker = this;
        return function(msg, opt) {
            broker.publish(topic, message || msg, options || opt);
        }
    }
}

gapp.broker = new Broker();
gapp.register('moto.broker');

})();
