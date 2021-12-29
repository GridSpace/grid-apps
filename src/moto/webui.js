/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register('moto.webui');

// some ui helpers that need to go into a ui class
function $(id) {
    return document.getElementById(id);
}

function $d(id, v) {
    $(id).style.display = v;
}

function $h(id, h) {
    $(id).innerHTML = h;
}

function estop(evt) {
    evt.stopPropagation();
    evt.preventDefault();
}
