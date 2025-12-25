/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';

/**
 * Active alert records. Each record is an array: [message, timestamp, duration, active]
 * @type {Array<[string, number, number, boolean]>}
 */
let alerts = [];

/**
 * Display an alert message to the user
 * @param {string} message - The message to display
 * @param {number} time - Duration in seconds to show the alert
 * @returns {Array|undefined} Alert record [message, timestamp, duration, active] or result of update()
 */
function show(message, time) {
    if (message === undefined || message === null) {
        return update(true);
    }
    let rec = [message, Date.now(), time, true];
    if (api.feature.alert_event) {
        api.event.emit('alert', rec);
    } else {
        alerts.push(rec);
        setTimeout( update, time+0.02);
        update();
    }
    return rec;
}

/**
 * Hide one or more alerts
 * @param {Array|Array<Array>} rec - Single alert record or array of records to hide
 * @param {Array<Array>} [recs] - Optional array of alert records (deprecated parameter style)
 */
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

/**
 * Update the alert display by filtering expired/inactive alerts and rendering active ones.
 * Filters alerts by age (based on duration) and active flag, limits display to 5 alerts.
 * @param {boolean} [clear] - If true, clears all alerts before updating
 */
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

export {
    hide,
    show,
    update
};

export default {
    hide,
    show,
    update
};
