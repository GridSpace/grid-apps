/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { THREE } from '../ext/three.js';
import { TrackballControls } from '../ext/three.js';

const { MOUSE, Vector3 } = THREE;
const BUTTON = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
const ACTION = { ROTATE: 0, DOLLY: 1, PAN: 2 };
const VOID_ROTATE_SPEED = 36.0;
const VOID_PAN_SPEED_PERSPECTIVE = 1.0;
const VOID_PAN_SPEED_ORTHO = 2.4;
const VOID_ZOOM_SPEED_PERSPECTIVE_MULT = 1.35;
const VOID_ZOOM_SPEED_ORTHO_MULT = 2.2;

class Trackball {
    constructor(object, domElement, notify, slider) {
        this.object = object;
        this.domElement = domElement !== undefined ? domElement : document;

        this.control = new TrackballControls(object, this.domElement);
        this.control.staticMoving = true;
        this.control.dynamicDampingFactor = 0;
        this.control.rotateSpeed = VOID_ROTATE_SPEED;
        this.control.zoomSpeed = 2.0;
        this.control.panSpeed = VOID_PAN_SPEED_PERSPECTIVE;

        this.target = this.control.target;
        this.center = this.target;

        this.mouseDefault = {
            ORBIT: MOUSE.LEFT,
            ZOOM: MOUSE.MIDDLE,
            PAN: MOUSE.RIGHT
        };
        this.mouseOnshape = {
            ORBIT: MOUSE.RIGHT,
            ZOOM: MOUSE.LEFT,
            PAN: MOUSE.MIDDLE
        };
        this.mouseVoid = {
            ORBIT: MOUSE.RIGHT,
            PAN: MOUSE.MIDDLE
        };
        this.mouseButtons = this.mouseDefault;

        this.orbitPivotOnRight = false;
        this.continuousRotate = true;
        this.reverseZoom = false;
        this.zoomSpeed = 1.0;
        this.noKeys = false;

        this.isTrackballAdapter = true;

        const mapButtons = () => {
            const actions = {
                LEFT: -1,
                MIDDLE: -1,
                RIGHT: -1
            };
            const bind = this.mouseButtons || this.mouseDefault;
            const buttonToAction = Object.create(null);
            if (bind.ORBIT !== undefined) buttonToAction[bind.ORBIT] = ACTION.ROTATE;
            if (bind.ZOOM !== undefined) buttonToAction[bind.ZOOM] = ACTION.DOLLY;
            if (bind.PAN !== undefined) buttonToAction[bind.PAN] = ACTION.PAN;
            actions.LEFT = buttonToAction[BUTTON.LEFT] ?? actions.LEFT;
            actions.MIDDLE = buttonToAction[BUTTON.MIDDLE] ?? actions.MIDDLE;
            actions.RIGHT = buttonToAction[BUTTON.RIGHT] ?? actions.RIGHT;
            this.control.mouseButtons = actions;
        };

        mapButtons();

        const emitNotify = (moved) => {
            if (notify) notify(this.object.position, moved);
        };

        this.control.addEventListener('change', () => emitNotify(true));

        this._animating = false;
        this._raf = null;
        this._tick = () => {
            if (!this._animating) return;
            if (this.control.enabled) {
                this.control.update();
            }
            this._raf = self.requestAnimationFrame(this._tick);
        };
        this._startTick = () => {
            if (this._animating) return;
            this._animating = true;
            this._tick();
        };
        this._stopTick = () => {
            this._animating = false;
            if (this._raf) {
                self.cancelAnimationFrame(this._raf);
                this._raf = null;
            }
        };

        this._onPointerDown = (event) => {
            const b = event?.button;
            if (b === BUTTON.LEFT || b === BUTTON.MIDDLE || b === BUTTON.RIGHT) {
                this._startTick();
            }
        };
        this._onPointerUp = () => this._stopTick();
        this._onPointerCancel = () => this._stopTick();
        this._onWheel = () => {
            if (!this.control.enabled) return;
            // Run after Trackball's wheel handler mutates zoom deltas.
            self.requestAnimationFrame(() => {
                if (this.control.enabled) {
                    this.control.update();
                }
            });
        };
        if (this.domElement?.addEventListener) {
            this.domElement.addEventListener('pointerdown', this._onPointerDown, true);
            this.domElement.addEventListener('wheel', this._onWheel, false);
        }
        if (this.domElement?.ownerDocument?.addEventListener) {
            this.domElement.ownerDocument.addEventListener('pointerup', this._onPointerUp, true);
            this.domElement.ownerDocument.addEventListener('pointercancel', this._onPointerCancel, true);
        }

        Object.defineProperty(this, 'enabled', {
            get: () => this.control.enabled,
            set: (v) => { this.control.enabled = !!v; }
        });
        Object.defineProperty(this, 'minDistance', {
            get: () => this.control.minDistance,
            set: (v) => { this.control.minDistance = v; }
        });
        Object.defineProperty(this, 'maxDistance', {
            get: () => this.control.maxDistance,
            set: (v) => { this.control.maxDistance = v; }
        });
    }

