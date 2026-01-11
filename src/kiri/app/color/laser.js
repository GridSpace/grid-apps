/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { BASE_SCHEME } from './base.js';

/**
 * LASER_SCHEME: Colors for LASER, DRAG (knife), WJET (waterjet), and WEDM (wire-edm) modes
 * All 2D device types share similar visual characteristics
 * Inherits from BASE_SCHEME with minimal overrides
 */
const LASER_SCHEME = {
    // Inherit all base colors
    ...BASE_SCHEME,

    // Laser-specific view overrides (similar to CAM)
    views: {
        ...BASE_SCHEME.views,
        PREVIEW: {
            preview_opacity: 0.2
        }
    }
};

// DRAG, WJET, and WEDM all use the same scheme as LASER
const DRAG_SCHEME = LASER_SCHEME;
const WJET_SCHEME = LASER_SCHEME;
const WEDM_SCHEME = LASER_SCHEME;

export { LASER_SCHEME, DRAG_SCHEME, WJET_SCHEME, WEDM_SCHEME };
