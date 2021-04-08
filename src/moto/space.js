/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.moto) self.moto = {};

    let MOTO = self.moto,
        WIN = window,
        DOC = document,
        SCENE = new THREE.Scene(),
        WORLD = new THREE.Group(),
        WC = WORLD.children,
        PI = Math.PI,
        PI2 = PI / 2,
        PI4 = PI / 4,
        ROUND = Math.round,
        panX = 0,
        panY = 0,
        panZ = 0,
        home = 0,
        gridZOff = 0,
        tweenTime = 500,
        tweenDelay = 20,
        platformZOff = 0,
        perspective = 35,
        refreshTimeout = null,
        refreshRequested = false,
        selectRecurse = false,
        defaultKeys = true,
        lightIntensity = 0.3,
        initialized = false,
        alignedTracking = false,
        skyColor = 0xbbbbbb,
        skyGridColor = 0xcccccc,
        skyMaterial = undefined,
        skyGridMaterial = undefined,
        showSkyGrid = false,
        showPlatform = true,
        hidePlatformBelow = true,
        origin = {x:0, y:0, z: 0},
        trackcam = addLight(0, 0, 0, lightIntensity/3),
        trackDelta = {x:0, y:0, z:0},
        mouse = {x: 0, y: 0},
        mouseStart = null,
        mouseDragPoint = null,
        mouseDragStart = null,
        mouseDownSelect,
        mouseUpSelect,
        mouseUp,
        mouseDown,
        mouseHover,
        mouseDrag,
        grid = {
            origin: origin,
            unitMinor: 0,
            unitMajor: 0,
            colorMinor: 0,
            colorMajor: 0,
            zoff: 0,
            view: undefined
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
        timers = {},
        fontColor = '#333333',
        fontScale = 1.4, // computed relative to grid size
        rulerColor,
        axisColor,
        axesOn = true,
        volumeOn = true,
        viewControl,
        trackPlane,
        platform,
        platformHover,
        platformClick,
        platformClickAt,
        platformOnMove,
        platformMoveTimer,
        volume,
        light1,
        light2,
        light3,
        light4,
        light5,
        camera,
        renderer,
        container,
        raycaster,
        freezeTo,
        freeze,
        isRound = false,
        platformMaterial = new THREE.MeshPhongMaterial({
            color: 0xeeeeee,
            specular: 0xeeeeee,
            shininess: 0,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        }),
        hiddenKey,
        vizChange,
        docVisible = true,
        lastAction = Date.now(),
        fps = 0;

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

    function updateLastAction() {
        lastAction = Date.now();
    }

    function delayed(key, time, fn) {
        clearTimeout(timers[key]);
        timers[key] = setTimeout(fn, time);
    }

    /** ******************************************************************
     * TWEENing Functions
     ******************************************************************* */

    function tweenit() {
        TWEEN.update();
        setTimeout(tweenit, tweenDelay);
    }

    tweenit();

    function tweenCamPan(x,y,z) {
        updateLastAction();
        let pos = viewControl.getPosition();
        pos.panX = x;
        pos.panY = y;
        pos.panZ = z;
        tweenCam(pos);
    }

    function tweenCam(pos) {
        let tf = function () {
            viewControl.setPosition(this);
            updateLastAction();
            refresh();
        };
        let from = Object.clone(viewControl.getPosition());
        let to = Object.clone(pos);
        let dist = Math.abs(from.left - to.left);
        if (dist > Math.PI) {
            if (from.left < to.left) {
                from.left += Math.PI * 2;
            } else {
                from.left -= Math.PI * 2;
            }
        }
        new TWEEN.Tween(from).
            to(to, tweenTime).
            onUpdate(tf).
            onComplete(() => {
                viewControl.setPosition(pos);
                updateLastAction();
                refresh();
                if (pos.then) pos.then();
            }).
            start();
    }

    function tweenPlatform(w,h,d) {
        let from = {x: platform.scale.x, y: platform.scale.y, z: platform.scale.z},
            to = {x:w, y:h, z:d},
            start = function() {
                setGrid();
            },
            update = function() {
                setPlatformSize(this.x, this.y, this.z);
                updateLastAction();
                refresh();
            },
            complete = function() {
                setGrid();
            };
        new TWEEN.Tween(from).
            to(to, tweenTime).
            onStart(start).
            onUpdate(update).
            onComplete(complete).
            start();
    }

    /** ******************************************************************
     * Utility Functions
     ******************************************************************* */

    function width() { return WIN.innerWidth }

    function height() { return WIN.innerHeight }

    function aspect() { return width() / height() }

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

    function addLight(x,y,z,i) {
        let l = new THREE.PointLight(0xffffff, i, 0);
        l.position.set(x,y,z);
        SCENE.add(l);
        return l;
    }

    function updatePlatformPosition() {
        if (isRound) {
            platform.position.y = -platform.scale.y/2 - platformZOff;
        } else {
            platform.position.y = -platform.scale.z/2 - platformZOff;
        }
        requestRefresh();
    }

    function setPlatformSize(width, depth, height, maxz) {
        if (isRound) {
            platform.scale.set(width || 300, height || 5, depth || 175);
        } else {
            platform.scale.set(width || 300, depth || 175, height || 5);
        }
        viewControl.maxDistance = Math.max(width,depth) * 4;
        updatePlatformPosition();
        let y = Math.max(width, height) * 1;
        light1.position.set( width, y,  depth);
        light2.position.set(-width, y, -depth);
        light4.position.set( width, light4.position.y, -depth);
        light5.position.set(-width, light5.position.y,  depth);
        if (volume) {
            SCENE.remove(volume);
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
            SCENE.add(volume = makeLinesFromPoints(points, 0x888888, 0.25));
            setVolume(volumeOn);
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
        if (options.axisColor) axisColor = options.axisColor;
        if (options.rulerColor) rulerColor = options.rulerColor;
        updateRulers();
    }

    function setAxes(bool) {
        axesOn = bool;
        updateRulers();
    }

    function setVolume(bool) {
        volumeOn = bool;
        if (volume) volume.visible = bool;
        requestRefresh();
    }

    function canvasInMesh(w, h, textAlign, textBaseline, color, size) {
        let canvas = document.createElement('canvas'),
            canvasTexture = new THREE.CanvasTexture(canvas),
            plane = new THREE.PlaneGeometry(w, h),
            context = canvas.getContext('2d'),
            scale = 8;

        canvas.width = w * scale;
        canvas.height = h * scale;

        context.scale(scale, scale);
        context.fillStyle = color || fontColor;
        context.font = `${size}px sans-serif`;
        context.textAlign = textAlign;
        context.textBaseline = textBaseline;
        canvasTexture.minFilter = THREE.LinearFilter;

        // set 'transparent' to false to debug mesh bounds
        let material = new THREE.MeshBasicMaterial({transparent: true, map: canvasTexture});
        let mesh = new THREE.Mesh(plane, material);

        return { context, mesh };
    }


    function setRulers(xon = ruler.xon, yon = ruler.yon, factor = ruler.factor, xl = ruler.xlabel, yl = ruler.ylabel) {
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
            zp = -d - platformZOff + gridZOff,
            labelSize = grid.unitMinor * fontScale,
            oldView = ruler.view,
            view = ruler.view = new THREE.Group();

        if (xon && axesOn) {
            let xPadding = labelSize * 4,
                canvas = canvasInMesh(x + xPadding, labelSize * 3, 'center', 'top', rulerColor, labelSize),
                context = canvas.context,
                mesh = canvas.mesh;

            for (let i = 0; i >= ruler.x1; i -= grid.unitMajor) {
                context.fillText((i * factor).round(1).toString(), ruler.xo + i + xPadding / 2, 0);
            }
            for (let i = 0; i <= ruler.x2; i += grid.unitMajor) {
                context.fillText((i * factor).round(1).toString(), ruler.xo + i + xPadding / 2, 0);
            }

            context.font = (labelSize * 0.75) + 'px sans-serif';
            context.fillText(xlabel, (x + xPadding) / 2, labelSize * 1.5);
            mesh.position.set(0, - h - labelSize * 2, zp);
            view.add(mesh);
        }

        if (yon && axesOn) {
            let yPadding = labelSize,
                canvas = canvasInMesh(labelSize * 4, y + yPadding, 'end', 'middle', rulerColor, labelSize),
                context = canvas.context,
                mesh = canvas.mesh;

            for (let i = 0; i >= ruler.y1; i -= grid.unitMajor) {
                context.fillText((i * factor).round(1), labelSize * 4, y - (ruler.yo + i) + yPadding / 2);
            }
            for (let i = 0; i <= ruler.y2; i += grid.unitMajor) {
                context.fillText((i * factor).round(1), labelSize * 4, y - (ruler.yo + i) + yPadding / 2);
            }

            context.font = (labelSize * 0.75) + 'px sans-serif';
            context.fillText(ylabel, labelSize * 1.25, (y + yPadding) / 2);
            mesh.position.set(-w - labelSize * 2 - 5, 0, zp);
            view.add(mesh);
        }

        Space.scene.remove(oldView);
        Space.scene.add(view);
        requestRefresh();
    }

    function setGrid(unitMajor = grid.unitMajor, unitMinor = grid.unitMinor, colorMajor = grid.colorMajor, colorMinor = grid.colorMinor) {
        if (!unitMajor) {
            return;
        }
        if (unitMajor !== grid.unitMajor || unitMinor !== grid.unitMinor) {
            grid.unitMajor = unitMajor;
            grid.unitMinor = unitMinor;
            grid.colorMajor = colorMajor || grid.colorMajor;
            grid.colorMinor = colorMinor || grid.colorMinor;
            updateGrid();
        }
    }

    function modMatch(val, mod) {
        let mv = Math.abs(val) % mod;
        return (mv < 1) || ((mod - mv) < 1);
    }

    function updateGrid() {
        let { view, unitMinor, unitMajor, colorMajor, colorMinor } = grid;
        let oldView = view;
        view = grid.view = new THREE.Group();

        let majors = [],
            minors = [],
            x = platform.scale.x,
            y = isRound ? platform.scale.z : platform.scale.y,
            z = isRound ? platform.scale.y : platform.scale.z,
            zp = -(z / 2) - platformZOff + gridZOff,
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

        for (let x=0; x>x1; x -= unitMinor) {
            let oh = isRound ? Math.sqrt(1-(x/xh)*(x/xh)) * yh : yh;
            let arr = modMatch(x, unitMajor) ? majors : minors;
            arr.append({x:x-xo, y:-oh, z:zp}).append({x:x-xo, y:oh, z:zp});
        }
        for (let x=0; x<x2; x += unitMinor) {
            let oh = isRound ? Math.sqrt(1-(x/xh)*(x/xh)) * yh : yh;
            let arr = modMatch(x, unitMajor) ? majors : minors;
            arr.append({x:x-xo, y:-oh, z:zp}).append({x:x-xo, y:oh, z:zp});
        }
        for (let y=0; y>y1; y -= unitMinor) {
            let ow = isRound ? Math.sqrt(1-(y/yh)*(y/yh)) * xh : xh;
            let arr = modMatch(y, unitMajor) ? majors : minors;
            arr.append({x:-ow, y:y-yo, z:zp}).append({x:ow, y:y-yo, z:zp});
        }
        for (let y=0; y<y2; y += unitMinor) {
            let ow = isRound ? Math.sqrt(1-(y/yh)*(y/yh)) * xh : xh;
            let arr = modMatch(y, unitMajor) ? majors : minors;
            arr.append({x:-ow, y:y-yo, z:zp}).append({x:ow, y:y-yo, z:zp});
        }

        view.add(makeLinesFromPoints(majors, colorMajor || 0x999999, 1));
        view.add(makeLinesFromPoints(minors, colorMinor || 0xcccccc, 1));

        Space.scene.remove(oldView);
        Space.scene.add(grid.view);
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
        updateDraws();
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
        camera.aspect = aspect();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height());
        container.style.width = width();
        container.style.height = height();
        requestRefresh();
    }

    function alignTracking(point, rot, out) {
        if (point && rot) {
            alignedTracking = true;
            trackPlane.position.set(point.x, point.y, point.z);
            trackPlane.rotation.set(rot.x, rot.y, rot.z);
            trackDelta = out;
        } else {
            alignedTracking = false;
            trackPlane.position.set(0, 0, 0);
            trackPlane.rotation.set(PI2, 0, 0);
        }
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

    function makeLinesFromPoints(points, color, opacity) {
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
        return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
            color: color,
            opacity: opacity || 1,
            transparent: opacity != 1
        }));
    }

    function intersect(objects, recurse) {
        return raycaster.intersectObjects(objects, recurse);
    }

    /** ******************************************************************
     * Mouse Functions
     ******************************************************************* */

    function onMouseDown(event) {
        updateLastAction();
        if (event.target === renderer.domElement) {
            DOC.activeElement.blur();
            event.preventDefault();
            let selection = null,
                trackTo = alignedTracking ? trackPlane : platform,
                isVis = trackTo.visible;
            if (mouseDownSelect) selection = mouseDownSelect();
            if (selection && selection.length > 0) {
                trackTo.visible = true;
                let int = intersect(selection.slice().append(trackTo), false);
                trackTo.visible = isVis;
                if (int.length > 0) {
                    let trackInt, selectInt;
                    for (let i=0; i<int.length; i++) {
                        if (!trackInt && int[i].object === trackTo) {
                            trackInt = int[i];
                        } else if (!selectInt && selection.contains(int[i].object)) {
                            selectInt = int[i];
                        }
                    }
                    if (trackInt && selectInt) {
                        mouseDragPoint = trackInt.point.clone();
                        mouseDragStart = mouseDragPoint;
                        viewControl.enabled = false;
                    }
                    if (selectInt) {
                        mouseDownSelect(selectInt, event);
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
        mouseStart = {
            x: (event.clientX / width()) * 2 - 1,
            y: -(event.clientY / height()) * 2 + 1};
    }

    function onMouseUp(event) {
        updateLastAction();
        if (!viewControl.enabled) {
            viewControl.enabled = true;
            viewControl.onMouseUp(event);
        }
        let mouseEnd = {
            x: (event.clientX / width()) * 2 - 1,
            y: -(event.clientY / height()) * 2 + 1};
        // only fire on mouse move between mouseStart (down) and up
        if (mouseStart && mouseEnd.x - mouseStart.x + mouseEnd.y - mouseStart.y === 0) {
            event.preventDefault();
            let refresh = false,
                selection = null;
            if (mouseUpSelect) selection = mouseUpSelect();
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
                    mouseUpSelect(int[0], event);
                    refresh = true;
                } else {
                    mouseUpSelect(null, event);
                }
            }
            if (!refresh && platformClickAt) {
                platformClick(platformClickAt);
            }
            if (refresh) requestRefresh();
            mouseStart = null;
        } else if (mouseDrag && mouseDragStart) {
            mouseDrag(null,null,true);
        }
        mouseDragPoint = null;
        mouseDragStart = null;
    }

    function onMouseMove(event) {
        updateLastAction();
        let int, vis;

        const mv = new THREE.Vector2();
        mv.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        mv.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
        raycaster.setFromCamera( mv, camera );

        if (viewControl.enabled) {
            event.preventDefault();
            let selection = mouseHover ? mouseHover() : null;
            if (selection && selection.length > 0) {
                int = intersect(selection, selectRecurse);
                if (int.length > 0) mouseHover(int[0], event, int);
            }
            if ((!int || int.length == 0) && platformHover) {
                vis = platform.visible;
                platform.visible = true;
                int = intersect([platform], false);
                platform.visible = vis;
                if (int && int.length > 0) platformHover(int[0].point);
            }
        } else if (mouseDragPoint && mouseDrag && mouseDrag()) {
            event.preventDefault();
            let trackTo = alignedTracking ? trackPlane : platform;
            let vis = trackTo.visible;
            trackTo.visible = true;
            int = intersect([trackTo], false);
            trackTo.visible = vis;
            if (int.length > 0 && int[0].object === trackTo) {
                let delta = mouseDragPoint.clone().sub(int[0].point);
                let offset = mouseDragStart.clone().sub(int[0].point);
                mouseDragPoint = int[0].point;
                mouseDrag({x: -delta.x, y: delta.z}, offset.multiplyVectors(offset, trackDelta));
                requestRefresh();
            }
        }
        mouse = {
            x: (event.clientX / width()) * 2 - 1,
            y: -(event.clientY / height()) * 2 + 1};
    }

    /** ******************************************************************
     * Space Object
     ******************************************************************* */

    let Space = MOTO.Space = {
        alignTracking: alignTracking,
        addEventListener: addEventListener,
        addEventHandlers: addEventHandlers,
        onEnterKey: onEnterKey,
        onResize: onResize,
        update: requestRefresh,
        raycast: intersect,
        refresh: refresh,

        showSkyGrid: function(b) {
            showSkyGrid = b;
        },

        setSkyColor: function(c) {
            skyColor = c;
            if (skyMaterial) skyMaterial.color = new THREE.Color(c);
        },

        setSkyGridColor: function(c) {
            skyGridColor = c;
            if (skyGridMaterial) skyGridMaterial.color = new THREE.Color(c);
        },

        scene: {
            add: function (o) {
                o.rotation.x = WORLD.rotation.x;
                return SCENE.add(o);
            },
            remove: function (o) {
                return SCENE.remove(o);
            },
            active: updateLastAction
        },

        world: {
            add: function(o) {
                WORLD.add(o);
            },
            remove: function(o) {
                WORLD.remove(o);
            }
        },

        platform: {
            update:    updateDraws,
            tweenTo:   tweenPlatform,
            setSize:   setPlatformSizeUpdateGrid,
            setColor:  setPlatformColor,
            setOrigin: setOrigin,
            setRulers: setRulers,
            setGrid:   setGrid,
            setFont:   setFont,
            setAxes:   setAxes,
            setVolume: setVolume,
            add:       function(o) { WORLD.add(o) },
            remove:    function(o) { WORLD.remove(o) },
            setMaxZ:   function(z) { panY = z / 2 },
            setCenter: function(x,y,z) { panX = x; panY = z, panZ = y },
            isHidden:  function()  { return !showPlatform },
            setHidden: function(b) { showPlatform = !b; platform.visible = !b },
            setHiding: function(b) { hidePlatformBelow = b },
            setZOff:   function(z) { platformZOff = z; updatePlatformPosition() },
            setGZOff:  function(z) { gridZOff = z; updatePlatformPosition() },
            opacity:   function(o) { platform.material.opacity = o },
            onMove:    function(f) { platformOnMove = f },
            onHover:   function(f) { platformHover = f },
            onClick:   function(f) { platformClick = f},
            size:      function()  { return platform.scale },
            isVisible: function()  { return platform.visible },
            showGrid:  function(b) { grid.view.visible = b },
            setRound:  function(bool) {
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
            },
            world: WORLD
        },

        view: {
            top:   function(then)  { tweenCam({left: home, up: 0,   panX, panY, panZ, then}) },
            back:  function(then)  { tweenCam({left: PI,   up: PI2, panX, panY, panZ, then}) },
            home:  function(then)  { tweenCam({left: home, up: PI4, panX, panY, panZ, then}) },
            front: function(then)  { tweenCam({left: 0,    up: PI2, panX, panY, panZ, then}) },
            right: function(then)  { tweenCam({left: PI2,  up: PI2, panX, panY, panZ, then}) },
            left:  function(then)  { tweenCam({left: -PI2, up: PI2, panX, panY, panZ, then}) },
            reset: function()    { viewControl.reset(); requestRefresh() },
            load:  function(cam) { viewControl.setPosition(cam) },
            save:  function()    { return viewControl.getPosition(true) },
            panTo: function(x,y,z) { tweenCamPan(x,y,z) },
            setZoom: function(r,v) { viewControl.setZoom(r,v) },
            setCtrl: function(name) {
                if (name === 'onshape') {
                    viewControl.setMouse(viewControl.mouseOnshape);
                } else {
                    viewControl.setMouse(viewControl.mouseDefault);
                }
            },
            getFPS: function() { return fps },
            getFocus: function() { return viewControl.getTarget() },
            setFocus: function(v) {
                viewControl.setTarget(v);
                refresh();
            },
            setHome: function(r) {
                home = r || 0;
            },
            spin: function(then, count) {
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
            }
        },

        mouse: {
            up:         function(f) { mouseUp = f },
            down:       function(f) { mouseDown = f },
            downSelect: function(f) { mouseDownSelect = f },
            upSelect:   function(f) { mouseUpSelect = f },
            onDrag:     function(f) { mouseDrag = f },
            onHover:    function(f) { mouseHover = f }
        },

        useDefaultKeys: function(b) {
            defaultKeys = b;
        },

        selectRecurse: function(b) {
            selectRecurse = b;
        },

        setTweenTime: function(t) {
            tweenTime = t || 500;
        },

        setTweenDelay: function(d) {
            tweenDelay = d || 20;
        },

        objects: function() {
            return WC;
        },

        screenshot: function(format) {
            return renderer.domElement.toDataURL(format || "image/png");
        },

        internals: function() {
            return { renderer, camera, platform };
        },

        init: function(domelement, slider, ortho) {
            container = domelement;

            WORLD.rotation.x = -PI2;
            SCENE.add(WORLD);

            domelement.style.width = width();
            domelement.style.height = height();

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                preserveDrawingBuffer: true
            });
            camera = ortho ?
                new THREE.OrthographicCamera(-100 * aspect(), 100 * aspect(), 100, -100, 0.1, 100000) :
                new THREE.PerspectiveCamera(perspective, aspect(), 5, 100000);

            camera.position.set(0, 200, 340);
            renderer.setSize(width(), height());
            domelement.appendChild(renderer.domElement);

            raycaster = new THREE.Raycaster();

            viewControl = new MOTO.CTRL(camera, domelement, function (position, moved) {
                if (platform) {
                    platform.visible = hidePlatformBelow ?
                        initialized && position.y >= 0 && showPlatform : showPlatform;
                }
                if (trackcam) {
                    trackcam.position.copy(camera.position);
                }
                if (moved && platformOnMove) {
                    clearTimeout(platformMoveTimer);
                    platformMoveTimer = setTimeout(platformOnMove, 500);
                }
                updateLastAction();
            }, (val) => {
                updateLastAction();
                if (slider) slider(val);
            });

            viewControl.noKeys = true;
            viewControl.maxDistance = 1000;

            SCENE.add(new THREE.AmbientLight(0x707070));

            light1 = addLight( 200,  250,  200, lightIntensity * 1.15);
            light2 = addLight(-200,  250, -200, lightIntensity * 0.95);
            light3 = addLight(   0, -200,    0, lightIntensity * 0.5);
            light4 = addLight( 200,    5, -200, lightIntensity * 0.35);
            light5 = addLight(-200,    5,  200, lightIntensity * 0.4);

            platform = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                platformMaterial
            );

            platform.position.y = platformZOff;
            platform.rotation.x = -PI2;
            platform.visible = showPlatform;

            trackPlane = new THREE.Mesh(
                new THREE.PlaneBufferGeometry(100000, 100000, 1, 1),
                new THREE.MeshBasicMaterial( { color: 0x777777, opacity: 0, transparent: true } )
            );
            trackPlane.visible = false;
            trackPlane.rotation.x = PI2;

            let sky = new THREE.Mesh(
                    new THREE.BoxGeometry(50000, 50000, 50000, 1, 1, 1),
                    skyMaterial =
                    new THREE.MeshBasicMaterial({ color: skyColor, side: THREE.DoubleSide })
                ),
                skygrid = new THREE.Mesh(
                    new THREE.BoxGeometry(5000, 5000, 5000, 10, 10, 10),
                    skyGridMaterial =
                    new THREE.MeshBasicMaterial({ color: skyGridColor, side: THREE.DoubleSide })
                );


            SCENE.add(platform);
            SCENE.add(trackPlane);
            SCENE.add(sky);

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

            function animate() {
                animates++;
                const now = Date.now();
                if (now - rateStart > 1000) {
                    const delta = now - rateStart;
                    fps = 1000 * animates / delta;
                    animates = 0;
                    rateStart = now;
                }

                requestAnimationFrame(animate);
                if (docVisible && !freeze && Date.now() - lastAction < 1500) {
                    renderer.render(SCENE, camera);
                }
            }

            animate();

            const ctx = renderer.getContext();
            const ext = ctx.getExtension('WEBGL_debug_renderer_info');
            const nav = navigator;
            Space.info = {
                ver: ctx.getParameter(ctx.VERSION),
                ven: ctx.getParameter(ctx.VENDOR),
                glr: ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL),
                // glv: ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL),
                pla: nav.platform
            },

            initialized = true;
        }
    };
    let cycle = [
        Space.view.front,
        Space.view.right,
        Space.view.back,
        Space.view.left,
    ];
    let cycleInd = 0;

})();
