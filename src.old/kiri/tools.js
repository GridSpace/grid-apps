/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// dep: add.three
// dep: kiri.api
gapp.register("kiri.tools", (root, exports) => {

const { Vector3, Quaternion } = THREE;
const { kiri, moto } = root;
const { api } = kiri;

const XAXIS = new THREE.Vector3(1,0,0);
const ZAXIS = new THREE.Vector3(0,0,1);

// circle
let pgeo = new THREE.CircleGeometry(8, 30);
let pmat = new THREE.MeshBasicMaterial({color: 0xddeeff, opacity: 0.6, transparent: true});
let pmesh = new THREE.Mesh(pgeo, pmat);

// circle outline
let pi = pgeo.index.array;
let pp = pgeo.attributes.position.array;
let np = [];
for (let i=0; i<pi.length; i++) {
    if (pi[i] * pi[i+1]) {
        np.push(pp[pi[i]*3+0]);
        np.push(pp[pi[i]*3+1]);
        np.push(pp[pi[i]*3+2]);
        np.push(pp[pi[i+1]*3+0]);
        np.push(pp[pi[i+1]*3+1]);
        np.push(pp[pi[i+1]*3+2]);
    }
}

let wgeo = new THREE.BufferGeometry();
wgeo.setAttribute('position', new THREE.BufferAttribute(np.toFloat32(), 3));

let wmat = new THREE.LineBasicMaterial({ color: 0x6699cc });
let wmesh = new THREE.LineSegments(wgeo, wmat);
pmesh.add(wmesh);

let alert;
let lastobj;
let lastface;
let enabled = false;
let opName = 'lay flat';
let onDone = onLayFlatSelect;

function onLayFlatSelect() {
    let q = new Quaternion().setFromUnitVectors(lastface.normal, new Vector3(0,0,-1));
    api.selection.rotate(q);
    // endIt();
}

function onFaceUpSelect() {
    api.event.emit('tool.mesh.face-normal', lastface.normal);
    // endIt();
}

function startIt() {
    if (enabled) {
        endIt();
        return;
    }
    if (api.feature.hover) {
        console.log(`${opName} cannot pre-empt hover`);
        return;
    }
    api.feature.hover = true;
    enabled = true;
    alert = api.show.alert(`[ESC] to end ${opName}`, 600000);
}

function endIt() {
    if (enabled) {
        api.hide.alert(alert);
        api.feature.hover = false;
        enabled = false;
        alert = undefined;
        cleanup();
    }
}

function cleanup() {
    if (lastobj) {
        lastobj.remove(pmesh);
        lastobj = undefined;
    }
}

api.event.on('key.esc', endIt);

api.event.on('tool.camera.focus', (fn) => {
    opName = 'camera focus';
    onDone = fn;
    startIt();
});

api.event.on('tool.mesh.face-up', () => {
    opName = 'face select';
    onDone = onFaceUpSelect;
    startIt();
});

api.event.on('tool.mesh.lay-flat', () => {
    opName = 'lay flat';
    onDone = onLayFlatSelect;
    startIt();
});

function scale() {
    let cam = moto.space.internals().camera;
    let dist = cam.position.distanceTo(pmesh.position);
    let scale = opName === 'camera focus' ?
        Math.min(0.25, 100 / dist) : dist / 100;
    pmesh.scale.set(scale,scale,scale);
}

api.event.on("space.view.zoom", scale);

api.event.on('mouse.hover', (ev) => {
    if (!enabled) {
        return;
    }
    cleanup();
    let { int, ints, event, point, type } = ev;
    if (type === 'widget') {
        lastface = int.face;
        let obj = lastobj = int.object;
        let norm = int.face.normal;
        let widget = obj.widget;
        let track = widget.track;
        let opos = track.pos;
        obj.add(pmesh);
        pmesh.position.x = point.x - opos.x + norm.x * 0.1;
        if (track.indexed) {
            let rad = track.indexRad;
            let py = point.y * 1.001;
            let pz = point.z * 1.001;
            let v = new THREE.Vector3(point.x, py, pz).applyAxisAngle(XAXIS, rad);
            pmesh.position.y = -v.z;
            pmesh.position.z = v.y;
        } else {
            const zcomp = api.mode.get() === 'CAM' ? track.tzoff : 0;
            pmesh.position.y = -point.z - opos.y + norm.y * 0.1;
            pmesh.position.z = point.y + zcomp + norm.z * 0.1;
        }
        let q = new Quaternion().setFromUnitVectors(ZAXIS,
            new Vector3(norm.x,norm.y,norm.z)
        );
        pmesh.setRotationFromQuaternion(q);
        scale();
    }
});

api.event.on('mouse.hover.up', (ev) => {
    if (!enabled) {
        return;
    }
    let { object } = ev;
    if (!object) {
        return;
    }
    onDone(ev);
    endIt();
});

});
