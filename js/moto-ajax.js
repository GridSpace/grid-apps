/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_moto_ajax = exports;

(function() {
    if (!self.moto) self.moto = {};
    if (self.moto.Ajax) return;

    self.moto.Ajax = Ajax;
    self.moto.callAjax = function(url, handler) {
        new Ajax(handler).request(url);
    };

    var STATES = [
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

    var AP = Ajax.prototype,
        KV = moto.KV,
        KEY = "moto-ajax",
        TIME = function() { return new Date().getTime() },
        MOKEY = KV.getItem(KEY) || (TIME().toString(36)+rnd()+rnd());

    KV.setItem(KEY, MOKEY);

    AP.onStateChange = function() {
        this.state = STATES[this.ajax.readyState];
        if (this.ajax.readyState === 4 && this.callback) {
            var status = this.ajax.status;
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
        for (var k in headers) {
            this.ajax.setRequestHeader(k, headers[k]);
        }
        if (send) {
            this.ajax.send(send);
        } else {
            this.ajax.send();
        }
    };

})();
