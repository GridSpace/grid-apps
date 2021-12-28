/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let moto = self.moto = self.moto || {};
    if (moto.Ajax) return;

    moto.Ajax = Ajax;

    moto.callAjax = function(url, handler) {
        new Ajax(handler).request(url);
    };

    const AP = Ajax.prototype,
        KV = data.Local,
        KEY = "moto-ajax",
        TIME = function() { return new Date().getTime() },
        MOKEY = moto.id = KV.getItem(KEY) || (TIME().toString(36)+rnd()+rnd());

    moto.restore = function(id) {
        MOKEY = moto.id = id;
        KV.setItem(KEY, MOKEY);
    }

    KV.setItem(KEY, MOKEY);

    const STATES = [
        "request not initialized",        // 0
        "server connection established",  // 1
        "request recieved",               // 2
        "processing request",             // 3
        "request complete"                // 4
    ];

    function Ajax(callback, responseType) {
        this.ajax = new XMLHttpRequest();
        this.ajax.onreadystatechange = this.onStateChange.bind(this);
        this.ajax.withCredentials = true;
        this.state = STATES[0];
        this.callback = callback;
        this.responseType = responseType;
    }

    function rnd() {
        return Math.round(Math.random()*0xffffffff).toString(36);
    }

    AP.onStateChange = function() {
        this.state = STATES[this.ajax.readyState];
        if (this.ajax.readyState === 4 && this.callback) {
            let status = this.ajax.status;
            if (status >= 200 && status < 300) {
                this.callback(this.ajax.responseType ? this.ajax.response : this.ajax.responseText, this.ajax);
            } else {
                this.callback(null, this.ajax);
            }
        }
    };

    /**
     * @param {String} url
     * @param {Object} [send]
     * @param {Object} [headers]
     */
    AP.request = function(url, send, headers) {
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
    };

})();
