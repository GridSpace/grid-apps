/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * VisualStateManager: Manages 3-layer visual state hierarchy for widgets
 *
 * Layer hierarchy (bottom to top):
 * 1. Base Layer: User persistent preferences (edges, wireframe, opacity)
 * 2. Mode Layer: Mode+view specific defaults (FDM/ARRANGE vs CAM/PREVIEW)
 * 3. Operation Layer: Temporary context overrides (paint, selection)
 *
 * Context types:
 * - 'paint': OVERRIDE context (FDM support painting, completely replaces material)
 * - 'select': TEMPORARY context (selection highlighting)
 * - null: Normal state changes following hierarchy
 */
class VisualStateManager {
    constructor(widget, scheme, api) {
        this.widget = widget;
        this.scheme = scheme;
        this.api = api;

        // State stack (base → mode → operation)
        this.stack = [];

        // Active operation states
        this.operations = {}; // { context: state }
    }

    /**
     * Load user preferences from localStorage (base layer)
     */
    loadPreferences() {
        const edges = this.api.local.getBoolean('model.edges');
        const wireframe = this.api.local.getBoolean('model.wireframe');
        const wireframeColor = this.api.local.getInt('model.wireframe.color') || 0;
        const wireframeOpacity = this.api.local.getFloat('model.wireframe.opacity');

        this.baseState = {
            edges: edges || false,
            wireframe: wireframe || false,
            wireframeColor: wireframeColor,
            wireframeOpacity: wireframeOpacity !== null ? wireframeOpacity : this.scheme.wireframe.opacity,
            opacity: 1.0
        };

        return this.baseState;
    }

    /**
     * Save user preferences to localStorage
     */
    savePreferences() {
        if (!this.baseState) return;

        this.api.local.set('model.edges', this.baseState.edges);
        this.api.local.set('model.wireframe', this.baseState.wireframe);
        if (this.baseState.wireframeColor !== undefined) {
            this.api.local.set('model.wireframe.color', this.baseState.wireframeColor);
        }
        if (this.baseState.wireframeOpacity !== undefined) {
            this.api.local.set('model.wireframe.opacity', this.baseState.wireframeOpacity);
        }
    }

    /**
     * Apply mode-specific defaults (mode layer)
     * @param {number} mode - Mode ID
     * @param {number} viewMode - View mode ID (ARRANGE=1, SLICE=2, PREVIEW=3, ANIMATE=4)
     */
    applyModeState(mode, viewMode) {
        const viewName = this._viewModeToName(viewMode);
        const viewScheme = this.scheme.views[viewName];

        this.modeState = {
            mode,
            viewMode,
            opacity: viewScheme?.model_opacity ?? 1.0,
            previewOpacity: viewScheme?.preview_opacity,
            slicingOpacity: viewScheme?.slicing_opacity,
            slicedOpacity: viewScheme?.sliced_opacity
        };

        return this.modeState;
    }

    /**
     * Push a temporary operation state (operation layer)
     * @param {string} context - Operation context ('paint', 'select', etc)
     * @param {object} state - State to push
     * @param {function} state.restoreCallback - Optional callback to restore state on pop
     */
    pushState(context, state) {
        if (!context) {
            console.warn('pushState called without context');
            return;
        }

        this.operations[context] = state;
        this.stack.push({ layer: 'operation', context, state });

        return state;
    }

    /**
     * Pop a temporary operation state
     * @param {string} context - Operation context to pop
     */
    popState(context) {
        if (!context) {
            console.warn('popState called without context');
            return;
        }

        const operation = this.operations[context];
        if (!operation) {
            console.warn(`No operation found for context: ${context}`);
            return;
        }

        // Call restore callback if provided
        if (operation.restoreCallback) {
            operation.restoreCallback();
        }

        // Remove from operations and stack
        delete this.operations[context];
        this.stack = this.stack.filter(s => s.context !== context);
    }

    /**
     * Get the current effective state (topmost in hierarchy)
     */
    getCurrentState() {
        if (this.stack.length > 0) {
            return this.stack[this.stack.length - 1].state;
        }
        if (this.modeState) {
            return this.modeState;
        }
        return this.baseState;
    }

    /**
     * Check if an operation context is currently active
     * @param {string} context - Operation context to check
     * @returns {boolean}
     */
    isOperationActive(context) {
        return context in this.operations;
    }

    /**
     * Get all active operation contexts
     * @returns {Array<string>}
     */
    getActiveContexts() {
        return Object.keys(this.operations);
    }

    /**
     * Clear all operation states (e.g., on mode switch)
     */
    clearOperations() {
        // Call restore callbacks for all active operations
        for (const context in this.operations) {
            const operation = this.operations[context];
            if (operation.restoreCallback) {
                operation.restoreCallback();
            }
        }

        this.operations = {};
        this.stack = this.stack.filter(s => s.layer !== 'operation');
    }

    /**
     * Get visual state snapshot for undo/redo
     */
    getVisualState() {
        return {
            edges: this.widget.outline ? true : false,
            wires: this.widget.wire ? true : false,
            opacity: this.widget.getMaterial()?.opacity ?? 1.0
        };
    }

    /**
     * Restore visual state from snapshot
     * @param {object} state - State snapshot
     */
    setVisualState({ edges, wires, opacity }) {
        this.widget.cache.vizstate = this.getVisualState();
        this.widget.setEdges(edges ?? false);
        this.widget.setWireframe(wires ?? false);
        if (opacity !== undefined) {
            this.widget.setOpacity(opacity);
        }
    }

    /**
     * Convert view mode ID to name
     * @private
     */
    _viewModeToName(viewMode) {
        const views = {
            1: 'ARRANGE',
            2: 'SLICE',
            3: 'PREVIEW',
            4: 'ANIMATE'
        };
        return views[viewMode] || 'ARRANGE';
    }
}

export { VisualStateManager };
