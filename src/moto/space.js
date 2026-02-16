/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';
import { Orbit } from './orbit.js';
import { Trackball } from './trackball.js';
import { Text3D } from './text3d.js';
import '../ext/tween.js';

const {
    WebGLRenderer,
    Scene,
    Group,
    MeshPhongMaterial,
    FrontSide,
} = THREE;

const nav = navigator;

let WIN = self.window || {},
    DOC = self.document,
    SCENE = new Scene(),
    WORLD = new Group(),
    PI = Math.PI,
    PI2 = PI / 2,
    PI4 = PI / 4,
    panX = 0,
    panY = 0,
    panZ = 0,
    home = 0,
    up = PI4,
    gridZOff = 0,
    tweenTime = 500,
    tweenDelay = 20,
    platformZOff = 0,
    perspective = 35,
    refreshTimeout = null,
    refreshRequested = false,
    selectRecurse = false,
    defaultKeys = true,
    fitVisibleOnly = false,
    fitPaddingPerspective = 0.5,
    fitPaddingOrthographic = 0.9,
    initialized = false,
    alignedTracking = false,
    trackingMode = 'platform',  // 'platform', 'camera-aligned', 'world-xy'
    trackingDistance = 1000,    // Distance from camera for camera-aligned mode
    afterRenderCallbacks = [],
    skyAmbient,
    skyGridColor = 0xcccccc,
    skyGridMaterial = undefined,
    showSkyGrid = false,
    showPlatform = true,
    hidePlatformBelow = true,
    hideGridBelow = false,
    showGrid = true,
    showGridLines = true,
    showFocus = 0,
    focalPoint = undefined,
    lightInfo = {
        mode: 2,
        array: [],
        intensity: 0.09,
        debug: false
    },
    cameraLight = addLight(0, 0, 0, lightInfo.intensity),
    origin = {x:0, y:0, z: 0},
    mouse = {x: 0, y: 0},
    mouseStart = null,
    mouseDragPoint = null,
    mouseDragStart = null,
    mouseDownSelect,
    mouseUpSelect,
    mouseUp,
    mouseDown,
    mouseHover,
    mouseHoverNull,
    mouseDrag,
    grid = {
        origin: origin,
        unitMinor: 0,
        unitMajor: 0,
        colorMinor: 0xeeeeee,
        colorMajor: 0xcccccc,
        colorX: 0xff6666,
        colorY: 0x6666ff,
        zoff: 0,
        opacity: 1,
        view: undefined,
        axes: undefined,
        lines: undefined
    },
    ruler = {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
        xlabel: 'X',
        ylabel: 'Y',
        xon: undefined,
        yon: undefined,
        factor: undefined,
        view: undefined
    },
    psize = {},
    timers = {},
    fontColor = '#333333',
    fontScale = 1.4, // computed relative to grid size
    rulerColor,
    axesOn = true,
    volumeOn = true,
    viewControl,
    trackPlane,
    platform,
    platformHover,
    platformClick,
    platformClickAt,
    platformOnMove,
    platformOnMoveTime = 500,
    platformMoveTimer,
    platformBelt = false,
    volume,
    camera,
    cameraType,
    renderer,
    container,
    raycaster,
    sliderCallback,
    freezeTo,
    freeze,
    isRound = false,
    platformMaterial = new MeshPhongMaterial({
        color: 0xeeeeee,
        specular: 0xeeeeee,
        shininess: 0,
        transparent: true,
        opacity: 0.6,
        side: FrontSide,
        depthWrite: false,
    }),
    hiddenKey,
    vizChange,
    docVisible = true,
    antiAlias = WIN.devicePixelRatio <= 1,
    lastAction = Date.now(),
    renderTime = 0,
    fps = 0,
    controlMode = 'default';

if (DOC) {
    if (typeof DOC.hidden !== "undefined") {
        hiddenKey = "hidden";
        vizChange = "visibilitychange";
    } else if (typeof DOC.msHidden !== "undefined") {
        hiddenKey = "msHidden";
        vizChange = "msvisibilitychange";
    } else if (typeof DOC.webkitHidden !== "undefined") {
        hiddenKey = "webkitHidden";
        vizChange = "webkitvisibilitychange";
    }

    DOC.addEventListener(vizChange, () => {
        docVisible = DOC[hiddenKey] ? false : true;
    }, false);
}

function updateLastAction() {
    lastAction = Date.now();
}

function isTrackballMode() {
    return controlMode === 'void';
}

function createViewControl(cam, dom, notify, slider) {
    return isTrackballMode()
        ? new Trackball(cam, dom, notify, slider)
        : new Orbit(cam, dom, notify, slider);
}

function applyControlBindings() {
    if (!viewControl?.setMouse) return;
    if (controlMode === 'onshape') {
        viewControl.setMouse(viewControl.mouseOnshape);
    } else if (controlMode === 'void') {
        viewControl.setMouse(viewControl.mouseVoid);
    } else {
        viewControl.setMouse(viewControl.mouseDefault);
    }
}

function delayed(key, time, fn) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, time);
}

function valueOr(val, def) {
    return val !== undefined ? val : def;
}

function isEffectivelyVisible(obj) {
    let node = obj;
    while (node) {
        if (!node.visible) return false;
        node = node.parent;
    }
    return true;
}

WORLD.contains = (obj) => {
    return WORLD.children.contains(obj);
};

/** ******************************************************************
 * TWEENing Functions
 ******************************************************************* */

function tweenit() {
    self.TWEEN?.update();
    setTimeout(tweenit, tweenDelay);
}

tweenit();

function tweenCamPan(x,y,z,left,up,time,upVec) {
    updateLastAction();
    let pos = viewControl.getPosition();
    pos.panX = x;
    pos.panY = y;
    pos.panZ = z;
    if (left !== undefined) pos.left = left;
    if (up !== undefined) pos.up = up;
    if (time !== undefined) pos.time = time;
    if (upVec) pos.upVec = upVec;
    tweenCam(pos);
}

function tweenCam(pos) {
    let hasScale = pos.scale !== undefined;
    let hasUpVec = pos.upVec !== undefined;
    let prevScale = 1;
    let tweenDuration = pos.time ?? tweenTime;
    let tf = function () {
        if (hasUpVec && camera) {
            const upNow = new THREE.Vector3(this.upX, this.upY, this.upZ);
            if (upNow.lengthSq() > 1e-12) {
                camera.up.copy(upNow.normalize());
            }
        }
        const next = {
            left: this.left,
            up: this.up,
            panX: this.panX,
            panY: this.panY,
            panZ: this.panZ
        };
        if (hasScale) {
            const scaleStep = this.scale / prevScale;
            if (isFinite(scaleStep) && scaleStep > 0) {
                next.scale = scaleStep;
                prevScale = this.scale;
            }
        }
        viewControl.setPosition(next);
        updateLastAction();
        refresh();
    };
    let from = Object.clone(viewControl.getPosition());
    let to = Object.clone(pos);
    if (hasScale) {
        from.scale = 1;
    }
    if (hasUpVec && camera) {
        from.upX = camera.up.x;
        from.upY = camera.up.y;
        from.upZ = camera.up.z;
        to.upX = pos.upVec.x;
        to.upY = pos.upVec.y;
        to.upZ = pos.upVec.z;
    }
    let dist = Math.abs(from.left - to.left);
    if (dist > Math.PI) {
        if (from.left < to.left) {
            from.left += Math.PI * 2;
        } else {
            from.left -= Math.PI * 2;
        }
    }
    new TWEEN.Tween(from).
        to(to, tweenDuration).
        onUpdate(tf).
        onComplete(() => {
            if (hasUpVec && camera) {
                const upFinal = new THREE.Vector3(pos.upVec.x, pos.upVec.y, pos.upVec.z);
                if (upFinal.lengthSq() > 1e-12) {
                    camera.up.copy(upFinal.normalize());
                }
            }
            const finalPos = {
                left: pos.left,
                up: pos.up,
                panX: pos.panX,
                panY: pos.panY,
                panZ: pos.panZ
            };
            if (hasScale) {
                const finalScaleStep = pos.scale / prevScale;
                if (isFinite(finalScaleStep) && finalScaleStep > 0) {
                    finalPos.scale = finalScaleStep;
                }
            }
            viewControl.setPosition(finalPos);
            updateLastAction();
            refresh();
            let { then } = pos;
            if (typeof then === 'function') {
                then();
            }
        }).
        start();
}

