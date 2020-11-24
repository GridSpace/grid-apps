/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

kiri.loader.push(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        newPolygon = BASE.newPolygon,
        newPoint = BASE.newPoint;

    if (KIRI.client)
    CAM.animate = function(API) {
        const settings = API.conf.get();
        const stock = settings.stock;
        const center = stock.center;

        console.log("animate", settings.stock);

        const step = 1;
        const stepsX = Math.floor(stock.x / step) + 1;
        const stepsY = Math.floor(stock.y / step) + 1;
        const gridPoints = stepsX * stepsY;

        const mat = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.75,
            color: 0
        });

        const pos = new Float32Array(gridPoints * 3);
        const ind = [];
        const ox = stock.x / 2;
        const oy = stock.y / 2;

        // initialize grid points
        for (let x=0, ai=0; x<stepsX; x++) {
            for (let y=0; y<stepsY; y++) {
                pos[ai++] = x * step - ox;
                pos[ai++] = y * step - oy;
                pos[ai++] = stock.z;
                if (y > 0) ind.appendAll([
                    (stepsY * x) + (y - 1),
                    (stepsY * x) + (y    )
                ]);
                if (x > 0) ind.appendAll([
                    (stepsY * (x - 1)) + y,
                    (stepsY * (x    )) + y
                ]);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint16Array(ind), 1));
        const seg = new THREE.LineSegments(geo, mat);

        API.const.SPACE.platform.world.add(seg);

        KIRI.client.animate(123);
    };

    if (KIRI.client)
    KIRI.client.animate = function(abc) {
        send("animate", {abc}, reply => {
            console.log('client.animate.results', reply);
        });
    };

    if (KIRI.worker)
    KIRI.worker.animate = function(data, send) {
        console.log('worker.animate', data);
        send.done({def:456});
    };

});
