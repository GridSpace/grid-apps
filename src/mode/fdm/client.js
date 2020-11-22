/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        FDM = KIRI.driver.FDM,
        SPACE;

    FDM.init = function(kiri, api) {
        SPACE = api.const.SPACE;
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.fdmSupport.marker.style.display = proc.sliceSupportEnable ? 'flex' : 'none';
        });
        return;
        api.feature.hover = true;
        api.event.on("mouse.hover", (data) => {
            const { int, type, point } = data;
            if (SPACE._int1) {
                SPACE.scene.remove(SPACE._int1);
            }
            addbox(point, 0xff0000, 'intZ');
            let dir = new THREE.Vector3(0,1,0)
            let ray = new THREE.Raycaster(point, dir);
            // when on object, project down on downward faces
            if (int && int.face && int.face.normal.z < -0.1) {
                dir.y = -1;
            }
            let i2 = ray.intersectObjects(api.widgets.meshes(), false);
            if (i2 && i2.length > 0) {
                // prevent false matches close to origin of ray
                i2 = i2.filter(i => i.distance > 0.01);
                // prevent single point base to top matches
                if (i2.length > 1) {
                    i2 = i2[0].point;
                    addbox(i2, 0x00ff00, 'intW');
                }
            }
        });
    }

    function delbox(name) {
        const old = SPACE[`__${name}`];
        if (old) {
            SPACE.scene.remove(old);
        }
    }

    function addbox(point, color, name) {
        delbox(name);
        name = `__${name}`;
        const box = SPACE[name] = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({color})
        );
        box.position.x = point.x;
        box.position.y = point.y;
        box.position.z = point.z;
        SPACE.scene.add(box);
    }

})();