    setMouse(bindings) {
        this.mouseButtons = bindings || this.mouseDefault;
        const bind = this.mouseButtons || this.mouseDefault;
        const actions = {
            LEFT: -1,
            MIDDLE: -1,
            RIGHT: -1
        };
        const buttonToAction = Object.create(null);
        if (bind.ORBIT !== undefined) buttonToAction[bind.ORBIT] = ACTION.ROTATE;
        if (bind.ZOOM !== undefined) buttonToAction[bind.ZOOM] = ACTION.DOLLY;
        if (bind.PAN !== undefined) buttonToAction[bind.PAN] = ACTION.PAN;
        actions.LEFT = buttonToAction[BUTTON.LEFT] ?? actions.LEFT;
        actions.MIDDLE = buttonToAction[BUTTON.MIDDLE] ?? actions.MIDDLE;
        actions.RIGHT = buttonToAction[BUTTON.RIGHT] ?? actions.RIGHT;
        this.control.mouseButtons = actions;
    }

    setOrbitPivotOnRight(enabled) {
        this.orbitPivotOnRight = !!enabled;
    }

    setContinuousRotate(enabled) {
        this.continuousRotate = !!enabled;
    }

    setZoom(reverse, speed) {
        this.reverseZoom = !!reverse;
        this.zoomSpeed = speed || 1.0;
        const mult = this.object.isOrthographicCamera
            ? VOID_ZOOM_SPEED_ORTHO_MULT
            : VOID_ZOOM_SPEED_PERSPECTIVE_MULT;
        this.control.zoomSpeed = this.zoomSpeed * mult;
    }

    getTarget() {
        return this.control.target;
    }

    setTarget(t) {
        this.control.target.copy(t);
    }

    setPosition(set) {
        const t = this.control.target;
        if (set.panX !== undefined) t.x = set.panX;
        if (set.panY !== undefined) t.y = set.panY;
        if (set.panZ !== undefined) t.z = set.panZ;

        let off = this.object.position.clone().sub(t);
        let radius = off.length();
        if (!isFinite(radius) || radius <= 0) radius = 1;

        const left = set.left !== undefined ? set.left : Math.atan2(off.x, off.z);
        const up = set.up !== undefined ? set.up : Math.atan2(Math.sqrt(off.x * off.x + off.z * off.z), off.y);

        off = new Vector3(
            radius * Math.sin(up) * Math.sin(left),
            radius * Math.cos(up),
            radius * Math.sin(up) * Math.cos(left)
        );

        this.object.position.copy(t).add(off);
        this.object.lookAt(t);

        if (set.scale !== undefined && isFinite(set.scale) && set.scale > 0) {
            if (this.object.isPerspectiveCamera) {
                const eye = this.object.position.clone().sub(t).multiplyScalar(set.scale);
                this.object.position.copy(t).add(eye);
            } else if (this.object.isOrthographicCamera) {
                this.object.zoom = this.object.zoom / set.scale;
                this.object.updateProjectionMatrix();
            }
        }
    }

    getPosition(scaled) {
        const t = this.control.target;
        const off = this.object.position.clone().sub(t);
        const left = Math.atan2(off.x, off.z);
        const up = Math.atan2(Math.sqrt(off.x * off.x + off.z * off.z), off.y);
        return {
            left,
            up,
            panX: t.x,
            panY: t.y,
            panZ: t.z,
            scale: scaled ? (this.object.isOrthographicCamera ? 1 / this.object.zoom : 1) : 1
        };
    }

    update() {
        this.control.panSpeed = this.object.isOrthographicCamera
            ? VOID_PAN_SPEED_ORTHO
            : VOID_PAN_SPEED_PERSPECTIVE;
        const zoomMult = this.object.isOrthographicCamera
            ? VOID_ZOOM_SPEED_ORTHO_MULT
            : VOID_ZOOM_SPEED_PERSPECTIVE_MULT;
        this.control.zoomSpeed = this.zoomSpeed * zoomMult;
        this.control.update();
    }

    addEventListener(type, listener) {
        this.control.addEventListener(type, listener);
    }

    removeEventListener(type, listener) {
        this.control.removeEventListener(type, listener);
    }

    dispatchEvent(event) {
        this.control.dispatchEvent(event);
    }

    reset() {
        this.control.reset();
    }

    onMouseUp() {
        // TrackballControls manages pointer lifecycle internally.
    }

    dispose() {
        this._stopTick();
        if (this.domElement?.removeEventListener) {
            this.domElement.removeEventListener('pointerdown', this._onPointerDown, true);
            this.domElement.removeEventListener('wheel', this._onWheel, false);
        }
        if (this.domElement?.ownerDocument?.removeEventListener) {
            this.domElement.ownerDocument.removeEventListener('pointerup', this._onPointerUp, true);
            this.domElement.ownerDocument.removeEventListener('pointercancel', this._onPointerCancel, true);
        }
        this.control.dispose();
    }
}

export { Trackball };
