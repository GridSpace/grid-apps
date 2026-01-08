/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * BASE_SCHEME: Shared colors used across all device modes
 * All mode-specific schemes inherit from this base
 */
const BASE_SCHEME = {
    // Widget colors for selected/deselected states
    widget: {
        selected: {
            light: [ 0xbbff00, 0xbbee00, 0xbbdd00, 0xbb9900 ],
            dark: [ 0xbbff00, 0xbbee00, 0xbbdd00, 0xbb9900 ]
        },
        deselected: {
            light: [ 0xffff00, 0xffdd00, 0xffbb00, 0xff9900 ],
            dark: [ 0xffff00, 0xffdd00, 0xffbb00, 0xff9900 ]
        },
        disabled: {
            // Computed via avgc(0x888888, baseColor, 3)
            mixWith: 0x888888,
            mixRatio: 3
        }
    },

    // Edge rendering settings
    edges: {
        color: {
            light: 0x888888,
            dark: 0x444444
        },
        angle: 20  // Default edge detection angle threshold
    },

    // Wireframe rendering settings
    wireframe: {
        color: {
            light: 0x000000,
            dark: 0xaaaaaa
        },
        opacity: {
            light: 0.5,
            dark: 0.25
        }
    },

    // Grid colors for platform
    grid: {
        major: {
            light: 0x999999,
            dark: 0x666666
        },
        minor: {
            light: 0xcccccc,
            dark: 0x333333
        }
    },

    // View-specific opacity defaults (common across modes)
    views: {
        ARRANGE: {
            model_opacity: 1.0
        },
        SLICE: {
            slicing_opacity: 0.5
        }
    }
};

export { BASE_SCHEME };
