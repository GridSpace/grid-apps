/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function createOriginApi(getApi) {
    return {
        state: { x: 0, y: 0, z: 0, show: true },
        changeHandlers: new Set(),

        defaultState() {
            return { x: 0, y: 0, z: 0, show: true };
        },

        toJSON() {
            const { x, y, z, show } = this.state;
            return { x, y, z, show };
        },

        applyJSON(data = {}, notify = true) {
            const next = {
                x: data.x ?? 0,
                y: data.y ?? 0,
                z: data.z ?? 0,
                show: data.show !== undefined ? !!data.show : true
            };
            this.state = next;
            this.syncOverlayPoint();
            if (notify) {
                this.notifyChange();
            }
            return this.state;
        },

        isVisible() {
            return !!this.state.show;
        },

        setVisible(visible) {
            const next = !!visible;
            if (this.state.show === next) {
                return this.state;
            }
            this.applyJSON({ ...this.state, show: next }, true);
            return this.state;
        },

        toggleVisible() {
            return this.setVisible(!this.isVisible());
        },

        onChange(handler) {
            if (typeof handler === 'function') {
                this.changeHandlers.add(handler);
            }
            return this;
        },

        offChange(handler) {
            this.changeHandlers.delete(handler);
            return this;
        },

        notifyChange() {
            for (const handler of this.changeHandlers) {
                handler(this.state);
            }
        },

        syncOverlayPoint() {
            const api = getApi();
            const item = api.overlay?.elements?.get('origin-point');
            if (item?.el) {
                item.opts = item.opts || {};
                item.opts.hidden = !this.state.show;
                item.el.style.display = this.state.show ? '' : 'none';
            }
        }
    };
}

export { createOriginApi };
