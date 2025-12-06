/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

(function() {
    let KIRI = self.kiri = self.kiri || {};
    let frame, cwin, onevent = {}, targetOrigin;

    function $(id) { return document.getElementById(id) }

    function setFrame(fo) {
        frame = fo;
        cwin = fo.contentWindow;
    }

    function send(msg) {
        cwin.postMessage(msg, targetOrigin);
    }

    function recv(msg) {
        let { origin, source, target, data } = msg;
        let efn = onevent[data.event];
        if (efn) {
            efn(data.data, data.event);
        }
        if (API.onmessage) {
            API.onmessage(data, msg);
        }
    }

    function dispatchMessage(msg) {
        let { origin, source, target, data } = msg;
        if (source.window === cwin) {
            recv(msg);
        }
    }

    let API = KIRI.frame = {
        setFrame: (io, target) => {
            let type = typeof(io);
            targetOrigin = target;
            switch (type) {
                case 'string': setFrame($(io)); break;
                case 'object': setFrame(io); break;
                default: throw `invalid frame type ${type}`;
            }

	    //changed eventListener to a named function here:
	    //adding eventListeners with anonymous functions is bad practice
	    //as it is impossible to prevent them from being more than once!
 	    window.removeEventListener('message', dispatchMessage);
	    window.addEventListener('message', dispatchMessage);
        },

        send: send,

        load: (load) => { send({ load }) },

        clear: () => { send({ clear: true }) },

        parse: (data, type) => { send({ parse: data, type })},

	//update widget with id widget_id from STL data:
        update: (data, type, widget_id) => { send({ update: data, type, widget_id })},

        get: (scope) => { send({ get: scope })},

        setMode: (mode) => { send({ mode }) },

        setDevice: (device) => { send({ device })},

        setProcess: (process) => { send({ process })},

        setFeatures: (features) => { send({ features })},

        setController: (controller) => { send({ controller })},

        slice: () => { send({ function: "slice", callback: true }) },

        prepare: () => { send({ function: "prepare", callback: true }) },

        export: (cb) => { send({ function: "export", callback: cb ? true : false }) },

        onmessage: () => { },

        progress: (progress, message) => { send({ progress, message }) },

        alert: (alert, time) => { send({ alert, time }) },

        emit: (emit, message) => { send({ emit, message }) },

        onevent: (event, fn) => {
            onevent[event] = fn;
            send({ event });
        }
    };

    API.on = API.onevent;
})();
