/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri.api
gapp.register("kiri.alerts", [], (root, exports) => {

const { kiri } = root;
const { api } = kiri;

let alerts = [];

function show(message, time) {
    if (message === undefined || message === null) {
        return update(true);
    }
    let rec = [message, Date.now(), time, true];
    if (api.feature.alert_event) {
        api.event.emit('alert', rec);
    } else {
        alerts.push(rec);
        update();
    }
    return rec;
}

function hide(rec, recs) {
    if (Array.isArray(recs)) {
        for (let r of recs) {
            hide(r);
        }
        return;
    }
    if (api.feature.alert_event) {
        api.event.emit('alert.cancel', rec);
        return;
    }
    if (Array.isArray(rec)) {
        rec[3] = false;
        update();
    }
}

function update(clear) {
    if (clear) {
        alerts = [];
    }
    const now = Date.now();
    const { ui } = api;
    // filter out by age and active flag
    alerts = alerts.filter(alert => {
        return alert[3] && (now - alert[1]) < ((alert[2] || 5) * 1000);
    });
    // limit to 5 showing
    while (alerts.length > 5) {
        alerts.shift();
    }
    // return if called before UI configured
    if (!ui.alert) {
        return;
    }
    if (alerts.length > 0) {
        ui.alert.text.innerHTML = alerts.map(v => ['<p>',v[0],'</p>'].join('')).join('');
        ui.alert.dialog.style.display = 'flex';
    } else {
        ui.alert.dialog.style.display = 'none';
    }
}

// extend API
Object.assign(api.alerts, {
    hide,
    show,
    update
});

});
