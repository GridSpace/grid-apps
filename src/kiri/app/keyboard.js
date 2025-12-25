/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Keyboard Controller (Singleton)
 * Manages keyboard event handling and shortcuts
 */

class KeyboardControl {
    #api;
    #platform;
    #selection;
    #slider;
    #space;
    #catalog;
    #sdb;
    #uc;
    #setCtrl;
    #VIEWS;
    #DOC;
    #WIN;
    #rotateInputSelection;
    #settingsLoad;
    #initialized = false;

    /**
     * Initialize the keyboard controller with dependencies
     * @param {Object} config
     * @param {Object} config.api - API object
     * @param {Object} config.platform - Platform object
     * @param {Object} config.selection - Selection object
     * @param {Object} config.slider - Slider controller
     * @param {Object} config.space - Space object
     * @param {Object} config.catalog - Catalog object
     * @param {Object} config.sdb - Local storage
     * @param {Object} config.uc - User confirmation utility
     * @param {Object} config.setCtrl - Settings controller
     * @param {Object} config.VIEWS - View constants
     * @param {Document} config.DOC - Document object
     * @param {Window} config.WIN - Window object
     * @param {Function} config.rotateInputSelection - Rotate input callback
     * @param {Function} config.settingsLoad - Settings load callback
     */
    init({ api, platform, selection, slider, space, catalog, sdb, uc, setCtrl, VIEWS, DOC, WIN, rotateInputSelection, settingsLoad }) {
        if (this.#initialized) {
            throw new Error('Keyboard already initialized');
        }

        this.#api = api;
        this.#platform = platform;
        this.#selection = selection;
        this.#slider = slider;
        this.#space = space;
        this.#catalog = catalog;
        this.#sdb = sdb;
        this.#uc = uc;
        this.#setCtrl = setCtrl;
        this.#VIEWS = VIEWS;
        this.#DOC = DOC;
        this.#WIN = WIN;
        this.#rotateInputSelection = rotateInputSelection;
        this.#settingsLoad = settingsLoad;

        this.#bindEvents();
        this.#initialized = true;

        return this;
    }

    /**
     * Check if an input element has focus
     * @returns {boolean}
     */
    inputHasFocus() {
        let active = this.#DOC.activeElement;
        return active && (active.nodeName === "INPUT" || active.nodeName === "TEXTAREA");
    }

