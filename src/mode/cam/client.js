/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process,
        newPolygon = BASE.newPolygon,
        newPoint = BASE.newPoint;

    CAM.init = function(kiri, api) {
        api.event.on("mode.set", (mode) => {
            const isCAM = mode === 'CAM';
            $('set-tools').style.display = isCAM ? '' : 'none';
            kiri.space.platform.setColor(isCAM ? 0xeeeeee : 0xcccccc);
        });
        api.event.on("settings.saved", (settings) => {
            const proc = settings.process;
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
        });

        function updateStock() {
            const STACKS = api.const.STACKS;
            const SPACE = api.const.SPACE;
            const stock = api.conf.get().stock;
            const {x, y, z} = stock;
            if (x && y && z) {
                const render = new KIRI.Render().setLayer('stock', { face: 0xaaaaaa, line: 0xaaaaaa }, true);
                const stack = STACKS.create('stock', SPACE.platform.world);
                stack.add(render.addPolys([
                    newPolygon().centerRectangle({x:0, y:0, z:0}, x, y),
                    newPolygon().centerRectangle({x:0, y:0, z}, x, y)
                ], { thin: true } ));
                const hx = x/2, hy = y/2;
                stack.add(render.addLines([
                    newPoint( hx, -hy, 0), newPoint( hx, -hy, stock.z),
                    newPoint( hx,  hy, 0), newPoint( hx,  hy, stock.z),
                    newPoint(-hx, -hy, 0), newPoint(-hx, -hy, stock.z),
                    newPoint(-hx,  hy, 0), newPoint(-hx,  hy, stock.z),
                ], { thin: true }));
            }
        }

        api.event.on("slice.end", updateStock);
        api.event.on("preview.end", updateStock);
    };

})();
