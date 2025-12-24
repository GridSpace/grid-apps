/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Layer Slider Controller (Singleton)
 * Manages layer range selection and visualization for slice/preview views
 */

class SliderControl {
    #layerLo = 0;
    #layerHi = 0;
    #layerMax = 0;
    #ui;
    #tracker;
    #mobile;
    #sliderBar;
    #sliderBar2;
    #drag = {};

    // Callbacks to replace event emissions
    #onLayerChange;
    #onStackUpdate;
    #onSceneUpdate;

    #initialized = false;

    /**
     * Initialize the slider with configuration
     * @param {Object} config
     * @param {Object} config.ui - UI element references
     * @param {HTMLElement} config.tracker - Drag tracker element
     * @param {boolean} config.mobile - Mobile device flag
     * @param {Function} config.onLayerChange - Called when layer range changes
     * @param {Function} config.onStackUpdate - Called to update stack visibility
     * @param {Function} config.onSceneUpdate - Called to refresh scene
     */
    init({ ui, tracker, mobile, onLayerChange, onStackUpdate, onSceneUpdate }) {
        if (this.#initialized) {
            throw new Error('Slider already initialized');
        }

        this.#ui = ui;
        this.#tracker = tracker;
        this.#mobile = mobile;
        this.#sliderBar = mobile ? 80 : 30;
        this.#sliderBar2 = this.#sliderBar * 2;
        this.#onLayerChange = onLayerChange;
        this.#onStackUpdate = onStackUpdate;
        this.#onSceneUpdate = onSceneUpdate;

        this.#setupUI();
        this.#bindEvents();
        this.#initialized = true;
    }

    /**
     * Get current layer range
     * @returns {{lo: number, hi: number, max: number}}
     */
    getRange() {
        return {
            lo: this.#layerLo,
            hi: this.#layerHi,
            max: this.#layerMax
        };
    }

    /**
     * Set layer range (bounds are enforced)
     * @param {number} lo - Lower layer
     * @param {number} hi - Upper layer
     */
    setRange(lo, hi) {
        this.#layerLo = Math.max(0, Math.min(hi, lo));
        this.#layerHi = Math.max(this.#layerLo, Math.min(this.#layerMax, hi));
        this.#updateVisuals();
        this.showLabels();
        this.#notifyChange();
    }

    /**
     * Set maximum layer count
     * @param {number} max - Maximum layer value
     */
    setMax(max) {
        this.#layerMax = max;
        this.#ui.sliderMax.innerText = max;
        if (max < this.#layerHi) {
            this.#layerHi = max;
            this.showLabels();
            this.#updateVisuals();
        }
    }

    /**
     * Update slider visual position from normalized values
     * @param {number} startPercent - Start position (0-1)
     * @param {number} endPercent - End position (0-1)
     */
    updatePosition(startPercent, endPercent) {
        const width = this.#ui.sliderRange.clientWidth;
        const maxval = width - this.#sliderBar2;
        const start = Math.max(0, Math.min(1, startPercent));
        const end = Math.max(start, Math.min(1, endPercent));

        const lowval = start * maxval;
        const midval = ((end - start) * maxval) + this.#sliderBar;
        const hival = maxval - end * maxval;

        this.#ui.sliderHold.style.marginLeft = `${lowval}px`;
        this.#ui.sliderMid.style.width = `${midval}px`;
        this.#ui.sliderHold.style.marginRight = `${hival}px`;
    }

    /**
     * Show layer number labels
     */
    showLabels() {
        const digits = this.#layerMax.toString().length;
        this.#ui.sliderZero.style.width = `${digits}em`;
        this.#ui.sliderMax.style.width = `${digits}em`;
        this.#ui.sliderZero.innerText = this.#layerLo;
        this.#ui.sliderMax.innerText = this.#layerHi;
    }

    /**
     * Show slider UI
     */
    show() {
        this.#ui.layers.style.display = 'flex';
        this.#ui.slider.style.display = 'flex';
    }

    /**
     * Hide slider UI
     */
    hide() {
        this.#ui.layers.style.display = 'none';
        this.#ui.slider.style.display = 'none';
    }

