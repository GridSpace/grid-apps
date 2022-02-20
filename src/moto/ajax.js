/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("moto.ajax", [], (root, exports) => {

function rnd() {
    return Math.round(Math.random()*0xffffffff).toString(36);
}

const KV = data.local,
    KEY = "moto-ajax",
    TIME = Date.now,
    MOKEY = moto.id = KV.getItem(KEY) || (TIME().toString(36)+rnd()+rnd());

KV.setItem(KEY, MOKEY);

const STATES = [
    "request not initialized",        // 0
    "server connection established",  // 1
    "request recieved",               // 2
    "processing request",             // 3
    "request complete"                // 4
];

class Ajax {
    constructor(callback, responseType) {
        this.ajax = new XMLHttpRequest();
        this.ajax.onreadystatechange = this.onStateChange.bind(this);
        this.ajax.withCredentials = true;
        this.state = STATES[0];
        this.callback = callback;
        this.responseType = responseType;
    }

    onStateChange() {
        this.state = STATES[this.ajax.readyState];
        if (this.ajax.readyState === 4 && this.callback) {
            let status = this.ajax.status;
            if (status >= 200 && status < 300) {
                this.callback(this.ajax.responseType ? this.ajax.response : this.ajax.responseText, this.ajax);
            } else {
                this.callback(null, this.ajax);
            }
        }
    }

    request(url, send, headers) {
        this.ajax.open(send ? "POST" : "GET", url, true);
        if (this.responseType) this.ajax.responseType = this.responseType;
        headers = headers || {};
        headers["X-Moto-Ajax"] = MOKEY;
        for (let k in headers) {
            this.ajax.setRequestHeader(k, headers[k]);
        }
        if (send) {
            this.ajax.send(send);
        } else {
            this.ajax.send();
        }
        return this;
    }
}

function call(url, handler) {
    return new Ajax(handler).request(url);
}

function callAjax(url, handler) {
    return new Ajax(handler).request(url);
};

function restore(id) {
    MOKEY = moto.id = id;
    KV.setItem(KEY, MOKEY);
}

exports({ Ajax, call, callAjax, restore });

});
