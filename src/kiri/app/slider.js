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
    #slider;
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
        this.#slider = ui.slider;
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
     * @param {boolean} notify - Whether to trigger callbacks (default: true)
     */
    setRange(lo, hi, notify = true) {
        this.#layerLo = Math.max(0, Math.min(hi, lo));
        this.#layerHi = Math.max(this.#layerLo, Math.min(this.#layerMax, hi));
        this.#updateVisuals();
        this.showLabels();
        if (notify) {
            this.#notifyChange();
        }
    }

    /**
     * Set maximum layer count
     * @param {number} max - Maximum layer value
     */
    setMax(max) {
        this.#layerMax = max;
        this.#slider.max.innerText = max;
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
        const width = this.#slider.range.clientWidth;
        const maxval = width - this.#sliderBar2;
        const start = Math.max(0, Math.min(1, startPercent));
        const end = Math.max(start, Math.min(1, endPercent));

        const lowval = start * maxval;
        const midval = ((end - start) * maxval) + this.#sliderBar;
        const hival = maxval - end * maxval;

        this.#slider.hold.style.marginLeft = `${lowval}px`;
        this.#slider.mid.style.width = `${midval}px`;
        this.#slider.hold.style.marginRight = `${hival}px`;
    }

    /**
     * Show layer number labels
     */
    showLabels() {
        const digits = this.#layerMax.toString().length;
        this.#slider.min.style.width = `${digits}em`;
        this.#slider.max.style.width = `${digits}em`;
        this.#slider.min.innerText = this.#layerLo;
        this.#slider.max.innerText = this.#layerHi;
    }

    /**
     * Show slider UI
     */
    show() {
        this.#ui.layers.style.display = 'flex';
        this.#slider.div.style.display = 'flex';
    }

    /**
     * Hide slider UI
     */
    hide() {
        this.#ui.layers.style.display = 'none';
        this.#slider.div.style.display = 'none';
    }

    #setupUI() {
        if (this.#mobile) {
            this.#slider.div.classList.add('slider-mobile');
            this.#slider.lo.classList.add('slider-mobile');
            this.#slider.hi.classList.add('slider-mobile');
        }
    }

    #bindEvents() {
        // Min/Max buttons
        this.#slider.min.onclick = () => {
            this.#layerLo = 0;
            this.#layerHi = 0;
            this.showLabels();
            this.#updateVisuals();
            this.#notifyChange();
        };

        this.#slider.max.onclick = () => {
            this.#layerLo = this.#layerMax;
            this.#layerHi = this.#layerMax;
            this.showLabels();
            this.#updateVisuals();
            this.#notifyChange();
        };

        // Mouse hover for labels
        this.#slider.div.onmouseover = () => {
            this.showLabels();
        };

        this.#slider.div.onmouseleave = (ev) => {
            if (!ev.buttons) {
                this.hideLabels();
            }
        };

        // Drag handlers for the three slider sections
        this.#bindDrag(this.#slider.lo, this.#handleLoDrag.bind(this));
        this.#bindDrag(this.#slider.mid, this.#handleMidDrag.bind(this));
        this.#bindDrag(this.#slider.hi, this.#handleHiDrag.bind(this));
    }

    #bindDrag(el, deltaHandler) {
        const slider = this.#slider.range;

        el.ontouchstart = el.onmousedown = (ev) => {
            this.#tracker.style.display = 'block';
            ev.stopPropagation();

            let obj = (ev.touches ? ev.touches[0] : ev);
            this.#drag.width = slider.clientWidth;
            this.#drag.maxval = this.#drag.width - this.#sliderBar2;
            this.#drag.start = obj.screenX;
            this.#drag.loat = this.#drag.low = this.#pxToInt(this.#slider.hold.style.marginLeft);
            this.#drag.mdat = this.#drag.mid = this.#slider.mid.clientWidth;
            this.#drag.hiat = this.#pxToInt(this.#slider.hold.style.marginRight);
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

        this.#slider.hold.style.marginLeft = `${lowval}px`;
        this.#slider.mid.style.width = `${midval}px`;
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

        this.#slider.hold.style.marginLeft = `${loval}px`;
        this.#slider.hold.style.marginRight = `${hival}px`;
        this.#drag.low = loval;
        this.#updateFromDrag();
    }

    #handleHiDrag(delta) {
        let midval = this.#drag.mdat + delta;
        let hival = this.#drag.hiat - delta;

        if (midval < this.#sliderBar || midval > this.#drag.mdmax || hival < 0) {
            return;
        }

        this.#slider.mid.style.width = `${midval}px`;
        this.#slider.hold.style.marginRight = `${hival}px`;
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