function snapUpForViewDirection(dir, currentUp) {
    const viewDir = dir.clone().normalize();
    const upRef = (currentUp || new THREE.Vector3(0, 1, 0)).clone();
    let projectedUp = upRef.projectOnPlane(viewDir);
    if (projectedUp.lengthSq() < 1e-8) {
        projectedUp = new THREE.Vector3(0, 1, 0).projectOnPlane(viewDir);
    }
    if (projectedUp.lengthSq() < 1e-8) {
        projectedUp = new THREE.Vector3(0, 0, 1).projectOnPlane(viewDir);
    }
    if (projectedUp.lengthSq() < 1e-8) {
        projectedUp = new THREE.Vector3(1, 0, 0).projectOnPlane(viewDir);
    }
    if (projectedUp.lengthSq() < 1e-8) {
        return new THREE.Vector3(0, 1, 0);
    }
    projectedUp.normalize();

    const axes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1)
    ];

    let best = null;
    let bestScore = -Infinity;
    for (const axis of axes) {
        const p = axis.clone().projectOnPlane(viewDir);
        if (p.lengthSq() < 1e-8) continue;
        p.normalize();
        const score = p.dot(projectedUp);
        if (score > bestScore) {
            bestScore = score;
            best = p;
        }
    }
    return best;
}

function viewDirectionFromAngles(left, upAngle) {
    return new THREE.Vector3(
        Math.sin(upAngle) * Math.sin(left),
        Math.cos(upAngle),
        Math.sin(upAngle) * Math.cos(left)
    ).normalize();
}

function tweenPreset(left, upAngle, then) {
    // Keep legacy behavior for orbit-based modes (kiri/mesh): do not tween camera.up.
    if (controlMode !== 'void') {
        tweenCam({ left, up: upAngle, panX, panY, panZ, then });
        return;
    }
    const upVec = camera
        ? snapUpForViewDirection(viewDirectionFromAngles(left, upAngle), camera.up)
        : null;
    tweenCam({ left, up: upAngle, panX, panY, panZ, upVec: upVec || undefined, then });
}

function fitPreset(left, upAngle, then) {
    const upVec = camera
        ? snapUpForViewDirection(viewDirectionFromAngles(left, upAngle), camera.up)
        : null;
    Space.view.fit(then, { left, up: upAngle, upVec: upVec || undefined, tween: true });
}

function runPreset(left, upAngle, then) {
    // Only void uses preset+fit behavior. Kiri/mesh keep legacy fixed-distance presets.
    if (controlMode === 'void') {
        fitPreset(left, upAngle, then);
    } else {
        tweenPreset(left, upAngle, then);
    }
}

/** ******************************************************************
 * Utility Functions
 ******************************************************************* */

function width() { return container ? container.clientWidth : WIN.innerWidth }

function height() { return container ? container.clientHeight : WIN.innerHeight }

function aspect() { return width() / height() }

/**
 * Convert mouse event to normalized device coordinates (-1 to +1)
 * relative to the container element. Accounts for container position offset.
 */
function eventToNDC(event) {
    const canvas = renderer?.domElement || null;
    const rect = canvas?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) {
        if (!container) {
            // Fallback for no container (shouldn't happen after init)
            return {
                x: (event.clientX / WIN.innerWidth) * 2 - 1,
                y: -(event.clientY / WIN.innerHeight) * 2 + 1
            };
        }
        const crect = container.getBoundingClientRect();
        const x = event.clientX - crect.left;
        const y = event.clientY - crect.top;
        return {
            x: (x / crect.width) * 2 - 1,
            y: -(y / crect.height) * 2 + 1
        };
    }
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return {
        x: (x / rect.width) * 2 - 1,
        y: -(y / rect.height) * 2 + 1
    };
}

/**
 * Update tracking plane orientation based on tracking mode
 */
function updateTrackingPlane() {
    if (!trackPlane || !camera || !viewControl) {
        return;
    }

    // Don't update during drag operations
    if (mouseDragPoint) {
        return;
    }

    switch (trackingMode) {
        case 'camera-aligned':
            // Orient plane perpendicular to camera view
            const cameraDir = new THREE.Vector3();
            camera.getWorldDirection(cameraDir);

            // Position plane at fixed distance behind camera target
            const target = viewControl.getTarget();
            trackPlane.position.copy(target).addScaledVector(cameraDir, trackingDistance);

            // Orient perpendicular to camera (copy camera rotation)
            trackPlane.quaternion.copy(camera.quaternion);

            // Enable aligned tracking mode
            alignedTracking = true;
            trackPlane.visible = false;  // Hidden by default, shown during drag
            break;

        case 'world-xy':
            // Fixed horizontal plane at Z=0 (original behavior)
            trackPlane.position.set(0, 0, 0);
            trackPlane.rotation.set(0, 0, 0);

            // Enable aligned tracking mode
            alignedTracking = true;
            trackPlane.visible = false;  // Hidden by default, shown during drag
            break;

        case 'platform':
        default:
            // Use platform for tracking (not trackPlane)
            alignedTracking = false;
            trackPlane.visible = false;
            break;
    }
}

function addEventListener(el, key, fn) {
    el.addEventListener(key, fn);
}

function addEventHandlers(el, pairs) {
    for (let i=0; i<pairs.length; i += 2) {
        addEventListener(el, pairs[i], pairs[i+1]);
    }
}

function onEnterKey(el, fn, onblur) {
    if (Array.isArray(el)) {
        for (let i=0; i<el.length; i += 2) onEnterKey(el[i], el[i+1], fn);
        return;
    }
    addEventListener(el, 'keyup', function(event) {
        if (event.keyCode === 13) fn(event);
    });
    if (onblur) {
        addEventListener(el, 'blur', function(event) {
            fn(event);
        });
    }
}

function addLight(x, y, z, i, color = 0xffffff) {
    let l = new THREE.DirectionalLight(color, i * 4);
    l.position.set(x,z,y);
    if (lightInfo.debug) {
        let b; l.add(b = new THREE.Mesh(
            new THREE.BoxGeometry(1,1,1),
            new THREE.MeshBasicMaterial( {color: 0xff0000} )
        )); b.scale.set(5,5,5);
    }
    SCENE.add(l);
    return l;
}

// 4 corners bottom, 4 axis centers top
function updateLights() {
    let x = psize.width;
    let y = psize.depth;
    let z = Math.max(x,y);

    let { mode, intensity, array } = lightInfo;

    // remove old lights
    for (let l of array) {
        SCENE.remove(l);
    }

    // add new
    let x0 = -x/2, y0 = -y/2, z0 = 0;
    let x1 =  x/2, y1 =  y/2, z1 = z / 2, z2 = z;

    switch (mode) {
        case 0: array = [
            addLight( x1,  y0,  z1, intensity * 1.5),
            addLight( x0,  y1, -z1, intensity * 0.7)];
            break;
        case 1: array = [
            addLight( x1,  y1,  z1, intensity * 2.5),
            addLight( x0,  y1, -z1, intensity * 0.5),
            addLight( x0,  y0,  z1, intensity * 2.5, 0xeeeeee),
            addLight( x1,  y0, -z1, intensity * 0.5, 0xeeeeee)];
            break;
        case 2: array = [
            addLight( x1,  y1,  z1, intensity * 2.5),
            addLight( x0,  y1, -z1, intensity * 0.5),
            addLight( x0,  y0,  z1, intensity * 2.5, 0xeeeeee),
            addLight( x1,  y0, -z1, intensity * 0.5, 0xeeeeee),
            addLight(  0,   0,  z2, intensity * 1.2),
            addLight(  0,   0, -z2, intensity * 0.8)];
            break;
    }

    lightInfo.array = array;
    lightInfo.camera = cameraLight;
    lightInfo.ambient = skyAmbient;
    requestRefresh();
}

function updatePlatformPosition() {
    if (isRound) {
        platform.position.y = -platform.scale.y/2 - platformZOff;
    } else {
        platform.position.y = -platform.scale.z/2 - platformZOff;
    }
    requestRefresh();
}