    /**
     * Get character code at position 0
     * @param {string} c - Character
     * @returns {number}
     */
    #cca(c) {
        return c.charCodeAt(0);
    }

    #bindEvents() {
        this.#space.event.addHandlers(self, [
            'keyup', this.#handleKeyUp.bind(this),
            'keydown', this.#handleKeyDown.bind(this),
            'keypress', this.#handleKeyPress.bind(this)
        ]);
    }

    #handleKeyUp(evt) {
        // Allow feature hooks to intercept
        if (this.#api.feature.on_key) {
            if (this.#api.feature.on_key({up:evt})) return;
        }
        for (let handler of this.#api.feature.on_key2) {
            if (handler({up:evt})) return;
        }

        switch (evt.keyCode) {
            // escape
            case 27:
                // blur text input focus
                this.#DOC.activeElement.blur();
                // dismiss modals
                this.#api.modal.hide();
                // deselect widgets
                this.#platform.deselect();
                // hide all dialogs
                this.#api.dialog.hide();
                // cancel slicing
                this.#api.function.cancel();
                // trigger escape handlers (used by FDM mode for support editing)
                this.#onEscape();
                break;
        }
        return false;
    }

    #handleKeyDown(evt) {
        if (this.#api.modal.visible()) {
            return false;
        }

        // Allow feature hooks to intercept
        if (this.#api.feature.on_key) {
            if (this.#api.feature.on_key({down:evt})) return;
        }
        for (let handler of this.#api.feature.on_key2) {
            if (handler({down:evt})) return;
        }

        let move = evt.altKey ? 5 : 0,
            deg = move ? 0 : -Math.PI / (evt.shiftKey ? 36 : 2);

        switch (evt.keyCode) {
            case 8: // apple: delete/backspace
            case 46: // others: delete
                if (this.inputHasFocus()) return false;
                this.#platform.delete(this.#selection.meshes());
                evt.preventDefault();
                break;
            case 37: // left arrow
                if (this.inputHasFocus()) return false;
                if (deg) this.#selection.rotate(0, 0, -deg);
                if (move > 0) this.#selection.move(-move, 0, 0);
                evt.preventDefault();
                break;
            case 39: // right arrow
                if (this.inputHasFocus()) return false;
                if (deg) this.#selection.rotate(0, 0, deg);
                if (move > 0) this.#selection.move(move, 0, 0);
                evt.preventDefault();
                break;
            case 38: // up arrow
                if (this.inputHasFocus()) return false;
                if (evt.metaKey) {
                    const { hi } = this.#slider.getRange();
                    return this.#api.show.layer(hi + 1);
                }
                if (deg) this.#selection.rotate(deg, 0, 0);
                if (move > 0) this.#selection.move(0, move, 0);
                evt.preventDefault();
                break;
            case 40: // down arrow
                if (this.inputHasFocus()) return false;
                if (evt.metaKey) {
                    const { hi } = this.#slider.getRange();
                    return this.#api.show.layer(hi - 1);
                }
                if (deg) this.#selection.rotate(-deg, 0, 0);
                if (move > 0) this.#selection.move(0, -move, 0);
                evt.preventDefault();
                break;
            case 65: // 'a' for select all
                if (evt.metaKey || evt.ctrlKey) {
                    if (this.inputHasFocus()) return false;
                    evt.preventDefault();
                    this.#platform.deselect();
                    this.#platform.select_all();
                }
                break;
            case 83: // 's' for save workspace
                if (evt.ctrlKey) {
                    evt.preventDefault();
                    this.#api.conf.save();
                    console.log("settings saved");
                } else
                if (evt.metaKey) {
                    evt.preventDefault();
                    this.#api.space.save();
                    this.#setCtrl.sync.put();
                }
                break;
            case 76: // 'l' for restore workspace
                if (evt.metaKey) {
                    evt.preventDefault();
                    this.#api.space.restore();
                }
                break;
        }
    }

    #handleKeyPress(evt) {
        let handled = true;
        if (this.#api.modal.visible() || this.inputHasFocus()) {
            return false;
        }

        // Allow feature hooks to intercept
        if (this.#api.feature.on_key) {
            if (this.#api.feature.on_key({key:evt})) return;
        }
        for (let handler of this.#api.feature.on_key2) {
            if (handler({key:evt})) return;
        }

        // Handle Ctrl key combinations
        if (evt.ctrlKey) {
            switch (evt.key) {
                case 'g': return this.#api.group.merge();
                case 'u': return this.#api.group.split();
            }
        }

        switch (evt.charCode) {
            case this.#cca('`'): this.#api.show.slices(0); break;
            case this.#cca('0'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max);
                break;
            }
            case this.#cca('1'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max/10);
                break;
            }
            case this.#cca('2'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*2/10);
                break;
            }
            case this.#cca('3'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*3/10);
                break;
            }
            case this.#cca('4'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*4/10);
                break;
            }
            case this.#cca('5'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*5/10);
                break;
            }
            case this.#cca('6'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*6/10);
                break;
            }
            case this.#cca('7'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*7/10);
                break;
            }
            case this.#cca('8'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*8/10);
                break;
            }
            case this.#cca('9'): {
                const { max } = this.#slider.getRange();
                this.#api.show.slices(max*9/10);
                break;
            }
            case this.#cca('?'):
                this.#api.help.show();
                break;
            case this.#cca('Z'): // reset stored state
                this.#uc.confirm('clear all settings and preferences?').then(yes => {
                    if (yes) {
                        this.#sdb.clear();
                        this.#WIN.location.reload();
                    }
                });
                break;
            case this.#cca('C'): // refresh catalog
                this.#catalog.refresh();
                break;
            case this.#cca('i'): // file import
                this.#api.event.import();
                break;
            case this.#cca('S'): // slice
            case this.#cca('s'): // slice
                this.#api.function.slice();
                break;
            case this.#cca('P'): // prepare
            case this.#cca('p'): // prepare
                if (this.#api.mode.get() !== 'SLA') {
                    // hidden in SLA mode
                    this.#api.function.prepare();
                }
                break;
            case this.#cca('X'): // export
            case this.#cca('x'): // export
                this.#api.function.export();
                break;
            case this.#cca('g'): // CAM animate
                this.#api.function.animate();
                break;
            case this.#cca('O'): // manual rotation
                this.#rotateInputSelection();
                break;
            case this.#cca('r'): // recent files
                this.#api.modal.show('files');
                break;
            case this.#cca('q'): // preferences
                this.#api.modal.show('prefs');
                break;
            case this.#cca('l'): // device
                this.#settingsLoad();
                break;
            case this.#cca('e'): // device
                this.#api.show.devices();
                break;
            case this.#cca('o'): // tools
                this.#api.show.tools();
                break;
            case this.#cca('c'): // local devices
                this.#api.show.local();
                break;
            case this.#cca('v'): // toggle single slice view mode
                if (this.#api.view.get() === this.#VIEWS.ARRANGE) {
                    this.#api.space.set_focus(this.#selection.widgets());
                }
                const { lo, hi } = this.#slider.getRange();
                if (hi === lo) {
                    this.#slider.setRange(0, hi);
                } else {
                    this.#slider.setRange(hi, hi);
                }
                this.#api.show.slices();
                break;
            case this.#cca('d'): // duplicate object
                this.#selection.duplicate();
                break;
            case this.#cca('m'): // mirror object
                this.#selection.mirror();
                break;
            case this.#cca('a'):
                if (this.#api.view.get() === this.#VIEWS.ARRANGE) {
                    // auto arrange items on platform
                    this.#platform.layout();
                    if (!this.#api.conf.get().controller.spaceRandoX) {
                        this.#api.space.set_focus(this.#selection.widgets());
                    }
                } else {
                    // go to arrange view
                    this.#api.view.set(this.#VIEWS.ARRANGE);
                }
                break;
            default:
                this.#onUnhandledKey(evt);
                handled = false;
                break;
        }
        if (handled) {
            evt.preventDefault();
            evt.stopPropagation();
        }
        return false;
    }

    /**
     * Called when escape key is pressed
     * Replaces api.event.emit('key.esc')
     */
    #onEscape() {
        // Notify listeners (currently used by FDM mode for support editing)
        this.#api.event.emit("key.esc");
    }

    /**
     * Called when an unhandled key is pressed
     * Replaces api.event.emit('keypress', evt)
     */
    #onUnhandledKey(evt) {
        // Notify listeners for custom key handling
        this.#api.event.emit('keypress', evt);
    }
}

// Export singleton instance
export const keyboard = new KeyboardControl();
