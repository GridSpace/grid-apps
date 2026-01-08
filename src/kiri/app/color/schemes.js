/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { FDM_SCHEME } from './fdm.js';
import { CAM_SCHEME } from './cam.js';
import { SLA_SCHEME } from './sla.js';
import { LASER_SCHEME, DRAG_SCHEME, WJET_SCHEME, WEDM_SCHEME } from './laser.js';

/**
 * ColorSchemeRegistry: Central registry for all mode-specific color schemes
 * Provides theme-aware color resolution for UI rendering
 */
class ColorSchemeRegistry {
    constructor() {
        // Map mode IDs to their schemes
        this.schemes = {
            1: FDM_SCHEME,      // FDM mode
            2: LASER_SCHEME,    // LASER mode
            3: CAM_SCHEME,      // CAM mode
            4: SLA_SCHEME,      // SLA mode
            5: DRAG_SCHEME,     // DRAG knife mode
            6: WJET_SCHEME,     // Waterjet mode
            7: WEDM_SCHEME      // Wire-EDM mode
        };
    }

    /**
     * Get the complete scheme for a given mode and theme
     * @param {number|string} mode - Mode ID (1=FDM, 2=LASER, 3=CAM, etc) or name
     * @param {string} theme - 'light' or 'dark'
     * @returns {object} Resolved scheme object
     */
    getScheme(mode, theme = 'light') {
        // Convert mode name to ID if needed
        if (typeof mode === 'string') {
            mode = this._modeNameToId(mode);
        }

        const scheme = this.schemes[mode];
        if (!scheme) {
            console.warn(`Unknown mode: ${mode}, using FDM scheme as fallback`);
            return this._resolveTheme(this.schemes[1], theme);
        }

        return this._resolveTheme(scheme, theme);
    }

    /**
     * Get a specific color value from a scheme
     * @param {number|string} mode - Mode ID or name
     * @param {string} theme - 'light' or 'dark'
     * @param {string} path - Dot-separated path (e.g., 'widget.selected', 'edges.color')
     * @returns {*} Color value or object
     */
    getColor(mode, theme, path) {
        const scheme = this.getScheme(mode, theme);
        return this._getNestedValue(scheme, path);
    }

    /**
     * Compute disabled color by mixing base color with gray
     * Implements: avgc(0x888888, baseColor, 3)
     * @param {number} baseColor - Base color hex value
     * @returns {number} Mixed color hex value
     */
    computeDisabledColor(baseColor) {
        // Extract RGB components
        const r1 = (0x888888 >> 16) & 0xFF;
        const g1 = (0x888888 >> 8) & 0xFF;
        const b1 = 0x888888 & 0xFF;

        const r2 = (baseColor >> 16) & 0xFF;
        const g2 = (baseColor >> 8) & 0xFF;
        const b2 = baseColor & 0xFF;

        // Average with ratio 3:1 (3 parts gray, 1 part base)
        const r = Math.floor((r1 * 3 + r2) / 4);
        const g = Math.floor((g1 * 3 + g2) / 4);
        const b = Math.floor((b1 * 3 + b2) / 4);

        return (r << 16) | (g << 8) | b;
    }

    /**
     * Resolve theme-specific values throughout the scheme
     * @private
     */
    _resolveTheme(scheme, theme) {
        const resolved = JSON.parse(JSON.stringify(scheme)); // Deep clone

        this._resolveThemeRecursive(resolved, theme);

        return resolved;
    }

    /**
     * Recursively resolve theme values in an object
     * @private
     */
    _resolveThemeRecursive(obj, theme) {
        for (const key in obj) {
            const value = obj[key];

            if (value && typeof value === 'object') {
                // Check if this object has light/dark properties
                if ('light' in value && 'dark' in value) {
                    // Replace the object with the theme-specific value
                    obj[key] = value[theme];
                } else {
                    // Recurse into nested objects
                    this._resolveThemeRecursive(value, theme);
                }
            }
        }
    }

    /**
     * Get nested value from object using dot-separated path
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Convert mode name to ID
     * @private
     */
    _modeNameToId(name) {
        const modes = {
            'FDM': 1,
            'LASER': 2,
            'CAM': 3,
            'SLA': 4,
            'DRAG': 5,
            'WJET': 6,
            'WEDM': 7
        };
        return modes[name.toUpperCase()] || 1; // Default to FDM
    }
}

// Create singleton instance
const colorSchemeRegistry = new ColorSchemeRegistry();

export { colorSchemeRegistry, ColorSchemeRegistry };
