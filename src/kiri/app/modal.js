/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Modal Manager (Singleton)
 * Manages modal dialog display and animations
 */

class ModalControl {
    #ui;
    #onShow;
    #onHide;
    #showing;
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

        return this;
    }

    /**
     * Check if modal is currently visible
     * @returns {boolean}
     */
    visible() {
        return modal.#ui.modal.style.display === 'flex';
    }

    /**
     * Check if a specific modal is currently visible
     * @returns {boolean}
     */
    is(name) {
        return modal.#showing === name;
    }

    /**
     * Show a specific modal with animation
     * @param {string} which - Name of the modal to show
     */
    show(which) {
        let mod = modal.#ui.modal,
            style = mod.style,
            visible = modal.visible(),
            info = { pct: 0 };

        // if the dialog needs it, it will re-add it
        document.body.classList.remove('devel');

        // hide all modals before showing another
        Object.keys(modal.#ui.modals).forEach(name => {
            modal.#ui.modals[name].style.display = name === which ? 'flex' : '';
        });

        modal.#showing = which;

        const ondone = () => {
            modal.#onShow?.(which);
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
        if (!modal.visible()) {
            return;
        }

        modal.#showing = undefined;

        let mod = modal.#ui.modal,
            style = mod.style,
            info = { pct: 100 };

        new TWEEN.Tween(info).
            easing(TWEEN.Easing.Quadratic.InOut).
            to({ pct: 0 }, 100).
            onUpdate(() => { style.height = `${info.pct}%` }).
            onComplete(() => {
                style.display = '';
                modal.#onHide?.();
            }).
            start();
    }
}

// Export singleton instance
export const modal = new ModalControl();