function setPlatformSize(
    width = psize.width || 300,
    depth = psize.depth || 300,
    height = psize.height || 2.5,
    maxz = psize.maxz || 100
) {
    psize = { width, depth, height, maxz };
    if (isRound) {
        platform.scale.set(width, height, depth);
    } else {
        platform.scale.set(width, depth, height);
    }
    let maxDim = Math.max(width,depth);
    viewControl.minDistance = 1;
    viewControl.maxDistance = maxDim * 4;
    updatePlatformPosition();
    updateLights();
    if (volume) {
        SCENE.remove(volume);
        THREE.dispose(volume);
        volume = null;
    }
    if (maxz) {
        const points = [
            // pillars
            {x: -width/2, z: -depth/2, y: 0},
            {x: -width/2, z: -depth/2, y: maxz},
            {x:  width/2, z:  depth/2, y: 0},
            {x:  width/2, z:  depth/2, y: maxz},
            {x: -width/2, z:  depth/2, y: 0},
            {x: -width/2, z:  depth/2, y: maxz},
            {x:  width/2, z: -depth/2, y: 0},
            {x:  width/2, z: -depth/2, y: maxz},
            // top
            {x: -width/2, z: -depth/2, y: maxz},
            {x: -width/2, z:  depth/2, y: maxz},
            {x: -width/2, z: -depth/2, y: maxz},
            {x:  width/2, z: -depth/2, y: maxz},
            {x:  width/2, z:  depth/2, y: maxz},
            {x:  width/2, z: -depth/2, y: maxz},
            {x:  width/2, z:  depth/2, y: maxz},
            {x: -width/2, z:  depth/2, y: maxz},
        ];
        SCENE.add(volume = makeLinesFromPoints(points, grid.colorMinor));
        showVolume(volumeOn);
    }
}

function setPlatformSizeUpdateGrid(width, depth, height, maxz) {
    freeze = { width, depth, height, maxz };
    setPlatformSize(width, depth, height, maxz);
    setGrid(grid.unitMajor, grid.unitMinor);
    clearTimeout(freezeTo);
    freezeTo = setTimeout(() => { freeze = undefined }, 10);
}

function setPlatformColor(color) {
    let was = platform.material.color.getHex();
    platform.material.color.set(color);
    requestRefresh();
    return was;
}

function setFont(options) {
    if (options.color) fontColor = options.color;
    if (options.scale) fontScale = options.scale;
    if (options.rulerColor) rulerColor = options.rulerColor;
    updateRulers();
}

function showAxes(bool) {
    axesOn = bool;
    updateRulers();
}

function showVolume(bool) {
    volumeOn = bool;
    if (volume) volume.visible = bool;
    requestRefresh();
}

/**
 * 3D text renderer for grid labels.
 * Uses bitmap font atlas with shared geometries for memory efficiency.
 */
let text3d = self.document ? new Text3D({
    chars: '0123456789-XY',
    charSize: 64,
    kerning: 0.6,
    scaleX: 0.7,
    fontFamily: "'Russo One', sans-serif"
}) : undefined;

function setRulers(
    xon = ruler.xon,
    yon = ruler.yon,
    factor = ruler.factor || 1,
    xl = ruler.xlabel || 'X',
    yl = ruler.ylabel || 'Y')
{
    if (xon !== ruler.xon || yon !== ruler.yon || factor !== ruler.factor || xl !== ruler.xlabel || yl !== ruler.ylabel) {
        ruler.factor = factor;
        ruler.xon = xon;
        ruler.yon = yon;
        ruler.xlabel = xl;
        ruler.ylabel = yl;
        updateRulers();
    }
}

function updateRulers() {
    let { xon, yon, factor, xlabel, ylabel } = ruler;
    let x = platform.scale.x,
        y = isRound ? platform.scale.z : platform.scale.y,
        z = isRound ? platform.scale.y : platform.scale.z,
        w = x / 2,
        h = y / 2,
        d = z / 2,
        zp = -d - platformZOff + numOrDef(gridZOff, (z/2-0.1)),
        labelSize = grid.unitMinor * fontScale,
        oldView = ruler.view,
        view = ruler.view = new THREE.Group();

    if (false) console.log('updateRulers called', {
        xon, yon, axesOn, labelSize, rulerColor, factor,
        x1: ruler.x1, x2: ruler.x2, y1: ruler.y1, y2: ruler.y2,
        xo: ruler.xo, yo: ruler.yo,
        originX: grid.origin.x, originY: grid.origin.y
    });

    if (xon && axesOn) {
        // Create X-axis numeric labels
        // Original canvas code draws at canvas X: ruler.xo + i + xPadding/2
        // Canvas is centered at world X=0, canvas width = x + xPadding
        // So world X = (canvasX - canvasWidth/2) = (ruler.xo + i + xPadding/2) - (x + xPadding)/2
        //            = ruler.xo + i - x/2 = ruler.xo + i - w
        for (let i = 0; i >= ruler.x1; i -= grid.unitMajor) {
            const value = (i * factor).round(1).toString();
            const label = text3d.createLabel(value, labelSize, rulerColor, 'center');
            label.position.set(ruler.xo + i - w, -h - labelSize, zp);
            label.rotation.x = Math.PI;
            view.add(label);
        }
        for (let i = 0; i <= ruler.x2; i += grid.unitMajor) {
            const value = (i * factor).round(1).toString();
            const label = text3d.createLabel(value, labelSize, rulerColor, 'center');
            label.position.set(ruler.xo + i - w, -h - labelSize, zp);
            label.rotation.x = Math.PI;
            view.add(label);
        }

        // Create X-axis label
        const xLabel = text3d.createLabel(xlabel, labelSize, rulerColor, 'center');
        xLabel.position.set(0, -h - labelSize * 3.5, zp);
        xLabel.rotation.x = Math.PI;
        view.add(xLabel);
    }

    if (yon && axesOn) {
        // Create Y-axis numeric labels
        // Original canvas code draws at canvas Y: y - (ruler.yo + i) + yPadding/2
        // Canvas is centered at world Y=0, canvas height = y + yPadding
        // Canvas Y goes down, but world Y goes up, so we need to negate
        // World Y = -(canvasY - canvasHeight/2) = -(h - ruler.yo - i) = -h + ruler.yo + i
        for (let i = 0; i >= ruler.y1; i -= grid.unitMajor) {
            const value = (i * factor).round(1).toString();
            const label = text3d.createLabel(value, labelSize, rulerColor, 'right');
            label.position.set(-w - labelSize + 3, -h + ruler.yo + i, zp);
            label.rotation.x = Math.PI;
            view.add(label);
        }
        for (let i = 0; i <= ruler.y2; i += grid.unitMajor) {
            const value = (i * factor).round(1).toString();
            const label = text3d.createLabel(value, labelSize, rulerColor, 'right');
            label.position.set(-w - labelSize + 3, -h + ruler.yo + i, zp);
            label.rotation.x = Math.PI;
            view.add(label);
        }

        // Create Y-axis label
        const yLabel = text3d.createLabel(ylabel, labelSize, rulerColor, 'center');
        yLabel.position.set(-w - labelSize * 4, 0, zp);
        yLabel.rotation.x = Math.PI;
        view.add(yLabel);
    }

    Space.scene.remove(oldView);
    Space.scene.add(view);
    requestRefresh();
}

function setGrid(
        unitMajor = grid.unitMajor,
        unitMinor = grid.unitMinor,
        colorMajor = grid.colorMajor,
        colorMinor = grid.colorMinor)
{
    if (!unitMajor) {
        return;
    }
    if (
        unitMajor !== grid.unitMajor || unitMinor !== grid.unitMinor ||
        colorMajor !== grid.colorMajor || colorMinor !== grid.colorMinor
    ) {
        grid.unitMajor = unitMajor;
        grid.unitMinor = unitMinor;
        grid.colorMajor = colorMajor || grid.colorMajor;
        grid.colorMinor = colorMinor || grid.colorMinor;
        updateGrid();
    }
}

function setGridColor(opt = {}) {
    grid.colorMajor = valueOr(opt.major || opt.colorMajor, grid.colorMajor);
    grid.colorMinor = valueOr(opt.minor || opt.colorMinor, grid.colorMinor);
    grid.colorX = valueOr(opt.colorX, grid.colorX);
    grid.colorY = valueOr(opt.colorY, grid.colorY);
    updateGrid();
}

function numOrDef(v, dv) {
    return v !== undefined ? v : dv;
}

function modMatch(val, mod) {
    let mv = Math.abs(val) % mod;
    return (mv < 1) || ((mod - mv) < 1);
}

