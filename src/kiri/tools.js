/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// dep: add.three
// dep: kiri.api
gapp.register("kiri.tools", [], (root, exports) => {

const { Vector3, Quaternion } = THREE;
const { kiri } = root;
const { api } = kiri;

// circle
let pgeo = new THREE.CircleGeometry(8, 30);
let pmat = new THREE.MeshBasicMaterial({color: 0xff0000, opacity: 0.5, transparent: true});
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

let wmat = new THREE.LineBasicMaterial({ color: 0x883333 });
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
    endIt();
}

function onFaceUpSelect() {
    // todo
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
    $('lay-flat').classList.add('selected');
    api.feature.hover = true;
    enabled = true;
    alert = api.show.alert(`[ESC] to end ${opName}`, 600000);
}

function endIt() {
    if (enabled) {
        api.hide.alert(alert);
        $('lay-flat').classList.remove('selected');
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

api.event.on('tool.mesh.face-up', () => {
    opName = 'face select';
    opDone = onLayFlatSelect;
    startIt();
});

api.event.on('tool.mesh.lay-flat', () => {
    opName = 'lay flat';
    opDone = onLayFlatSelect;
    startIt();
});

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
        let opos = widget.track.pos;
        obj.add(pmesh);
        pmesh.position.x = point.x - opos.x + norm.x * 0.1;
        pmesh.position.y = -point.z - opos.y + norm.y * 0.1;
        pmesh.position.z = point.y + norm.z * 0.1;
        // todo also need to account for z top offset in cam mode
        if (widget.track.indexed) {
            pmesh.position.z += widget.track.indexed / 2;
        }
        let q = new Quaternion().setFromUnitVectors(
            new Vector3(0,0,1),
            new Vector3(norm.x,norm.y,norm.z)
        );
        pmesh.setRotationFromQuaternion(q);
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
    onDone();
});

});
