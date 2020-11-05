/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process;

    CAM.init = function(kiri, api) {
        api.event.on("mode.set", (mode) => {
            let isCAM = mode === 'CAM';
            $('set-tools').style.display = isCAM ? '' : 'none';
            kiri.space.platform.setColor(isCAM ? 0xeeeeee : 0xcccccc);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
        });
    }

    CAM.sliceRender = function(widget) {
        let slices = widget.slices;
        if (!slices) return;

        slices.forEach(function(slice) {
            let tops = slice.tops,
                layers = slice.layers,
                outline = layers.outline,
                open = (slice.camMode === PRO.CONTOUR_X || slice.camMode === PRO.CONTOUR_Y);

            layers.outline.clear(); // slice raw edges
            layers.trace.clear();   // roughing
            layers.solid.clear();   // outline
            layers.bridge.clear();  // outline x
            layers.flat.clear();    // outline y
            layers.fill.clear();    // facing

            tops.forEach(function(top) {
                outline.poly(top.poly, 0x999900, true, open);
                // if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                if (top.inner) outline.poly(top.inner, 0xff0000, true);
            });

            // various outlining
            let layer;
            slice.tops.forEach(function(top) {
                switch (slice.camMode) {
                    case PRO.OUTLINE:
                        layer = layers.solid;
                        break;
                    case PRO.CONTOUR_X:
                        layer = layers.bridge;
                        break;
                    case PRO.CONTOUR_Y:
                        layer = layers.flat;
                        break;
                    default: // roughing
                        layer = layers.trace;
                        break;
                }
                if (top.traces) {
                    layer.poly(top.traces, 0x010101, true, null);
                }
            });

            // facing (previously separate. now part of roughing)
            layer = slice.layers.fill;
            slice.tops.forEach(function(top) {
                if (top.fill_lines) {
                    layer.lines(top.fill_lines, fill_color);
                }
            });

            outline.render();
            layers.trace.render();
            layers.solid.render();
            layers.bridge.render();
            layers.flat.render();
            layers.fill.render();
        });
    }

    CAM.printRender = function(print) {
        return KIRI.driver.FDM.printRender(print, {
            aslines: true,
            color: 0x010101,
            move_color: 0xcc3333
        });
    }

})();
