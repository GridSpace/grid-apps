/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { BASE_SCHEME } from './base.js';

/**
 * SLA_SCHEME: Colors specific to SLA (stereolithography/resin) mode
 * Inherits from BASE_SCHEME with minimal overrides
 */
const SLA_SCHEME = {
    // Inherit all base colors
    ...BASE_SCHEME,

    // SLA-specific view overrides (similar to FDM)
    views: {
        ...BASE_SCHEME.views,
        PREVIEW: {
            preview_opacity: 0.0,
            sliced_opacity: 0.0
        }
    }
};

export { SLA_SCHEME };
