/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { ensureKernel } from '../solid/kernel.js';
import { rebuildGeneratedSolids } from '../solid/rebuild.js';

function createSolidsApi(getApi) {
    return {
        _rebuildTimer: null,
        _rebuilding: false,
        _pendingReason: null,

        async init() {
            await ensureKernel();
        },

        list() {
            const api = getApi();
            return Array.isArray(api.document.current?.generated?.solids)
                ? api.document.current.generated.solids
                : [];
        },

        scheduleRebuild(reason = 'schedule', delay = 25) {
            this._pendingReason = reason;
            clearTimeout(this._rebuildTimer);
            this._rebuildTimer = setTimeout(() => {
                this.rebuild(this._pendingReason || 'schedule');
                this._pendingReason = null;
            }, delay);
        },

        async rebuild(reason = 'manual') {
            const api = getApi();
            if (this._rebuilding) {
                this._pendingReason = reason;
                return this.list();
            }
            this._rebuilding = true;
            try {
                return await rebuildGeneratedSolids(api, { reason });
            } finally {
                this._rebuilding = false;
                if (this._pendingReason) {
                    const next = this._pendingReason;
                    this._pendingReason = null;
                    this.scheduleRebuild(next, 10);
                }
            }
        }
    };
}

export { createSolidsApi };