    #setupUI() {
        if (this.#mobile) {
            this.#ui.slider.classList.add('slider-mobile');
            this.#ui.sliderLo.classList.add('slider-mobile');
            this.#ui.sliderHi.classList.add('slider-mobile');
        }
    }

    #bindEvents() {
        // Min/Max buttons
        this.#ui.sliderMin.onclick = () => {
            this.#layerLo = 0;
            this.#layerHi = 0;
            this.showLabels();
            this.#updateVisuals();
            this.#notifyChange();
        };

        this.#ui.sliderMax.onclick = () => {
            this.#layerLo = this.#layerMax;
            this.#layerHi = this.#layerMax;
            this.showLabels();
            this.#updateVisuals();
            this.#notifyChange();
        };

        // Mouse hover for labels
        this.#ui.slider.onmouseover = () => {
            this.showLabels();
        };

        this.#ui.slider.onmouseleave = (ev) => {
            if (!ev.buttons) {
                this.hideLabels();
            }
        };

        // Drag handlers for the three slider sections
        this.#bindDrag(this.#ui.sliderLo, this.#handleLoDrag.bind(this));
        this.#bindDrag(this.#ui.sliderMid, this.#handleMidDrag.bind(this));
        this.#bindDrag(this.#ui.sliderHi, this.#handleHiDrag.bind(this));
    }

    #bindDrag(el, deltaHandler) {
        const slider = this.#ui.sliderRange;

        el.ontouchstart = el.onmousedown = (ev) => {
            this.#tracker.style.display = 'block';
            ev.stopPropagation();

            let obj = (ev.touches ? ev.touches[0] : ev);
            this.#drag.width = slider.clientWidth;
            this.#drag.maxval = this.#drag.width - this.#sliderBar2;
            this.#drag.start = obj.screenX;
            this.#drag.loat = this.#drag.low = this.#pxToInt(this.#ui.sliderHold.style.marginLeft);
            this.#drag.mdat = this.#drag.mid = this.#ui.sliderMid.clientWidth;
            this.#drag.hiat = this.#pxToInt(this.#ui.sliderHold.style.marginRight);
            this.#drag.mdmax = this.#drag.width - this.#sliderBar - this.#drag.loat;
            this.#drag.himax = this.#drag.width - this.#sliderBar - this.#drag.mdat;

            const cancelDrag = this.#tracker.ontouchend = this.#tracker.onmouseup = (ev) => {
                if (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();
                }
                slider.onmousemove = undefined;
                this.#tracker.style.display = 'none';
            };

            el.ontouchend = cancelDrag;
            el.ontouchmove = this.#tracker.ontouchmove = this.#tracker.onmousemove = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                if (ev.buttons === 0) {
                    return cancelDrag();
                }
                if (deltaHandler) {
                    let obj = (ev.touches ? ev.touches[0] : ev);
                    deltaHandler(obj.screenX - this.#drag.start);
                }
            };
        };
    }

    #handleLoDrag(delta) {
        let midval = this.#drag.mdat - delta;
        let lowval = this.#drag.loat + delta;

        if (midval < this.#sliderBar || lowval < 0) {
            return;
        }

        this.#ui.sliderHold.style.marginLeft = `${lowval}px`;
        this.#ui.sliderMid.style.width = `${midval}px`;
        this.#drag.low = lowval;
        this.#drag.mid = midval;
        this.#updateFromDrag();
    }

    #handleMidDrag(delta) {
        let loval = this.#drag.loat + delta;
        let hival = this.#drag.hiat - delta;

        if (loval < 0 || hival < 0) {
            return;
        }

        this.#ui.sliderHold.style.marginLeft = `${loval}px`;
        this.#ui.sliderHold.style.marginRight = `${hival}px`;
        this.#drag.low = loval;
        this.#updateFromDrag();
    }

    #handleHiDrag(delta) {
        let midval = this.#drag.mdat + delta;
        let hival = this.#drag.hiat - delta;

        if (midval < this.#sliderBar || midval > this.#drag.mdmax || hival < 0) {
            return;
        }

        this.#ui.sliderMid.style.width = `${midval}px`;
        this.#ui.sliderHold.style.marginRight = `${hival}px`;
        this.#drag.mid = midval;
        this.#updateFromDrag();
    }

    #updateFromDrag() {
        const start = this.#drag.low / this.#drag.maxval;
        const end = (this.#drag.low + this.#drag.mid - this.#sliderBar) / this.#drag.maxval;

        this.#layerLo = Math.round(start * this.#layerMax);
        this.#layerHi = Math.round(end * this.#layerMax);

        this.#notifyChange();
    }

    #updateVisuals() {
        if (this.#layerMax === 0) return;
        const start = this.#layerLo / this.#layerMax;
        const end = this.#layerHi / this.#layerMax;
        this.updatePosition(start, end);
    }

    #notifyChange() {
        // Notify callbacks of layer change
        this.#onLayerChange?.(this.#layerHi, this.#layerLo);
        this.#onStackUpdate?.(this.#layerLo, this.#layerHi);
        this.#onSceneUpdate?.();
    }

    #pxToInt(txt) {
        return txt ? parseInt(txt.substring(0, txt.length - 2)) : 0;
    }

    hideLabels() {
        // Labels hide themselves on mouse leave, but can be called explicitly
    }
}

// Export singleton instance
export const slider = new SliderControl();
