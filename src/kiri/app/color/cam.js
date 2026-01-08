/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { BASE_SCHEME } from './base.js';

/**
 * CAM_SCHEME: Colors specific to CAM (3-axis milling/machining) mode
 * Inherits from BASE_SCHEME and overrides/extends with CAM-specific values
 */
const CAM_SCHEME = {
    // Inherit all base colors
    ...BASE_SCHEME,

    // CAM-specific view overrides
    views: {
        ...BASE_SCHEME.views,
        SLICE: {
            ...BASE_SCHEME.views.SLICE,
            sliced_opacity: 0.2  // CAM shows more during slice (vs FDM 0.0)
        },
        PREVIEW: {
            preview: {
                light: 0xdddddd,
                dark: 0x888888
            },
            preview_opacity: {
                light: 0.2,
                dark: 0.2
            }
        }
    },

    // CAM-specific operations
    operations: {
        // Tab visualization (persistent geometry)
        tabs: {
            color: {
                light: 0x0000dd,  // Blue in light mode
                dark: 0x00ddff    // Cyan in dark mode
            },
            opacity: {
                light: 0.6,
                dark: 0.75
            }
        }
    },

    // Gcode preview colors (same as FDM, but documented for CAM)
    gcode: {
        head: 0x888888,
        move: {
            light: 0xaaaaaa,
            dark: 0x666666
        },
        print: 0x777700
    }
};

export { CAM_SCHEME };
