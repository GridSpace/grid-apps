kiri.load(function(API) {
    let pgeo = new THREE.CircleGeometry(8, 30);
    let pmat = new THREE.MeshBasicMaterial({color: 0xff0000, opacity: 0.5, transparent: true});
    let pmesh = new THREE.Mesh(pgeo, pmat);
    let wgeo = new THREE.WireframeGeometry(pgeo);
    let wmat = new THREE.LineBasicMaterial({ color: 0x883333 });
    let wmesh = new THREE.LineSegments(wgeo, wmat);
    pmesh.add(wmesh);

    let alert;
    let lastobj;
    let lastface;
    let enabled = false;

    function cleanup() {
        if (lastobj) {
            lastobj.remove(pmesh);
            lastobj = undefined;
        }
    }

    function endit() {
        if (enabled) {
            API.hide.alert(alert);
            $('lay-flat').classList.remove('selected');
            API.feature.hover = false;
            enabled = false;
            alert = undefined;
            cleanup();
        }
    }

    API.event.on('key.esc', endit);
    API.event.on('tool.mesh.lay-flat', () => {
        if (enabled) {
            endit();
            return;
        }
        if (API.feature.hover) {
            console.log('lay flat cannot pre-empt hover');
            return;
        }
        $('lay-flat').classList.add('selected');
        API.feature.hover = true;
        enabled = true;
        alert = API.show.alert('[ESC] to end lay-flat operation', 600000);
    });
    API.event.on('mouse.hover', (ev) => {
        cleanup();
        let { int, ints, event, point, type } = ev;
        if (type === 'widget') {
            lastface = int.face;
            let obj = lastobj = int.object;
            let norm = int.face.normal;
            let opos = obj.widget.track.pos;
            obj.add(pmesh);
            pmesh.position.x = point.x - opos.x + norm.x * 0.1;
            pmesh.position.y = -point.z - opos.y + norm.y * 0.1;
            pmesh.position.z = point.y + norm.z * 0.1;
            let q = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0,0,1),
                new THREE.Vector3(norm.x,norm.y,norm.z)
            );
            pmesh.setRotationFromQuaternion(q);
        }
    });
    API.event.on('mouse.hover.up', (ev) => {
        let { int, point, object } = ev;
        if (!object) {
            return;
        }
        let q = new THREE.Quaternion().setFromUnitVectors(lastface.normal, new THREE.Vector3(0,0,-1));
        API.selection.rotate(q);
        endit();
    });
});