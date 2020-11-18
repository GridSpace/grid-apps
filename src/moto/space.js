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
        panY = 0,
        gridZOff = 0,
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
        trackcam = addLight(0, 0, 0, lightIntensity/3),
        trackDelta = {x:0, y:0, z:0},
        mouse = {x: 0, y: 0},
        mouseStart = null,
        mouseDragPoint = null,
        mouseDragStart = null,
        mouseDownSelect,
        mouseUpSelect,
        mouseHover,
        mouseDrag,
        gridOrigin,
        gridUnitMinor,
        gridUnitMajor,
        gridColorMajor,
        gridColorMinor,
        gridView,
        rulersView,
        rulerXFirst = null,
        rulerXLast = null,
        rulerYFirst = null,
        rulerYLast = null,
        rulerX = true,
        rulerY = true,
        rulerCenter = true,
        rulerFactor = 1,
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
        freeze = false,
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

    /** ******************************************************************
     * TWEENing Functions
     ******************************************************************* */

    function tweenit() {
        TWEEN.update();
        setTimeout(tweenit, 20);
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
        new TWEEN.Tween(viewControl.getPosition()).
            to(pos, 500).
            onUpdate(tf).
            start();
    }

    function tweenPlatform(w,h,d) {
        let from = {x: platform.scale.x, y: platform.scale.y, z: platform.scale.z},
            to = {x:w, y:h, z:d},
            gridMajor = gridUnitMajor,
            gridMinor = gridUnitMinor,
            start = function() {
                setGrid(0);
            },
            update = function() {
                setPlatformSize(this.x, this.y, this.z);
                updateLastAction();
                refresh();
            },
            complete = function() {
                setGrid(gridMajor, gridMinor, gridColorMajor, gridColorMinor);
            };
        new TWEEN.Tween(from).
            to(to, 500).
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

    function onEnterKey(el, fn) {
        if (Array.isArray(el)) {
            for (let i=0; i<el.length; i += 2) onEnterKey(el[i], el[i+1]);
            return;
        }
        addEventListener(el, 'keyup', function(event) {
            if (event.keyCode === 13) fn(event);
        });
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
        setPlatformSize(width, depth, height, maxz);
        setGrid(gridUnitMajor, gridUnitMinor);
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
        setRulers();
    }

    function setAxes(bool) {
        axesOn = bool;
        setRulers();
    }

    function setVolume(bool) {
        volumeOn = bool;
        if (volume) volume.visible = bool;
        requestRefresh();
    }

    function setRulers(drawX = rulerX, drawY = rulerY, offsetCenter = rulerCenter, factor = rulerFactor) {
        rulerX = drawX;
        rulerY = drawY;
        rulerCenter = offsetCenter;
        rulerFactor = factor;

        let x = platform.scale.x,
            y = isRound ? platform.scale.z : platform.scale.y,
            z = isRound ? platform.scale.y : platform.scale.z,
            w = x / 2,
            h = y / 2,
            d = z / 2,
            zp = -d - platformZOff + gridZOff,
            oldRulersView = rulersView,
            labelSize = gridUnitMinor * fontScale;

        let canvasInMesh = function(w, h, textAlign, textBaseline, color) {
            let canvas = document.createElement('canvas'),
                ctx = canvas.getContext('2d'),
                scale = 8,
                plane,
                canvasTexture,
                material,
                mesh;

            canvas.width = w * scale;
            canvas.height = h * scale;
            ctx.scale(scale, scale);
            ctx.fillStyle = color || fontColor;
            ctx.font = labelSize + 'px sans-serif';
            ctx.textAlign = textAlign;
            ctx.textBaseline = textBaseline;
            plane = new THREE.PlaneGeometry(w, h);
            canvasTexture = new THREE.CanvasTexture(canvas);
            canvasTexture.minFilter = THREE.LinearFilter;
            // set 'transparent' to false to debug mesh bounds
            material = new THREE.MeshBasicMaterial({transparent: true, map: canvasTexture});
            mesh = new THREE.Mesh(plane, material);
            return {ctx: ctx, mesh: mesh};
        }

        if (drawX || drawY) {
            rulersView = new THREE.Group();
        } else {
            rulersView = null;
        }

        if (drawX) {
            const xPadding = labelSize * 4;
            const canvas = canvasInMesh(x + xPadding, labelSize * 3, 'center', 'top', rulerColor);

            for (let i = rulerXFirst; i <= rulerXLast; i += gridUnitMajor) {
                const label = ((offsetCenter ? i - (rulerXLast + rulerXFirst) / 2 : i) * factor).round(1);
                canvas.ctx.fillText('' + label, i + xPadding / 2, 0);
            }
            canvas.mesh.position.set(0, - h - labelSize * 2, zp);
            rulersView.add(canvas.mesh);

            if (axesOn) {
                canvas.ctx.font = (labelSize * 0.75) + 'px sans-serif';
                canvas.ctx.fillText('X', (x + xPadding)/2, labelSize * 1.5);
                canvas.ctx.font = labelSize + 'px sans-serif';
            }
        }

        if (drawY) {
            const yPadding = labelSize;
            const canvas = canvasInMesh(labelSize * 4, y + yPadding, 'end', 'middle', rulerColor);

            for (let i = rulerYFirst; i <= rulerYLast; i += gridUnitMajor) {
                const label = ((offsetCenter ? i - (rulerYLast + rulerYFirst) / 2 :
                    rulerYFirst + rulerYLast - i) * factor).round(1);
                canvas.ctx.fillText('' + label, labelSize * 4, i + yPadding / 2);
            }
            canvas.mesh.position.set(-w - labelSize * 2 - 5, 0, zp);
            rulersView.add(canvas.mesh);

            if (axesOn) {
                canvas.ctx.font = (labelSize * 0.75) + 'px sans-serif';
                canvas.ctx.fillText('Y', labelSize*1.25, (y + yPadding)/2);
                canvas.ctx.font = labelSize + 'px sans-serif';
            }
        }

        if (oldRulersView) Space.scene.remove(oldRulersView);
        if (rulersView) Space.scene.add(rulersView);
        Space.refresh();
    }

    function setGrid(unitMajor, unitMinor, colorMajor, colorMinor) {
        if (!unitMajor) return;
        let oldGridView = gridView;
        gridView = new THREE.Group();
        gridUnitMajor = unitMajor;
        gridUnitMinor = unitMinor;
        gridColorMajor = colorMajor || gridColorMajor;
        gridColorMinor = colorMinor || gridColorMinor;
        let x = platform.scale.x,
            y = isRound ? platform.scale.z : platform.scale.y,
            z = isRound ? platform.scale.y : platform.scale.z,
            xr = Math.ceil(x/2 / unitMinor) * unitMinor,
            yr = Math.ceil(y/2 / unitMinor) * unitMinor,
            xo = isRound ? x/2 : xr,
            yo = isRound ? y/2 : yr,
            w = x / 2,
            h = y / 2,
            d = z / 2,
            zp = -d - platformZOff + gridZOff,
            majors = [], minors = unitMinor ? [] : null, i;

        rulerXFirst = null;
        rulerXLast = null;
        rulerYFirst = null;
        rulerYLast = null;

        for (i = -xo; i <= xo; i += unitMinor) {
            let oh = isRound ? Math.sqrt(1-(i/xo)*(i/xo)) * h : h,
                dM = Math.abs(i % unitMajor);
            if (i < -w || i > w) continue;
            if (dM < 1 || Math.abs(unitMajor - dM) < 0.1) {
                majors.append({x:i, y:-oh, z:zp}).append({x:i, y:oh, z:zp});
                if (rulerXFirst === null) rulerXFirst = i + w;
                rulerXLast = i + w;
            } else {
                minors.append({x:i, y:-oh, z:zp}).append({x:i, y:oh, z:zp});
            }
        }
        for (i = -yo; i <= yo; i += unitMinor) {
            let ow = isRound ? Math.sqrt(1-(i/yo)*(i/yo)) * w : w,
                dM = Math.abs(i % unitMajor);
            if (i < -h || i > h) continue;
            if (dM < 1 || Math.abs(unitMajor - dM) < 0.1) {
                majors.append({x:-ow, y:i, z:zp}).append({x:ow, y:i, z:zp});
                if (rulerYFirst === null) rulerYFirst = i + h;
                rulerYLast = i + h;
            } else {
                minors.append({x:-ow, y:i, z:zp}).append({x:ow, y:i, z:zp});
            }
        }
        gridView.add(makeLinesFromPoints(majors, gridColorMajor || 0x999999, 1));
        if (minors) gridView.add(makeLinesFromPoints(minors, gridColorMinor || 0xcccccc, 1));
        if (oldGridView) Space.scene.remove(oldGridView);
        Space.scene.add(gridView);
    }

    function setOrigin(x, y, z) {
        if (gridOrigin) {
            if (x === gridOrigin.x && y === gridOrigin.y && z === gridOrigin.z) {
                return;
            }
            Space.scene.remove(gridOrigin.group);
        }
        if (x === undefined) {
            gridOrigin = null;
            Space.update();
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
        gridOrigin = {x, y, z, group};
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
        Space.update();
    }

    function refresh() {
        refreshRequested = false;
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
        const geo = new THREE.Geometry();
        for (let i=0; i < points.length; ) {
            const p1 = points[i++];
            const p2 = points[i++];
            geo.vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
            geo.vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
        }
        geo.verticesNeedUpdate = true;
        return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
            color: color,
            opacity: opacity || 1,
            transparent: opacity != 1
        }));
    }

    function intersect(objects, recurse) {
        let lookAt = new THREE.Vector3(mouse.x, mouse.y, 0.0).unproject(camera);
        let ray = new THREE.Raycaster(camera.position, lookAt.sub(camera.position).normalize());
        return ray.intersectObjects(objects, recurse);
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
                }
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
        if (viewControl.enabled) {
            event.preventDefault();
            let selection = mouseHover ? mouseHover() : null;
            if (selection && selection.length > 0) {
                int = intersect(selection, selectRecurse);
                if (int.length > 0) mouseHover(int[0], event);
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
            freeze: function (b) {
                let fz = freeze;
                freeze = b;
                return fz;
            },
            active: updateLastAction
        },

        platform: {
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
            showGrid:  function(b) { gridView.visible = b },
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
            top:   function()  { tweenCam({left: 0,    up: 0,   panX: 0, panY: panY, panZ: 0}) },
            back:  function()  { tweenCam({left: PI,   up: PI2, panX: 0, panY: panY, panZ: 0}) },
            home:  function()  { tweenCam({left: 0,    up: PI4, panX: 0, panY: panY, panZ: 0}) },
            front: function()  { tweenCam({left: 0,    up: PI2, panX: 0, panY: panY, panZ: 0}) },
            right: function()  { tweenCam({left: PI2,  up: PI2, panX: 0, panY: panY, panZ: 0}) },
            left:  function()  { tweenCam({left: -PI2, up: PI2, panX: 0, panY: panY, panZ: 0}) },
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
            getFPS: function() { return fps }
        },

        mouse: {
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

        objects: function() {
            return WC;
        },

        screenshot: function(format) {
            return renderer.domElement.toDataURL(format || "image/png");
        },

        internals: function() {
            return { renderer, camera };
        },

        init: function(domelement, slider) {
            container = domelement;

            WORLD.rotation.x = -PI2;
            SCENE.add(WORLD);

            domelement.style.width = width();
            domelement.style.height = height();

            renderer = new THREE.WebGLRenderer({
                antialias: true,
                preserveDrawingBuffer: true
            });
            camera = perspective ?
                new THREE.PerspectiveCamera(perspective, aspect(), 5, 100000) :
                new THREE.OrthographicCamera(-100 * aspect(), 100 * aspect(), 100, -100, 0.1, 100000);

            camera.position.set(0, 200, 340);
            renderer.setSize(width(), height());
            domelement.appendChild(renderer.domElement);

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

})();