function updateGrid() {
    let { view, unitMinor, unitMajor, colorMajor, colorMinor, colorX, colorY } = grid;
    let oldView = view;
    let axes = grid.axes = new THREE.Group();
    let lines = grid.lines = new THREE.Group();

    view = grid.view = new THREE.Group();
    view.visible = oldView ? oldView.visible : true;
    view.add(lines);
    view.add(axes);

    let majors = [],
        minors = [],
        x = platform.scale.x,
        y = isRound ? platform.scale.z : platform.scale.y,
        z = isRound ? platform.scale.y : platform.scale.z,
        zp = -(z / 2) - platformZOff + numOrDef(gridZOff, (z/2-0.1)),
        xh = x / 2,
        yh = y / 2,
        x1 = -xh - origin.x,
        x2 = xh - origin.x,
        y1 = -yh + origin.y,
        y2 = yh + origin.y,
        xo = x1 + xh,
        yo = y1 + yh;

    ruler.x1 = x1;
    ruler.x2 = x2;
    ruler.y1 = y1;
    ruler.y2 = y2;
    ruler.xo = xh - xo;
    ruler.yo = yh - yo;

    for (let x=-unitMinor; x>x1; x -= unitMinor) {
        let oh = isRound ? Math.sqrt(1-(x/xh)*(x/xh)) * yh : yh;
        let arr = modMatch(x, unitMajor) ? majors : minors;
        arr.append({x:x-xo, y:-oh, z:zp}).append({x:x-xo, y:oh, z:zp});
    }
    for (let x=unitMinor; x<x2; x += unitMinor) {
        let oh = isRound ? Math.sqrt(1-(x/xh)*(x/xh)) * yh : yh;
        let arr = modMatch(x, unitMajor) ? majors : minors;
        arr.append({x:x-xo, y:-oh, z:zp}).append({x:x-xo, y:oh, z:zp});
    }
    for (let y=-unitMinor; y>y1; y -= unitMinor) {
        let ow = isRound ? Math.sqrt(1-(y/yh)*(y/yh)) * xh : xh;
        let arr = modMatch(y, unitMajor) ? majors : minors;
        arr.append({x:-ow, y:y-yo, z:zp}).append({x:ow, y:y-yo, z:zp});
    }
    for (let y=unitMinor; y<y2; y += unitMinor) {
        let ow = isRound ? Math.sqrt(1-(y/yh)*(y/yh)) * xh : xh;
        let arr = modMatch(y, unitMajor) ? majors : minors;
        arr.append({x:-ow, y:y-yo, z:zp}).append({x:ow, y:y-yo, z:zp});
    }
    lines.add(makeLinesFromPoints(majors, colorMajor));
    lines.add(makeLinesFromPoints(minors, colorMinor));
    axes.add(makeLinesFromPoints([
        {x: -xo, y:y1-yo, z:zp},
        {x: -xo, y:y2-yo, z:zp},
    ], colorY));
    axes.add(makeLinesFromPoints([
        {x: x1-xo, y:-yo, z:zp},
        {x: x2-xo, y:-yo, z:zp},
    ], colorX));

    Space.scene.remove(oldView);
    Space.scene.add(grid.view);
    lines.visible = showGridLines;
    requestRefresh();
}

function updateDraws() {
    updateGrid();
    updateRulers();
    requestRefresh();
}

function setOrigin(x, y, z, show) {
    if (grid.origin) {
        let or = origin;
        let unchanged = x === or.x && y === or.y && z === or.z && show === or.show;
        if (!unchanged) {
            Space.scene.remove(grid.origin.group);
        }
        if (unchanged) {
            updateDraws();
            return;
        }
    }
    origin = {x, y, z, show};
    if (!show) {
        return;
    }
    let cmat = new THREE.MeshPhongMaterial({
        color: 0xcceeff,
        specular: 0xcceeff,
        shininess: 5,
        transparent: true,
        opacity: 0.5,
        // side: THREE.DoubleSide
    });
    let rmat = new THREE.MeshPhongMaterial({
        color: 0x88aadd,
        transparent: true,
        opacity: 0.5,
        // side: THREE.DoubleSide
    });
    let PIP = Math.PI/2;
    let pi1, pi2, pi3, pi4;
    let group = new THREE.Group();
    grid.origin = {x, y, z, group};
    group.add(pi1 = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 50, PIP*0, PIP*1),
        cmat
    ));
    pi1.position.x = 0.25;
    pi1.position.y = 0.25;
    group.add(pi2 = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 50, PIP*1, PIP*1),
        cmat
    ));
    pi2.position.x = -0.25;
    pi2.position.y = 0.25;
    group.add(pi3 = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 50, PIP*2, PIP*1),
        cmat
    ));
    pi3.position.x = -0.25;
    pi3.position.y = -0.25;
    group.add(pi4 = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 50, PIP*3, PIP*1),
        cmat
    ));
    pi4.position.x = 0.25;
    pi4.position.y = -0.25;
    let aa, bb, cc;
    group.add(aa = new THREE.Mesh(
        new THREE.RingGeometry(5, 5.5, 50),
        rmat
    ));
    group.add(bb = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 10),
        rmat
    ));
    group.add(cc = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 0.5),
        rmat
    ));
    group.rotation.x = -PI2;
    group.position.x = x;
    group.position.y = z;
    group.position.z = y;
    [bb,cc].forEach(m => {
        m.renderOrder = 3;
    });
    Space.scene.add(group);
    const scale = grid.origin.scale = () => {
        const dist = camera.position.distanceTo(group.position);
        const scale = Math.min(dist / 100, 0.5);
        group.scale.set(scale, scale, scale);
    };
    scale();
    updateDraws();
}

function setRound(bool) {
    let current = platform;
    isRound = bool;
    if (bool) {
        platform = new THREE.Mesh(
            new THREE.CylinderGeometry(.5, .5, 1, 60),
            platformMaterial
        );
        platform.rotation.x = 0;
    } else {
        platform = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            platformMaterial
        );
        platform.rotation.x = -PI2;
    }

    platform.position.y = current.position.y;
    platform.visible = current.visible;

    SCENE.remove(current);
    SCENE.add(platform);
    THREE.dispose(current);
}

function refresh() {
    refreshRequested = false;
    clearTimeout(refreshTimeout);
    updateLastAction();
    viewControl.update();
}

/** deferred refresh that collapses multiple requests */
function requestRefresh(timeout) {
    if (refreshRequested === false) {
        refreshRequested = true;
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(refresh, timeout || 10);
    }
}

