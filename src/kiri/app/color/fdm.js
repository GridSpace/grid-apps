/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { BASE_SCHEME } from './base.js';

/**
 * FDM_SCHEME: Colors specific to FDM (Fused Deposition Modeling) mode
 * Inherits from BASE_SCHEME and overrides/extends with FDM-specific values
 */
const FDM_SCHEME = {
    // Inherit all base colors
    ...BASE_SCHEME,

    // FDM-specific view overrides
    views: {
        ...BASE_SCHEME.views,
        PREVIEW: {
            preview_opacity: 0.0,  // FDM hides widget in preview
            sliced_opacity: 0.0
        }
    },

    // FDM-specific operations
    operations: {
        // Support painting overlay
        paint: {
            overlay: 0x4488ff,  // Light blue for painted support regions
            opacity: 0.7
        }
    },

    // Gcode preview colors
    gcode: {
        head: 0x888888,
        move: {
            light: 0xaaaaaa,
            dark: 0x666666
        },
        print: 0x777700
    }
};

export { FDM_SCHEME };
