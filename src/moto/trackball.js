/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { THREE } from '../ext/three.js';
import { TrackballControls } from '../ext/three.js';

const { MOUSE, Vector3 } = THREE;
const BUTTON = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
const ACTION = { ROTATE: 0, DOLLY: 1, PAN: 2 };
const EPS = 1e-6;
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
        this._keysDisabled = false;

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
        this._emitNotify = emitNotify;
        this._lastPosition = this.object.position.clone();
        this._lastQuaternion = this.object.quaternion.clone();
        this._lastZoom = this.object.zoom !== undefined ? this.object.zoom : 1;

        // Keep Space idle-halo semantics identical to Orbit: any control change
        // is treated as active camera motion.
        this.control.addEventListener('change', () => {
            this._emitNotify?.(true);
        });

        // Mirror Orbit semantics: always signal notify from update(), with moved=true/false.
        // Patch underlying control.update() so internal handlers also flow through this path.
        const rawUpdate = this.control.update.bind(this.control);
        this.control.update = (...args) => {
            rawUpdate(...args);
            const moved =
                this._lastPosition.distanceToSquared(this.object.position) > EPS
                || 8 * (1 - this._lastQuaternion.dot(this.object.quaternion)) > EPS
                || Math.abs((this.object.zoom || 1) - this._lastZoom) > EPS;
            this._emitNotify?.(moved);
            if (moved) {
                this._lastPosition.copy(this.object.position);
                this._lastQuaternion.copy(this.object.quaternion);
                this._lastZoom = this.object.zoom !== undefined ? this.object.zoom : 1;
            }
        };

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
        Object.defineProperty(this, 'noKeys', {
            get: () => !!this._keysDisabled,
            set: (v) => {
                const next = !!v;
                if (next === this._keysDisabled) return;
                this._keysDisabled = next;
                if (typeof window !== 'undefined') {
                    if (next) {
                        window.removeEventListener('keydown', this.control._onKeyDown);
                        window.removeEventListener('keyup', this.control._onKeyUp);
                    } else {
                        window.addEventListener('keydown', this.control._onKeyDown);
                        window.addEventListener('keyup', this.control._onKeyUp);
                    }
                }
            }
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

        const hasCamPos = Number.isFinite(set?.camX) && Number.isFinite(set?.camY) && Number.isFinite(set?.camZ);
        if (hasCamPos) {
            this.object.position.set(set.camX, set.camY, set.camZ);
            if (Number.isFinite(set?.upX) && Number.isFinite(set?.upY) && Number.isFinite(set?.upZ)) {
                const up = new Vector3(set.upX, set.upY, set.upZ);
                if (up.lengthSq() > 1e-12) this.object.up.copy(up.normalize());
            }
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
            return;
        }

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

        // Avoid singular lookAt matrices at poles by ensuring camera.up is not parallel to view direction.
        const viewDir = off.clone().normalize();
        let upVec = null;
        if (Number.isFinite(set?.upX) && Number.isFinite(set?.upY) && Number.isFinite(set?.upZ)) {
            upVec = new Vector3(set.upX, set.upY, set.upZ);
        } else {
            upVec = this.object.up.clone();
        }
        if (upVec.lengthSq() < 1e-12) upVec.set(0, 1, 0);
        upVec.projectOnPlane(viewDir);
        if (upVec.lengthSq() < 1e-8) upVec = new Vector3(0, 0, 1).projectOnPlane(viewDir);
        if (upVec.lengthSq() < 1e-8) upVec = new Vector3(1, 0, 0).projectOnPlane(viewDir);
        if (upVec.lengthSq() > 1e-12) this.object.up.copy(upVec.normalize());

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
            camX: this.object.position.x,
            camY: this.object.position.y,
            camZ: this.object.position.z,
            upX: this.object.up.x,
            upY: this.object.up.y,
            upZ: this.object.up.z,
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

    resetInputState() {
        // Clear any latched key/mouse state (e.g. if native prompt swallowed keyup/mouseup)
        // and ensure key listeners are restored according to noKeys policy.
        this.control.state = -1;
        this.control.keyState = -1;
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.control._onKeyDown);
            window.removeEventListener('keyup', this.control._onKeyUp);
            if (!this._keysDisabled) {
                window.addEventListener('keydown', this.control._onKeyDown);
                window.addEventListener('keyup', this.control._onKeyUp);
            }
        }
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