function onResize() {
    updateLastAction();
    if (camera.isPerspectiveCamera) {
        camera.aspect = aspect();
    } else if (camera.isOrthographicCamera) {
        const asp = aspect();
        camera.left = -100 * asp;
        camera.right = 100 * asp;
        camera.top = 100;
        camera.bottom = -100;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
    container.style.width = width();
    container.style.height = height();
    requestRefresh();
}

function cca(c) {
    return c.charCodeAt(0);
}

function inputHasFocus() {
    return DOC.activeElement && (DOC.activeElement != DOC.body);
}

function keyHandler(evt) {
    updateLastAction();
    if (!defaultKeys || inputHasFocus()) return false;
    if (evt.metaKey) return false;
    let handled = true;
    switch (evt.charCode) {
        case cca('z'):
            Space.view.reset();
            break;
        case cca('h'):
            Space.view.home();
            break;
        case cca('t'):
            Space.view.top();
            break;
        case cca('F'):
            Space.view.fit();
            break;
        case cca('f'):
            Space.view.front();
            cycleInd = 0;
            break;
        case cca('b'):
            Space.view.back();
            cycleInd = 2;
            break;
        case cca('>'):
            cycleInd = (++cycleInd % cycle.length);
            cycle[cycleInd]();
            break;
        case cca('<'):
            cycleInd--;
            if (cycleInd < 0) {
                cycleInd += cycle.length;
            }
            cycle[cycleInd]();
            break;
        default:
            handled = false;
            break;
    }
    if (handled) evt.preventDefault();
    return false;
}

/** ******************************************************************
 * ThreeJS Helper Functions
 ******************************************************************* */

function makeLinesFromPoints(points, color) {
    if (points.length % 2 != 0) {
        throw "invalid line : "+points.length;
    }
    const geo = new THREE.BufferGeometry();
    const vrt = new Float32Array(points.length * 3);
    let vi = 0;
    for (let p of points) {
        vrt[vi++] = p.x;
        vrt[vi++] = p.y;
        vrt[vi++] = p.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(vrt, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
}

function intersect(objects, recurse) {
    // console.log(({int: objects}));
    let ints = raycaster.intersectObjects(objects, recurse);
    // console.trace({ints});
    return ints;
}

/** ******************************************************************
 * Mouse Functions
 ******************************************************************* */

function onMouseDown(event) {
    if (isVoidUiEventTarget(event?.target)) {
        return;
    }
    updateLastAction();
    if (event.target === renderer.domElement) {
        DOC.activeElement.blur();
        event.preventDefault();
        let selection = null,
            trackTo = alignedTracking ? trackPlane : platform,
            isVis = trackTo.visible;
        if (mouseDownSelect) {
            selection = mouseDownSelect(undefined, event);
        }
        // Always raycast, even if no selection (to detect trackPlane on empty clicks)
        if (selection || alignedTracking) {
            // selection = selection.map(o => o.isGroup ? o.children : o).flat();
            trackTo.visible = true;
            let raycastArray = selection && selection.length > 0 ? selection.slice().append(trackTo) : [trackTo];
            let int = intersect(raycastArray, false);
            trackTo.visible = isVis;
            if (int.length > 0) {
                let trackInt, selectInt;
                for (let i=0; i<int.length; i++) {
                    if (!trackInt && int[i].object === trackTo) {
                        trackInt = int[i];
                    } else if (!selectInt && selection && selection.contains(int[i].object)) {
                        selectInt = int[i];
                    }
                }
                if (trackInt && selectInt) {
                    mouseDragPoint = trackInt.point.clone();
                    mouseDragStart = mouseDragPoint;
                    viewControl.enabled = false;
                }
                if (selectInt) {
                    mouseDownSelect(selectInt, event, int);
                }
                if (mouseDown) mouseDown(event, int);
            }
        } else if (mouseDown) {
            let int = intersect(selection.slice().append(platform), false);
            if (int && int.length) mouseDown(event, int);
        }
        if (platformClick) {
            let vis = platform.visible;
            platform.visible = true;
            let int = intersect([platform], false);
            platform.visible = vis;
            platformClickAt = int && int.length > 0 ? int[0].point : null;
        }
    } else {
        viewControl.enabled = false;
    }
    mouseStart = eventToNDC(event);
}

function onMouseUp(event) {
    if (isVoidUiEventTarget(event?.target)) {
        return;
    }
    updateLastAction();
    if (!viewControl.enabled) {
        viewControl.enabled = true;
        viewControl.onMouseUp(event);
    }
    let mouseEnd = eventToNDC(event);
    // only fire on mouse move between mouseStart (down) and up
    if (mouseStart && mouseEnd.x - mouseStart.x + mouseEnd.y - mouseStart.y === 0) {
        event.preventDefault();
        let refresh = false,
            selection = null;
        if (mouseUpSelect) {
            selection = mouseUpSelect();
        }
        if (selection && selection.length > 0) {
            let int = intersect(selection, selectRecurse);
            if (mouseUp) {
                if (int.length) {
                    mouseUp(event, int);
                } else {
                    mouseUp(event, intersect([platform], selectRecurse));
                }
                if (event.button === 2) {
                    return;
                }
            }
            if (int.length > 0) {
                mouseUpSelect(int[0], event, int);
                refresh = true;
            } else {
                mouseUpSelect(null, event);
            }
        }
        if (!refresh && platformClickAt) {
            platformClick(platformClickAt);
        }
        if (refresh) {
            requestRefresh();
        }
        mouseStart = null;
    } else if (mouseDrag && mouseDragStart) {
        // fired on mouse drag end
        mouseDrag(null,null,true);
    }
    mouseDragPoint = null;
    mouseDragStart = null;
}

function onMouseMove(event) {
    if (isVoidUiEventTarget(event?.target)) {
        updateLastAction();
        requestRefresh();
        return;
    }
    updateLastAction();
    let int, vis, dragTrack;

    const ndc = eventToNDC(event);
    const mv = new THREE.Vector2(ndc.x, ndc.y);
    raycaster.setFromCamera( mv, camera );

    if (viewControl.enabled) {
        event.preventDefault();
        if (!event.buttons) {
            let selection = mouseHover ? mouseHover() : null;
            if (selection && selection.length > 0) {
                int = intersect(selection, selectRecurse);
                if (int.length > 0) mouseHover(int[0], event, int);
                else if (mouseHoverNull) mouseHoverNull();
            }
            if ((!int || int.length == 0) && platformHover) {
                vis = platform.visible;
                platform.visible = true;
                int = intersect([platform], false);
                platform.visible = vis;
                if (int && int.length > 0) platformHover(int[0].point);
            }
        } else if (mouseHoverNull) {
            mouseHoverNull();
        }
    } else if (mouseDragPoint && mouseDrag && (dragTrack = mouseDrag())) {
        event.preventDefault();
        let trackTo = alignedTracking ? trackPlane : platform;
        let vis = trackTo.visible;
        trackTo.visible = true;
        if (dragTrack.length) {
            int = intersect(dragTrack, false);
            trackTo = dragTrack[0];
        } else {
            int = intersect([trackTo], false);
            trackTo.visible = vis;
        }
        if (int.length > 0 && int[0].object === trackTo) {
            let delta = mouseDragPoint.clone().sub(int[0].point);
            let offset = mouseDragStart.clone().sub(int[0].point);
            mouseDragPoint = int[0].point;
            mouseDrag({
                x: -delta.x,
                y: delta.z,
                z: 0,
                event
            }, {
                x: -offset.x,
                y: offset.z,
                z: 0
            }, false, int);
            requestRefresh();
        }
    }
    mouse = eventToNDC(event);
}

function isVoidUiEventTarget(target) {
    return !!target?.closest?.(
        '.props-panel, #left-panel, #top-bar, .doc-dialog, .doc-dialog-backdrop, .toolbar-menu, .toolbar-menu-pop, .toolbar-menu-panel, .sketch-constraint-layer'
    );
}

/** ******************************************************************
 * Space Object
 ******************************************************************* */

function updateFocus() {
    if (focalPoint) {
        Space.scene.remove(focalPoint);
    }
    if (showFocus) {
        let mesh = focalPoint = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshPhongMaterial({
                side: THREE.DoubleSide,
                specular: 0x202020,
                color: 0xff0000,
                shininess: 125
            })
        );
        Space.scene.add(mesh);
        mesh.position.copy(viewControl.target);
    }
}

function onViewControlMove(position, moved) {
    if (platform) {
        platform.visible = hidePlatformBelow ?
            initialized && position.y >= 0 && showPlatform : showPlatform;
        volume.visible = volumeOn && platform.visible;
    }
    if (grid.view) {
        grid.view.visible = hideGridBelow ? platform.visible : showGrid;
    }
    if (cameraLight) {
        cameraLight.position.copy(camera.position);
    }
    if (moved && platformOnMove) {
        clearTimeout(platformMoveTimer);
        platformMoveTimer = setTimeout(platformOnMove, 500);
        Space.scene.updateFog();
    }
    updateTrackingPlane();
    updateLastAction();
    updateFocus();
}

function onViewControlZoom(val) {
    if (camera && grid?.origin?.scale) {
        grid.origin.scale();
    }
    if (camera && viewControl) {
        const dist = camera.position.distanceTo(viewControl.target);
        raycaster.params.Line.threshold = Math.min(1, dist / 100);
    }
    updateLastAction();
    if (sliderCallback) sliderCallback(val);
}

function setSky(opt = {}) {
    let { grid, color, gridColor } = opt;
    if (grid) Space.sky.showGrid(grid);
    if (color !== undefined) Space.sky.setColor(color);
    if (gridColor !== undefined) Space.sky.setGridColor(gridColor);
    if (skyAmbient && opt.ambient) {
        let { color, intensity } = opt.ambient;
        if (color) skyAmbient.color.set(color);
        if (intensity) skyAmbient.intensity = intensity;
    }
}

function setPlatform(opt = {}) {
    let platform = Space.platform;
    let { hiding } = opt;
    let { color, round, size, grid, opacity, zoom } = opt;
    let { visible, volume, zOffset, origin, light } = opt;
    if (light) {
        lightInfo.intensity = light;
    }
    if (color) {
        platform.setColor(color);
    }
    if (round !== undefined) {
        platform.setRound(round);
    }
    if (size) {
        let { width = 300, depth = 300, height = 2.5, maxz = 300 } = size;
        platform.setSize(width, depth, height, maxz);
    }
    if (grid) {
        let { below, disabled, zOffset } = grid;
        let { major = 25, minor = 5 } = grid;
        let { colorX, colorY, colorMajor, colorMinor } = grid;
        platform.setGrid(major, minor);
        platform.setGridColor({ colorX, colorY, colorMajor, colorMinor });
        if (zOffset !== undefined) platform.setGridZOff(zOffset);
        if (disabled) platform.showGrid(false);
        if (below) platform.showGridBelow(true);
    }
    if (origin) {
        let { x, y, z, show } = origin;
        platform.setOrigin(x || 0, y || 0, z || 0, show);
    }
    if (opacity !== undefined) {
        platform.opacity(opacity);
    }
    if (volume !== undefined) {
        platform.showVolume(volume);
    }
    if (zOffset !== undefined) {
        platform.setZOff(zOffset);
    }
    if (visible !== undefined) {
        platform.setVisible(visible);
    }
    if (zoom !== undefined) {
        Space.view.setZoom(zoom.reverse, zoom.speed);
    }
    if (hiding !== undefined) {
        platform.setHiding(hiding);
    }
}

let Space = {
    refresh: refresh,
    update: requestRefresh,

    afterRender(callback) {
        if (callback && typeof callback === 'function') {
            afterRenderCallbacks.push(callback);
        }
    },

    setAntiAlias(b) { antiAlias = b ? true : false },
    raycast: intersect,

    event: {
        addHandlers: addEventHandlers,
        onEnterKey: onEnterKey,
        onResize: onResize
    },

    sky: {
        set: setSky,

        showGrid: (b) => {
            showSkyGrid = b;
        },

        setColor: (c) => {
            SCENE.background = new THREE.Color(c);
        },

        setGridColor: (c) => {
            skyGridColor = c;
            if (skyGridMaterial) skyGridMaterial.color = new THREE.Color(c);
        }
    },

    scene: {
        add: function (o) {
            o.rotation.x = WORLD.rotation.x;
            return SCENE.add(o);
        },

        remove: function (o) {
            THREE.dispose(o);
            return SCENE.remove(o);
        },

        active: updateLastAction,

        setFog: function(mult, color) {
            if (mult) {
                SCENE.fog = new THREE.Fog(color, 100, 1000);
                SCENE.fog.mult = mult > 0 ? mult : 3;
            } else {
                SCENE.fog = undefined;
            }
            Space.scene.updateFog();
        },

        updateFog: function() {
            const { fog } = SCENE;
            if (fog) {
                const dist = camera.position.distanceTo(viewControl.target);
                fog.near = dist;
                fog.far = dist * fog.mult;
            }
            // todo: option to clip for close views
            // camera.near = dist / 2;
            // camera.updateProjectionMatrix();
        },

        lightInfo: () => {
            setTimeout(updateLights, 0);
            return lightInfo;
        }
    },

    world: {
        add: function(o) {
            return WORLD.add(o);
        },

        remove: function(o) {
            THREE.dispose(o);
            return WORLD.remove(o);
        },

        newGroup: function() {
            return WORLD.newGroup();
        }
    },

    platform: {
        set:        setPlatform,
        update:     updateDraws,
        setSize:    setPlatformSizeUpdateGrid,
        setColor:   setPlatformColor,
        setOrigin,
        setRulers,
        setGrid,
        setGridColor,
        setFont,
        setRound,
        showAxes,
        showVolume,
        showGridBelow: (b) => { hideGridBelow = !b },
        showGrid:   (b) => { showGrid = grid.view.visible = b },
        showGrid2:  (b) => { showGridLines = grid.lines.visible = b },
        setMaxZ:    (z) => { panY = z / 2 },
        setCenter:  (x,y,z) => { panX = x; panY = z, panZ = y },
        setHidden:  (b) => { showPlatform = !b; platform.visible = !b },
        setVisible: (b) => { showPlatform = b; platform.visible = b },
        setHiding:  (b) => { hidePlatformBelow = b },
        setZOff:    (z) => { platformZOff = z; updatePlatformPosition() },
        setGridZOff:(z) => { gridZOff = z; updatePlatformPosition() },
        setBelt:    (b) => { platformBelt = b },
        isHidden:   ()  => { return !showPlatform },
        isVisible:  ()  => { return platform.visible },
        isGridVisible()    { return grid.view.visible },
        opacity:    (o) => { platform.material.opacity = o; Space.platform.setVisible(o > 0) },
        onMove:     (f,t) => { platformOnMove = f, platformOnMoveTime = t || platformOnMoveTime },
        onHover:    (f) => { platformHover = f },
        onClick:    (f) => { platformClick = f},
        size:       ()  => { return platform.scale },
        get world() { throw "platform.world deprecated" }
    },

    preset: {
        top:    {left: 0,    up: 0,   panX, panY, panZ},
        back:   {left: PI,   up: PI2, panX, panY, panZ},
        home:   {left: home, up,      panX, panY, panZ},
        front:  {left: 0,    up: PI2, panX, panY, panZ},
        right:  {left: PI2,  up: PI2, panX, panY, panZ},
        left:   {left: -PI2, up: PI2, panX, panY, panZ},
    },

    view: {
        top:    (then) => { runPreset(0,     0,   then) },
        bottom: (then) => { runPreset(0,     PI,  then) },
        back:   (then) => { runPreset(PI,    PI2, then) },
        home:   (then) => { runPreset(home,  up,  then) },
        front:  (then) => { runPreset(0,     PI2, then) },
        right:  (then) => { runPreset(PI2,   PI2, then) },
        left:   (then) => { runPreset(-PI2,  PI2, then) },
        reset:  ()     => {
            viewControl.reset();
            requestRefresh()
        },
        load: (cam)  => {
            viewControl.setPosition(cam);
            requestRefresh();
        },
        save: () => {
            return viewControl.getPosition(true);
        },
        panTo: (x,y,z,l,u,t,upVec) => {
            tweenCamPan(x,y,z,l,u,t,upVec);
        },
        setZoom: (r,v) => {
            viewControl.setZoom(r,v);
        },
        fit: (then, opts = {}) => {
            // Calculate bounding box of all objects in the workspace
            const box = new THREE.Box3();
            let hasObjects = false;
            const visibleOnly = opts.visibleOnly !== undefined ? !!opts.visibleOnly : fitVisibleOnly;
            const targetObjects = Array.isArray(opts.objects) ? opts.objects.filter(Boolean) : null;

            if (targetObjects && targetObjects.length) {
                // Fit only the supplied objects (selection-driven fit in app code)
                for (const obj of targetObjects) {
                    if (!obj) continue;
                    if (visibleOnly && !isEffectivelyVisible(obj)) continue;
                    box.expandByObject(obj);
                    hasObjects = true;
                }
            } else {
                // Recursively expand box for all visible objects with geometry
                WORLD.traverse(obj => {
                    if (!obj.geometry) return;
                    if (visibleOnly && !isEffectivelyVisible(obj)) return;
                    if (obj.visible) {
                        box.expandByObject(obj);
                        hasObjects = true;
                    }
                });
            }

            // If no objects, fall back to platform bounds
            if (!hasObjects) {
                const pw = psize.width / 2;
                const pd = psize.depth / 2;
                const ph = psize.maxz || psize.height;
                // Set bounds in WORLD local space, then transform to scene
                const minLocal = new THREE.Vector3(-pw, -pd, 0);
                const maxLocal = new THREE.Vector3(pw, pd, ph);
                minLocal.applyMatrix4(WORLD.matrixWorld);
                maxLocal.applyMatrix4(WORLD.matrixWorld);
                box.min.copy(minLocal);
                box.max.copy(maxLocal);
            }

            // Calculate center and size in scene coordinates
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Use the maximum dimension for distance calculation
            const maxDim = Math.max(size.x, size.y, size.z);
            // Get target view angles (may be overridden by caller)
            const pos = viewControl.getPosition();
            const left = opts.left !== undefined ? opts.left : pos.left;
            const upAngle = opts.up !== undefined ? opts.up : pos.up;

            // Calculate desired camera distance based on bounding box
            const padding = opts.padding || (camera.isOrthographicCamera ? fitPaddingOrthographic : fitPaddingPerspective);
            let desiredDistance;
            let orthoScaleSaveTarget = null;

            if (camera.isPerspectiveCamera) {
                // For perspective, calculate distance to fit object in view
                const fov = camera.fov * (Math.PI / 180);
                // Use maxDim directly (not half) for more conservative framing
                desiredDistance = maxDim / Math.tan(fov / 2) * padding;
            } else {
                // For orthographic, fit based on camera-plane extents (not perspective distance).
                // This avoids chronic over-zoom-out in ortho mode.
                const min = box.min;
                const max = box.max;
                const corners = [
                    new THREE.Vector3(min.x, min.y, min.z),
                    new THREE.Vector3(min.x, min.y, max.z),
                    new THREE.Vector3(min.x, max.y, min.z),
                    new THREE.Vector3(min.x, max.y, max.z),
                    new THREE.Vector3(max.x, min.y, min.z),
                    new THREE.Vector3(max.x, min.y, max.z),
                    new THREE.Vector3(max.x, max.y, min.z),
                    new THREE.Vector3(max.x, max.y, max.z)
                ];

                const requestedView = opts.left !== undefined || opts.up !== undefined || !!opts.upVec;
                let camMinX = Infinity;
                let camMaxX = -Infinity;
                let camMinY = Infinity;
                let camMaxY = -Infinity;
                if (requestedView) {
                    const viewDir = viewDirectionFromAngles(left, upAngle);
                    let upVec = null;
                    if (opts.upVec) {
                        upVec = new THREE.Vector3(opts.upVec.x || 0, opts.upVec.y || 0, opts.upVec.z || 0);
                        if (upVec.lengthSq() > 1e-12) upVec.normalize();
                    }
                    if (!upVec) {
                        upVec = snapUpForViewDirection(viewDir, camera.up) || camera.up.clone();
                    }
                    upVec = upVec.projectOnPlane(viewDir);
                    if (upVec.lengthSq() < 1e-8) {
                        upVec = new THREE.Vector3(0, 1, 0).projectOnPlane(viewDir);
                    }
                    if (upVec.lengthSq() < 1e-8) {
                        upVec = new THREE.Vector3(1, 0, 0).projectOnPlane(viewDir);
                    }
                    upVec.normalize();
                    const rightVec = upVec.clone().cross(viewDir).normalize();
                    for (const corner of corners) {
                        const x = corner.dot(rightVec);
                        const y = corner.dot(upVec);
                        if (x < camMinX) camMinX = x;
                        if (x > camMaxX) camMaxX = x;
                        if (y < camMinY) camMinY = y;
                        if (y > camMaxY) camMaxY = y;
                    }
                } else {
                    camera.updateMatrixWorld(true);
                    const inv = camera.matrixWorldInverse;
                    for (const corner of corners) {
                        corner.applyMatrix4(inv);
                        if (corner.x < camMinX) camMinX = corner.x;
                        if (corner.x > camMaxX) camMaxX = corner.x;
                        if (corner.y < camMinY) camMinY = corner.y;
                        if (corner.y > camMaxY) camMaxY = corner.y;
                    }
                }
                const spanX = Math.max(1e-6, camMaxX - camMinX);
                const spanY = Math.max(1e-6, camMaxY - camMinY);
                const frustumW = Math.max(1e-6, Math.abs(camera.right - camera.left));
                const frustumH = Math.max(1e-6, Math.abs(camera.top - camera.bottom));
                const fitX = spanX / frustumW;
                const fitY = spanY / frustumH;
                // Keep historical fit padding semantics: lower padding => more margin.
                orthoScaleSaveTarget = Math.max(fitX, fitY) / Math.max(1e-6, padding);
            }

            // Map scene coordinates to pan coordinates
            // The target position in orbit control is in scene space
            const newPanX = center.x;
            const newPanY = center.y;
            const newPanZ = center.z;
            const currentScaleSave = viewControl.getPosition({ scaled: true }).scale || 1;
            const currentDistToCenter = camera.position.distanceTo(center);

            const fitPos = {
                left,
                up: upAngle,
                panX: newPanX,
                panY: newPanY,
                panZ: newPanZ,
            };
            let fitScaleRatio = 1;

            if (camera.isPerspectiveCamera) {
                fitScaleRatio = desiredDistance / currentDistToCenter;
            } else {
                // For orthographic, set the absolute target zoom scale directly.
                const targetScaleSave = Number.isFinite(orthoScaleSaveTarget) ? orthoScaleSaveTarget : currentScaleSave;
                fitScaleRatio = targetScaleSave / currentScaleSave;
            }

            // Guard against degenerate center/camera overlap.
            if (!isFinite(fitScaleRatio) || fitScaleRatio <= 0) {
                fitScaleRatio = 1;
            }

            if (opts.tween !== false) {
                if (opts.upVec) {
                    fitPos.upVec = opts.upVec;
                }
                fitPos.scale = fitScaleRatio;
                fitPos.time = opts.time ?? 350;
                fitPos.then = then;
                tweenCam(fitPos);
            } else {
                if (opts.upVec && camera) {
                    const upNow = new THREE.Vector3(opts.upVec.x || 0, opts.upVec.y || 0, opts.upVec.z || 0);
                    if (upNow.lengthSq() > 1e-12) {
                        camera.up.copy(upNow.normalize());
                    }
                }
                viewControl.setPosition(fitPos);
                viewControl.setPosition({ scale: fitScaleRatio });
                viewControl.update();
                if (typeof(then) === 'function') then();
            }
        },
        setCtrl: (name) => {
            const nextMode = name || 'default';
            const wantsTrackball = nextMode === 'void';
            const hasTrackball = !!viewControl?.isTrackballAdapter;
            controlMode = nextMode;

            if (viewControl && wantsTrackball !== hasTrackball) {
                const position = viewControl.getPosition(true);
                const target = viewControl.getTarget().clone();
                const minDistance = viewControl.minDistance;
                const maxDistance = viewControl.maxDistance;
                const noKeys = viewControl.noKeys;
                const enabled = viewControl.enabled;
                const reverseZoom = viewControl.reverseZoom;
                const zoomSpeed = viewControl.zoomSpeed;

                if (viewControl.dispose) {
                    viewControl.dispose();
                }

                viewControl = createViewControl(camera, container, onViewControlMove, onViewControlZoom);
                viewControl.noKeys = noKeys;
                viewControl.minDistance = minDistance;
                viewControl.maxDistance = maxDistance;
                viewControl.enabled = enabled;
                viewControl.reverseZoom = reverseZoom;
                viewControl.zoomSpeed = zoomSpeed;
                viewControl.setTarget(target);
                viewControl.setPosition(position);
            }
            applyControlBindings();
        },
        setFitVisibleOnly: (enabled) => {
            fitVisibleOnly = !!enabled;
        },
        setFitPadding: (next = {}) => {
            if (Number.isFinite(next.perspective) && next.perspective > 0) {
                fitPaddingPerspective = next.perspective;
            }
            if (Number.isFinite(next.orthographic) && next.orthographic > 0) {
                fitPaddingOrthographic = next.orthographic;
            }
        },
        getFPS () { return fps },
        getRMS() { return renderTime },
        getFocus() { return viewControl.getTarget() },
        setFocus(v) {
            viewControl.setTarget(v);
            updateFocus();
            refresh()
        },
        showFocus(ms) {
            showFocus = ms;
            updateFocus();
        },
        setHome(r,u) {
            home = r ?? 0;
            up = u ?? PI4;
        },
        spin(then, count) {
            Space.view.front(() => {
            Space.view.right(() => {
            Space.view.back(() => {
            Space.view.left(() => {
                if (--count > 0) {
                    Space.view.spin(then, count);
                } else {
                    Space.view.front(then);
                }
            });
            });
            });
            });
        },
        get ctrl() {
            return viewControl;
        },
        setProjection(type) {
            Space.setProjection(type);
        },
        getProjection() {
            return cameraType;
        }
    },

    mouse: {
        up:         (f) => { mouseUp = f },
        down:       (f) => { mouseDown = f },
        downSelect: (f) => { mouseDownSelect = f },
        upSelect:   (f) => { mouseUpSelect = f },
        onDrag:     (f) => { mouseDrag = f },
        onHover:    (f,n) => { mouseHover = f, mouseHoverNull = n }
    },

    tracking: {
        /**
         * Set tracking plane mode
         * @param {string} mode - 'platform', 'camera-aligned', or 'world-xy'
         */
        setMode(mode) {
            if (['platform', 'camera-aligned', 'world-xy'].includes(mode)) {
                trackingMode = mode;
                updateTrackingPlane();
                requestRefresh();
            }
        },

        /**
         * Set distance from camera for camera-aligned mode
         * @param {number} distance - Distance in world units
         */
        setDistance(distance) {
            trackingDistance = distance;
            if (trackingMode === 'camera-aligned') {
                updateTrackingPlane();
                requestRefresh();
            }
        },

        /**
         * Get current tracking mode
         */
        getMode() {
            return trackingMode;
        },

        /**
         * Get tracking plane object (for advanced use)
         */
        getPlane() {
            return trackPlane;
        }
    },

    isFocused: inputHasFocus,

    tween: {
        setTime:    (t) => { tweenTime = t || 500 },
        setDelay:   (d) => { tweenDelay = d || 20 }
    },

    useDefaultKeys  (b)    { defaultKeys = b  },
    selectRecurse   (b)    { selectRecurse = b },
    renderInfo      ()     { return renderer.info },
    objects         ()     { return WORLD.children },

    screenshot(format, options) {
        return renderer.domElement.toDataURL(format || "image/png", options);
    },

    screenshot2(param = {}) {
        let oco = renderer.domElement;
        let oWidth = oco.offsetWidth;
        let oHeight = oco.offsetHeight;
        let oRatio = oHeight / oWidth;
        let width = param.width || 240;
        let ncv = document.createElement('canvas');
        ncv.width = width;
        ncv.height = width * oRatio;
        let nco = ncv.getContext('2d');
        nco.drawImage(oco, 0, 0, ncv.width, ncv.height);
        return {
            url: ncv.toDataURL(param.format || "image/png", param.options),
            width: ncv.width,
            height: ncv.height,
        };
    },

    screenshot3(param = {}) {
        let oco = renderer.domElement;
        let oWidth = oco.offsetWidth;
        let oHeight = oco.offsetHeight;
        let oRatio = oWidth / oHeight;
        let width = param.width || 512;
        let height = param.height || width;
        let nRatio = width / height;
        let ncv = document.createElement('canvas');
        ncv.width = width;
        ncv.height = height;
        let nco = ncv.getContext('2d');
        let ox = 0, oy = 0;
        if (oRatio > nRatio) {
            let tmp = oWidth;
            oWidth = oHeight * nRatio;
            ox = (tmp - oWidth) / 2;
        } else {
            let tmp = oHeight;
            oHeight = oWidth * nRatio;
            oy = (tmp - oHeight) / 2;
        }
        nco.drawImage(oco, ox, oy, oWidth, oHeight, 0, 0, width, height);
        if (param.out) {
            ncv.toBlob(blob => blob.arrayBuffer().then(png => param.out({ png, width, height })));
        }
        return ncv;
    },

    internals() {
        return { renderer, camera, platform, container, raycaster };
    },

    isOrtho() {
        return type === 'orthographic';
    },

    isPerspective() {
        return type === 'perspective';
    },

    setProjection: (type) => {
        if (!camera || !viewControl || !initialized) {
            console.warn('Space not initialized');
            return;
        }
        if (type === cameraType) {
            return; // already set
        }
        if (type !== 'orthographic' && type !== 'perspective') {
            console.warn('Invalid camera type:', type);
            return;
        }

        // Save current view state
        const position = viewControl.getPosition(true);
        const target = viewControl.getTarget().clone();
        const distance = camera.position.distanceTo(target);

        // Create new camera
        let newCamera;
        if (type === 'orthographic') {
            const asp = aspect();
            // Calculate ortho size based on perspective distance and FOV
            const size = distance * Math.tan(perspective * Math.PI / 180 / 2);
            newCamera = new THREE.OrthographicCamera(
                -size * asp, size * asp, size, -size, -10000, 100000
            );
        } else {
            newCamera = new THREE.PerspectiveCamera(
                perspective, aspect(), 0.1, 100000
            );
        }

        // Copy camera position
        newCamera.position.copy(camera.position);
        if (controlMode === 'void') {
            newCamera.up.copy(camera.up);
        } else {
            newCamera.up.set(0, 1, 0);
        }
        newCamera.lookAt(target);

        // Store old control properties
        const minDistance = viewControl.minDistance;
        const maxDistance = viewControl.maxDistance;
        const noKeys = viewControl.noKeys;
        const enabled = viewControl.enabled;
        const reverseZoom = viewControl.reverseZoom;
        const zoomSpeed = viewControl.zoomSpeed;

        // Swap camera
        const oldCamera = camera;
        camera = newCamera;
        cameraType = type;

        // Recreate viewControl with new camera and proper callbacks
        if (viewControl?.dispose) {
            viewControl.dispose();
        }
        viewControl = createViewControl(camera, container, onViewControlMove, onViewControlZoom);
        viewControl.noKeys = noKeys;
        viewControl.minDistance = minDistance;
        viewControl.maxDistance = maxDistance;
        viewControl.enabled = enabled;
        viewControl.reverseZoom = reverseZoom;
        viewControl.zoomSpeed = zoomSpeed;
        applyControlBindings();
        viewControl.setPosition(position);

        // Dispose old camera
        THREE.dispose(oldCamera);

        // Update camera-dependent systems
        if (cameraLight) {
            cameraLight.position.copy(camera.position);
        }
        if (grid?.origin?.scale) {
            grid.origin.scale();
        }

        requestRefresh();
    },

    init: (domelement, slider, ortho) => {
        container = domelement;
        sliderCallback = slider;

        WORLD.rotation.x = -PI2;
        SCENE.add(WORLD);

        domelement.style.width = width();
        domelement.style.height = height();

        renderer = new WebGLRenderer({
            antialias: antiAlias,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true
        });

        // THREE.ColorManagement.enabled = false;
        // renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        renderer.localClippingEnabled = true;
        cameraType = ortho ? 'orthographic' : 'perspective';
        camera = ortho ?
            new THREE.OrthographicCamera(-100 * aspect(), 100 * aspect(), 100, -100, -10000, 100000) :
            new THREE.PerspectiveCamera(perspective, aspect(), 0.1, 100000);

        camera.position.set(0, 200, 340);
        renderer.setSize(width(), height());
        domelement.appendChild(renderer.domElement);

        raycaster = new THREE.Raycaster();

        sliderCallback = slider;
        viewControl = createViewControl(camera, domelement, onViewControlMove, onViewControlZoom);

        viewControl.noKeys = true;
        viewControl.minDistance = 1;
        viewControl.maxDistance = 1000;
        applyControlBindings();

        SCENE.add(skyAmbient = new THREE.AmbientLight(0x707070));

        platform = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            platformMaterial
        );

        platform.position.y = platformZOff;
        platform.rotation.x = -PI2;
        platform.visible = showPlatform;

        trackPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(100000, 100000, 1, 1),
            new THREE.MeshBasicMaterial( { color: 0x777777, opacity: 0, transparent: true } )
        );
        trackPlane.visible = false;
        trackPlane.rotation.x = PI2;

        let skygrid = new THREE.Mesh(
            new THREE.BoxGeometry(10000, 10000, 10000, 10, 10, 10),
            skyGridMaterial =
            new THREE.MeshBasicMaterial({ color: skyGridColor, side: THREE.DoubleSide })
        );

        SCENE.add(platform);
        SCENE.add(trackPlane);

        if (showSkyGrid) {
            skygrid.material.wireframe = true;
            SCENE.add(skygrid);
        }

        addEventHandlers(WIN, [
            'resize', onResize,
            'mousemove', onMouseMove,
            'mousedown', onMouseDown,
            'mouseup', onMouseUp,
            'keypress', keyHandler,
            'touchstart', updateLastAction,
            'touchmove', updateLastAction,
            'touchend', updateLastAction
        ]);

        let animates = 0;
        let rateStart = Date.now();
        let renderStart;
        let renders = [];

        function animate() {
            animates++;
            const now = Date.now();
            if (now - rateStart > 1000) {
                // compute stats roughly every second
                const delta = now - rateStart;
                fps = 1000 * animates / delta;
                animates = 0;
                rateStart = now;
                // look for slowest rendered frame
                renderTime = Math.max(0, ...renders);
                renders.length = 0;
            }
            requestAnimationFrame(animate);
            if (docVisible && !freeze && Date.now() - lastAction < 1500) {
                renderStart = Date.now();
                renderer.render(SCENE, camera);
                // call after-render callbacks (e.g., for viewcube)
                for (const callback of afterRenderCallbacks) {
                    callback(renderer);
                }
                // track frame render times
                renders.push(Date.now() - renderStart);
            } else {
                fps = 0;
            }
        }

        animate();

        const ctx = renderer.getContext();

        Space.info = {
            ver: ctx.getParameter(ctx.VERSION),
            ven: ctx.getParameter(ctx.VENDOR),
            glr: ctx.getParameter(ctx.RENDERER),
            pla: nav.platform,
            mob: nav.maxTouchPoints > 1 || (/android/i.test(nav.userAgent))
        };

        initialized = true;

        // Initialize tracking plane orientation
        updateTrackingPlane();
    }
};

let cycle = [
    Space.view.front,
    Space.view.right,
    Space.view.back,
    Space.view.left,
];

let cycleInd = 0;

export const space = Space;
