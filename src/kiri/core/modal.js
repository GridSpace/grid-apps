/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Modal Manager (Singleton)
 * Manages modal dialog display and animations
 */

class ModalControl {
    #ui;
    #onShow;
    #onHide;
    #initialized = false;

    /**
     * Initialize the modal controller with dependencies
     * @param {Object} config
     * @param {Object} config.ui - UI element references
     * @param {HTMLElement} config.ui.modal - Modal container element
     * @param {Object} config.ui.modals - Object containing all modal elements by name
     * @param {Function} config.onShow - Optional callback when modal is shown
     * @param {Function} config.onHide - Optional callback when modal is hidden
     */
    init({ ui, onShow, onHide }) {
        if (this.#initialized) {
            throw new Error('Modal already initialized');
        }

        this.#ui = ui;
        this.#onShow = onShow;
        this.#onHide = onHide;
        this.#initialized = true;
    }

    /**
     * Check if modal is currently visible
     * @returns {boolean}
     */
    visible() {
        return this.#ui.modal.style.display === 'flex';
    }

    /**
     * Show a specific modal with animation
     * @param {string} which - Name of the modal to show
     */
    show(which) {
        let mod = this.#ui.modal,
            style = mod.style,
            visible = this.visible(),
            info = { pct: 0 };

        // hide all modals before showing another
        Object.keys(this.#ui.modals).forEach(name => {
            this.#ui.modals[name].style.display = name === which ? 'flex' : '';
        });

        const ondone = () => {
            this.#onShow?.(which);
        };

        if (visible) {
            return ondone();
        }

        style.height = '0';
        style.display = 'flex';

        new TWEEN.Tween(info).
            easing(TWEEN.Easing.Quadratic.InOut).
            to({ pct: 100 }, 100).
            onUpdate(() => { style.height = `${info.pct}%` }).
            onComplete(ondone).
            start();
    }

    /**
     * Hide the modal with animation
     */
    hide() {
        if (!this.visible()) {
            return;
        }
        let mod = this.#ui.modal,
            style = mod.style,
            info = { pct: 100 };

        new TWEEN.Tween(info).
            easing(TWEEN.Easing.Quadratic.InOut).
            to({ pct: 0 }, 100).
            onUpdate(() => { style.height = `${info.pct}%` }).
            onComplete(() => {
                style.display = '';
                this.#onHide?.();
            }).
            start();
    }
}

// Export singleton instance
export const modal = new ModalControl();
