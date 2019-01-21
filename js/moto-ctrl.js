/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_moto_ctrl = exports;

/**
 * Adapted from OrbitControls
 */

THREE.CubeControls = function (object, domElement, notify, slider) {

    this.object = object;
    this.domElement = ( domElement !== undefined ) ? domElement : document;

    // Set to false to disable this control
    this.enabled = true;

    // "target" sets the location of focus, where the control orbits around
    // and where it pans with respect to.
    this.target = new THREE.Vector3();

    // center is old, deprecated; use "target" instead
    this.center = this.target;

    // This option actually enables dollying in and out; left as "zoom" for
    // backwards compatibility
    this.noZoom = false;
    this.zoomSpeed = 1.0;
    this.reverseZoom = false;

    // Limits to how far you can dolly in and out
    this.minDistance = 0;
    this.maxDistance = Infinity;

    // Set to true to disable this control
    this.noRotate = false;
    this.rotateSpeed = 1.0;

    // Set to true to disable this control
    this.noPan = false;
    this.keyPanSpeed = 7.0;    // pixels moved per arrow key push

    // How far you can orbit vertically, upper and lower limits.
    // Range is 0 to Math.PI radians.
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Math.PI; // radians

    // How far you can orbit horizontally, upper and lower limits.
    // If set, must be a sub-interval of the interval [ - Math.PI, Math.PI ].
    this.minAzimuthAngle = -Infinity; // radians
    this.maxAzimuthAngle = Infinity; // radians

    // Set to true to disable use of the keys
    this.noKeys = false;

    // The four arrow keys
    this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

    // Mouse buttons
    this.mouseButtons = { ORBIT: THREE.MOUSE.LEFT, ZOOM: THREE.MOUSE.MIDDLE, PAN: THREE.MOUSE.RIGHT };

    var scope = this,
        domEl = scope.domElement,
        EPS = 0.000001,
        rotateStart = new THREE.Vector2(),
        rotateEnd = new THREE.Vector2(),
        rotateDelta = new THREE.Vector2(),
        panStart = new THREE.Vector2(),
        panEnd = new THREE.Vector2(),
        panDelta = new THREE.Vector2(),
        panOffset = new THREE.Vector3(),
        offset = new THREE.Vector3(),
        dollyStart = new THREE.Vector2(),
        dollyEnd = new THREE.Vector2(),
        dollyDelta = new THREE.Vector2(),
        theta,
        thetaDelta = 0,
        thetaSet = null,
        phi,
        phiDelta = 0,
        phiSet = null,
        scale = 1,
        scaleSave = 1,
        pan = new THREE.Vector3(),
        lastPosition = new THREE.Vector3(),
        lastQuaternion = new THREE.Quaternion(),
        // so camera.up is the orbit axis
        quat = new THREE.Quaternion().setFromUnitVectors(object.up, new THREE.Vector3(0, 1, 0)),
        quatInverse = quat.clone().inverse(),
        // events
        changeEvent = { type: 'change'},
        startEvent = { type: 'start'},
        endEvent = { type: 'end'};

    var STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_DOLLY: 4, TOUCH_PAN: 5},
        state = STATE.NONE,
        MODE = { PERSPECTIVE: 1, ORTHOGRAPHIC: 2, UNKNOWN: 3},
        mode = isValue(object.fov) ? MODE.PERSPECTIVE : isValue(object.top) ? MODE.ORTHOGRAPHIC : MODE.UNKNOWN;

    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();

    this.rotateLeft = function (angle) {
        thetaDelta -= angle;
    };

    this.rotateUp = function (angle) {
        phiDelta -= angle;
    };

    // pass in distance in world space to move left
    this.panLeft = function (distance) {
        var te = this.object.matrix.elements;

        // get X column of matrix
        panOffset.set(te[ 0 ], te[ 1 ], te[ 2 ]);
        panOffset.multiplyScalar(-distance);
        pan.add(panOffset);
    };

    // pass in distance in world space to move up
    this.panUp = function (distance) {
        var te = this.object.matrix.elements;

        // get Y column of matrix
        panOffset.set(te[ 4 ], te[ 5 ], te[ 6 ]);
        panOffset.multiplyScalar(distance);
        pan.add(panOffset);
    };

    // pass in x,y of change desired in pixel space,
    // right and down are positive
    this.pan = function (deltaX, deltaY) {
        var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

        switch (mode) {
            case MODE.PERSPECTIVE:
                var position = scope.object.position;
                var offset = position.clone().sub(scope.target);
                var targetDistance = offset.length();

                // half of the fov is center to top of screen
                targetDistance *= Math.tan(( scope.object.fov / 2 ) * Math.PI / 180.0);

                // we actually don't use screenWidth, since perspective camera is fixed to screen height
                scope.panLeft(2 * deltaX * targetDistance / element.clientHeight);
                scope.panUp(2 * deltaY * targetDistance / element.clientHeight);
                break;
            case MODE.ORTHOGRAPHIC:
                scope.panLeft(deltaX * (scope.object.right - scope.object.left) / element.clientWidth);
                scope.panUp(deltaY * (scope.object.top - scope.object.bottom) / element.clientHeight);
                break;
        }
    };

    function isValue(v) {
        return v !== null && v !== undefined;
    }

    function firstValue(choices) {
        for (var i=0; i<choices.length; i++) {
            var v = choices[i];
            if (isValue(v)) return v;
        }
        return null;
    }

    this.setZoom = function(reverse, speed) {
        scope.reverseZoom = reverse;
        scope.zoomSpeed = speed || 1.0;
    };

    this.setPosition = function(set) {
        thetaSet = firstValue([set.left, set.theta, thetaSet]);
        phiSet = firstValue([set.up, set.phi, phiSet]);
        if (set.panX) this.target.x = set.panX;
        if (set.panY) this.target.y = set.panY;
        if (set.panZ) this.target.z = set.panZ;
        if (set.scale) scale = set.scale;
    };

    this.getPosition = function(scaled) {
        var t = this.target,
            pos = { left:theta, up:phi, panX:t.x, panY:t.y, panZ:t.z, scale:scaled ? scaleSave : 1 };
        return pos;
    };

    this.dollyIn = function (dollyScale) {
        if (dollyScale === undefined) {
            dollyScale = getZoomScale();
        }
        scale *= dollyScale;
    };

    this.dollyOut = function (dollyScale) {
        if (dollyScale === undefined) {
            dollyScale = getZoomScale();
        }
        scale /= dollyScale;
    };

    this.update = function () {
        var position = this.object.position;

        offset.copy(position).sub(this.target);

        // rotate offset to "y-axis-is-up" space
        offset.applyQuaternion(quat);

        // angle from z-axis around y-axis
        theta = isValue(thetaSet) ? thetaSet : Math.atan2(offset.x, offset.z);

        // angle from y-axis
        phi = isValue(phiSet) ? phiSet : Math.atan2(Math.sqrt(offset.x * offset.x + offset.z * offset.z), offset.y);

        theta += thetaDelta;
        phi += phiDelta;

        // restrict theta to be between desired limits
        theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, theta));

        // restrict phi to be between desired limits
        phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, phi));

        // restrict phi to be betwee EPS and PI-EPS
        phi = Math.max(EPS, Math.min(Math.PI - EPS, phi));

        var radius = offset.length() * (mode === MODE.PERSPECTIVE ? scale : 1);

        // restrict radius to be between desired limits
        radius = Math.max(this.minDistance, Math.min(this.maxDistance, radius));

        // move target to panned location
        this.target.add(pan);

        offset.x = radius * Math.sin(phi) * Math.sin(theta);
        offset.y = radius * Math.cos(phi);
        offset.z = radius * Math.sin(phi) * Math.cos(theta);

        // rotate offset back to "camera-up-vector-is-up" space
        offset.applyQuaternion(quatInverse);

        position.copy(this.target).add(offset);
        this.object.lookAt(this.target);

        thetaDelta = 0;
        thetaSet = null;
        phiDelta = 0;
        phiSet = null;
        pan.set(0, 0, 0);

        scaleSave *= scale;

        if (mode === MODE.ORTHOGRAPHIC) {
            scope.object.zoom = 1/scale;
            scope.object.updateProjectionMatrix();
        } else {
            scale = 1;
        }

        // update condition is:
        // min(camera displacement, camera rotation in radians)^2 > EPS
        // using small-angle approximation cos(x/2) = 1 - x^2 / 8
        if (lastPosition.distanceToSquared(this.object.position) > EPS
            || 8 * (1 - lastQuaternion.dot(this.object.quaternion)) > EPS) {

            this.dispatchEvent(changeEvent);
            lastPosition.copy(this.object.position);
            lastQuaternion.copy(this.object.quaternion);
            if (notify) notify(position, true);
        } else {
            if (notify) notify(position, false);
        }
    };

    this.reset = function () {
        state = STATE.NONE;
        scale = 1;
        scaleSave = 1;
        this.target.copy(this.target0);
        this.object.position.copy(this.position0);
    };

    this.getPolarAngle = function () {
        return phi;
    };

    this.getAzimuthalAngle = function () {
        return theta
    };

    function getZoomScale() {
        return Math.pow(0.95, scope.zoomSpeed);
    }

    function onMouseDown(event) {
        if (scope.enabled === false) return;
        event.preventDefault();

        switch (event.button) {
            case scope.mouseButtons.ORBIT:
                state = event.metaKey ? STATE.PAN : STATE.ROTATE;
                break;
            case scope.mouseButtons.ZOOM:
                state = STATE.DOLLY;
                break;
            case scope.mouseButtons.PAN:
                state = STATE.PAN;
                break;
        }

        switch (state) {
            case STATE.ROTATE:
                if (scope.noRotate === true) return state = STATE.NONE;
                rotateStart.set(event.clientX, event.clientY);
                break;
            case STATE.DOLLY:
                if (scope.noZoom === true) return state = STATE.NONE;
                dollyStart.set(event.clientX, event.clientY);
                break;
            case STATE.PAN:
                if (scope.noPan === true) return state = STATE.NONE;
                panStart.set(event.clientX, event.clientY);
                break;
        }

        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('mouseup', onMouseUp, false);
        scope.dispatchEvent(startEvent);
    }

    function onMouseMove(event) {
        if (scope.enabled === false) return;
        event.preventDefault();

        var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

        if (state === STATE.ROTATE) {
            if (scope.noRotate === true) return;

            rotateEnd.set(event.clientX, event.clientY);
            rotateDelta.subVectors(rotateEnd, rotateStart);

            // rotating across whole screen goes 360 degrees around
            scope.rotateLeft(2 * Math.PI * rotateDelta.x / element.clientWidth * scope.rotateSpeed);
            // rotating up and down along whole screen attempts to go 360, but limited to 180
            scope.rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight * scope.rotateSpeed);

            rotateStart.copy(rotateEnd);

        } else if (state === STATE.DOLLY) {
            if (scope.noZoom === true) return;

            dollyEnd.set(event.clientX, event.clientY);
            dollyDelta.subVectors(dollyEnd, dollyStart);

            if (dollyDelta.y > 0) {
                scope.dollyIn();
            } else {
                scope.dollyOut();
            }

            dollyStart.copy(dollyEnd);

        } else if (state === STATE.PAN) {
            if (scope.noPan === true) return;

            panEnd.set(event.clientX, event.clientY);
            panDelta.subVectors(panEnd, panStart);
            scope.pan(panDelta.x, panDelta.y);
            panStart.copy(panEnd);
        }

        scope.update();
    }

    function onMouseUp(/* event */) {
        if (scope.enabled === false) return;

        document.removeEventListener('mousemove', onMouseMove, false);
        document.removeEventListener('mouseup', onMouseUp, false);
        scope.dispatchEvent(endEvent);
        state = STATE.NONE;
    }

    function onMouseWheel(event) {
        if (scope.enabled === false || scope.noZoom === true) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey && slider) {
            slider(event.deltaX || event.wheelDelta || event.detail);
            return;
        }

        var delta = -(event.deltaY || event.wheelDelta || event.detail || 0);

        if (delta === 0) return;

        if (scope.reverseZoom) {
            delta = -delta;
        }

        if (delta > 0) {
            scope.dollyOut();
        } else if (delta < 0) {
            scope.dollyIn();
        }

        scope.update();
        scope.dispatchEvent(startEvent);
        scope.dispatchEvent(endEvent);
    }

    function onKeyDown(event) {
        if (scope.enabled === false || scope.noKeys === true || scope.noPan === true) return;

        switch (event.keyCode) {

            case scope.keys.UP:
                scope.pan(0, scope.keyPanSpeed);
                scope.update();
                break;

            case scope.keys.BOTTOM:
                scope.pan(0, -scope.keyPanSpeed);
                scope.update();
                break;

            case scope.keys.LEFT:
                scope.pan(scope.keyPanSpeed, 0);
                scope.update();
                break;

            case scope.keys.RIGHT:
                scope.pan(-scope.keyPanSpeed, 0);
                scope.update();
                break;
        }
    }

    function touchstart(event) {
        if (scope.enabled === false) return;

        switch (event.touches.length) {
            case 1:    // one-fingered touch: rotate
                if (scope.noRotate === true) return;

                state = STATE.TOUCH_ROTATE;

                rotateStart.set(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY);
                break;

            case 2:    // two-fingered touch: dolly
                if (scope.noZoom === true) return;

                state = STATE.TOUCH_DOLLY;

                var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
                var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
                var distance = Math.sqrt(dx * dx + dy * dy);
                dollyStart.set(0, distance);
                break;

            case 3: // three-fingered touch: pan
                if (scope.noPan === true) return;

                state = STATE.TOUCH_PAN;

                panStart.set(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY);
                break;

            default:
                state = STATE.NONE;
        }
        scope.dispatchEvent(startEvent);
    }

    function touchmove(event) {
        if (scope.enabled === false) return;

        event.preventDefault();
        event.stopPropagation();

        var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

        switch (event.touches.length) {
            case 1: // one-fingered touch: rotate
                if (scope.noRotate === true) return;
                if (state !== STATE.TOUCH_ROTATE) return;

                rotateEnd.set(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY);
                rotateDelta.subVectors(rotateEnd, rotateStart);

                // rotating across whole screen goes 360 degrees around
                scope.rotateLeft(2 * Math.PI * rotateDelta.x / element.clientWidth * scope.rotateSpeed);
                // rotating up and down along whole screen attempts to go 360, but limited to 180
                scope.rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight * scope.rotateSpeed);

                rotateStart.copy(rotateEnd);
                scope.update();
                break;

            case 2: // two-fingered touch: dolly
                if (scope.noZoom === true) return;
                if (state !== STATE.TOUCH_DOLLY) return;

                var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
                var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
                var distance = Math.sqrt(dx * dx + dy * dy);

                if (reverseZoom) distance = -distance;

                dollyEnd.set(0, distance);
                dollyDelta.subVectors(dollyEnd, dollyStart);

                if (dollyDelta.y > 0) {
                    scope.dollyOut();
                } else {
                    scope.dollyIn();
                }

                dollyStart.copy(dollyEnd);
                scope.update();
                break;

            case 3: // three-fingered touch: pan
                if (scope.noPan === true) return;
                if (state !== STATE.TOUCH_PAN) return;

                panEnd.set(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY);
                panDelta.subVectors(panEnd, panStart);
                scope.pan(panDelta.x, panDelta.y);
                panStart.copy(panEnd);

                scope.update();
                break;

            default:
                state = STATE.NONE;
        }
    }

    function touchend(/* event */) {
        if (scope.enabled === false) return;
        scope.dispatchEvent(endEvent);
        state = STATE.NONE;
    }

    this.onMouseUp = onMouseUp;

    domEl.addEventListener('contextmenu', function (event) { event.preventDefault() }, false);
    domEl.addEventListener('mousedown', onMouseDown, false);
    domEl.addEventListener('mousewheel', onMouseWheel, false);
    domEl.addEventListener('DOMMouseScroll', onMouseWheel, false); // firefox
    domEl.addEventListener('touchstart', touchstart, false);
    domEl.addEventListener('touchend', touchend, false);
    domEl.addEventListener('touchmove', touchmove, false);

    window.addEventListener('keydown', onKeyDown, false);
};

THREE.CubeControls.prototype = Object.create(THREE.EventDispatcher.prototype);
