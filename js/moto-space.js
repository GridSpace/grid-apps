/** Copyright Stewart Allen -- All Rights Reserved */
"use strict";

let gs_moto_space = exports;
var MOTO = window.moto = window.moto || {};

(function() {

    let WIN = window,
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
        showSkyGrid = true,
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
        gridView,
        viewControl,
        trackPlane,
        platform,
        platformHover,
        platformClick,
        platformClickAt,
        platformOnMove,
        platformMoveTimer,
        light1,
        light2,
        light3,
        light4,
        light5,
        camera,
        renderer,
        container,
        isRound = false,
        platformMaterial = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            specular: 0xcccccc,
            shininess: 5,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

    /** ******************************************************************
     * TWEENing Functions
     ******************************************************************* */

    function tweenit() {
        TWEEN.update();
        setTimeout(tweenit, 20);
    }

    tweenit();

    function tweenCamPan(x,y,z) {
        let pos = viewControl.getPosition();
        pos.panX = x;
        pos.panY = y;
        pos.panZ = z;
        tweenCam(pos);
    }

    function tweenCam(pos) {
        let tf = function () {
            viewControl.setPosition(this);
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
                refresh();
            },
            complete = function() {
                setGrid(gridMajor, gridMinor);
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

    function setPlatformSize(width, depth, height) {
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
    }

    function setPlatformSizeUpdateGrid(width, depth, height) {
        setPlatformSize(width, depth, height);
        setGrid(gridUnitMajor, gridUnitMinor);
    }

    function setPlatformColor(color) {
        platform.material.color.set(color);
        requestRefresh();
    }

    function setGrid(unitMajor, unitMinor, colorMajor, colorMinor) {
        if (gridView) Space.scene.remove(gridView);
        if (!unitMajor) return;
        gridView = new THREE.Group();
        gridUnitMajor = unitMajor;
        gridUnitMinor = unitMinor;
        let x = platform.scale.x,
            y = isRound ? platform.scale.z : platform.scale.y,
            z = isRound ? platform.scale.y : platform.scale.z,
            xr = ROUND(x / unitMajor) * unitMajor,
            yr = ROUND(y / unitMajor) * unitMajor,
            xo = isRound ? Math.floor(x/2) : Math.ceil(xr / 2),
            yo = isRound ? Math.floor(y/2) : Math.ceil(yr / 2),
            w = x / 2,
            h = y / 2,
            d = z / 2,
            zp = -d - platformZOff + gridZOff,
            majors = [], minors = unitMinor ? [] : null, i;
        for (i = -xo; i <= xo; i++) {
            if (i >= -w && i <= w) {
                let oh = isRound ? Math.sqrt(1-(i/xo)*(i/xo)) * h : h;
                if (i % unitMajor === 0) majors.append({x:i, y:-oh, z:zp}).append({x:i, y:oh, z:zp});
                else if (minors && i % unitMinor === 0) minors.append({x:i, y:-oh, z:zp}).append({x:i, y:oh, z:zp});
            }
        }
        for (i = -yo; i <= yo; i++) {
            if (i >= -h && i <= h) {
                let ow = isRound ? Math.sqrt(1-(i/yo)*(i/yo)) * w : w;
                if (i % unitMajor === 0) majors.append({x:-ow, y:i, z:zp}).append({x:ow, y:i, z:zp});
                else if (minors && i % unitMinor === 0) minors.append({x:-ow, y:i, z:zp}).append({x:ow, y:i, z:zp});
            }
        }
        gridView.add(makeLinesFromPoints(majors, colorMajor || 0x999999, 1));
        if (minors) gridView.add(makeLinesFromPoints(minors, colorMinor || 0xcccccc, 1));
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
            side: THREE.DoubleSide
        });
        let rmat = new THREE.MeshPhongMaterial({
            color: 0x88aadd,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
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
        group.add(new THREE.Mesh(
            new THREE.RingGeometry(5, 5.5, 50),
            rmat
        ));
        group.add(new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 10),
            rmat
        ));
        group.add(new THREE.Mesh(
            new THREE.PlaneGeometry(10, 0.5),
            rmat
        ));
        group.rotation.x = -PI2;
        group.position.x = x;
        group.position.y = z;
        group.position.z = y;
        Space.scene.add(group);
        Space.update();
    }

    function refresh() {
        refreshRequested = false;
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
            case cca('f'):
                Space.view.front();
                break;
            case cca('l'):
                Space.view.left();
                break;
            case cca('r'):
                Space.view.right();
                break;
            case cca('t'):
                Space.view.top();
                break;
            case cca('b'):
                Space.view.back();
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

    function makeLinesFromPoints(points, color, width) {
        if (points.length % 2 != 0) throw "invalid line : "+points.length;
        let geo = new THREE.Geometry(),
            i = 0, p1, p2, mesh;
        while (i < points.length) {
            p1 = points[i++];
            p2 = points[i++];
            geo.vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
            geo.vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
        }
        geo.verticesNeedUpdate = true;
        mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
            color: color,
            linewidth: width || 1
        }));
        return mesh;
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
        if (event.target === renderer.domElement) {
            DOC.activeElement.blur();
            event.preventDefault();
            let selection = null,
                trackTo = alignedTracking ? trackPlane : platform;
            if (mouseDownSelect) selection = mouseDownSelect();
            if (selection && selection.length > 0) {
                trackTo.visible = true;
                let int = intersect(selection.slice().append(trackTo), false);
                trackTo.visible = false;
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
        if (!viewControl.enabled) {
            viewControl.enabled = true;
            viewControl.onMouseUp(event);
        }
        let mouseEnd = {
            x: (event.clientX / width()) * 2 - 1,
            y: -(event.clientY / height()) * 2 + 1};
        // only fire on mouse move between mouseStart (down) and up
        if (mouseEnd.x - mouseStart.x + mouseEnd.y - mouseStart.y === 0) {
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
        } else if (mouseDrag && mouseDragStart) {
            mouseDrag(null,null,true);
        }
        mouseDragPoint = null;
        mouseDragStart = null;
    }

    function onMouseMove(event) {
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
            trackTo.visible = true;
            int = intersect([trackTo], false);
            trackTo.visible = false;
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

        showSkyGrid: function(b) { showSkyGrid = b },
        setSkyColor: function(c) { skyColor = c },
        setSkyGridColor: function(c) { skyGridColor = c },

        scene: {
            add: function (o) {
                o.rotation.x = WORLD.rotation.x;
                return SCENE.add(o);
            },
            remove: function (o) {
                return SCENE.remove(o);
            }
        },

        platform: {
            tweenTo:   tweenPlatform,
            setSize:   setPlatformSizeUpdateGrid,
            setColor:  setPlatformColor,
            setOrigin: setOrigin,
            setGrid:   setGrid,

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

            setRound: function(bool) {
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
            }
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
            setZoom: function(r,v) { viewControl.setZoom(r,v) }
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
                new THREE.PerspectiveCamera(perspective, aspect(), 1, 100000) :
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
                renderer.render(SCENE, camera);
                if (moved && platformOnMove) {
                    clearTimeout(platformMoveTimer);
                    platformMoveTimer = setTimeout(platformOnMove, 500);
                }
            }, slider);

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
                new THREE.PlaneBufferGeometry(2000, 2000, 1, 1),
                new THREE.MeshBasicMaterial( { color: 0x777777, opacity: 0.3, transparent: false, side:THREE.DoubleSide } )
            );
            trackPlane.visible = false;
            trackPlane.rotation.x = PI2;

            let sky = new THREE.Mesh(
                    new THREE.BoxGeometry(50000, 50000, 50000, 1, 1, 1),
                    new THREE.MeshBasicMaterial({ color: skyColor, side: THREE.DoubleSide })
                ),
                skygrid = new THREE.Mesh(
                    new THREE.BoxGeometry(5000, 5000, 5000, 10, 10, 10),
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
                'keypress', keyHandler
            ]);

            initialized = true;
        }
    };

})();
