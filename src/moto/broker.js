class Broker {
    constructor() {
        this.topics = {};
    }

    topics() {
        return Object.keys(this.topics);
    }

    subscribe(topic, listener) {
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
        if (topic !== ".topic.publish") {
            this.publish(".topic.publish", {topic, message, options});
        }
        let channel = this.topics[topic];
        if (channel && channel.length) {
            for (let listener of channel) {
                listener(message, topic, options);
            }
        }
    }
}
