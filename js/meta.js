/**
 * Copyright 2014-2017 Stewart Allen -- All Rights Reserved
 *
 * TODO add history segment on right for quick rollback
 * TODO save-as for harder fork of model
 * TODO add support for hiding / showing selections (ghosting / unselectable)
 * TODO select plane vs face to fix plane/face marking (peril w/ nonflat)
 * TODO show/hide selection (to edit around, prevent mod, etc)
 * TODO make synth more efficient by only rebuilding if a relevant node has changed
 * TODO grouping and group naming (helps download / batch download)?
 * TODO bit encoding + stl instead of xyz
 * TODO undo/redo stack ... and revert to previous save hotkey
 * TODO improve paint/preproc and preview modes
 * TODO auto-save of workspace, selection and undo/redo stack (on idle)
 * TODO mark "hard" saves and auto-cleanup "soft/auto" saves after some time
 * TODO add selection rotation
 * TODO add reserved spaces (links) for signups
 * TODO shared live-edit workspaces?
 * TODO add OBJ export (http://en.wikipedia.org/wiki/Wavefront_.obj_file)
 * TODO add parametric relations (via marks?) w/ var table
 * TODO l&f and import stl from http://openjscad.org/
 */

"use strict";

var gs_meta = exports;

THREE.Material.prototype.motoSetup = function() {
    this.fog = false;
    var hidden = this.clone();
    this.m_hide = hidden;
    this.m_show = this;
    hidden.m_hide = hidden;
    hidden.m_show = this;
    hidden.visible = false;
    return this;
};

THREE.Face3.prototype.mVisible = function(show) {
    this.onface.cube.showHideFace(this.materialIndex, show);
};

(function() {
    var $ = function(id) { return document.getElementById(id)},
        // ---------------
        WIN = self,
        DOC = WIN.document,
        LOC = WIN.location,
        ABS = Math.abs,
        MAX = Math.max,
        MIN = Math.min,
        BOUND = function(v,min,max) { return MAX(min,MIN(max,v))},
        ROUND = Math.round,
        PI = Math.PI,
        PI2 = PI/2,
        SCALE = 1,
        HALF = SCALE / 2,
        HAS = function(a,b) { return a.hasOwnProperty(b) },
        // ---------------
        MOTO = self.moto,
        SPACE = MOTO.Space,
        SDB = MOTO.KV,
        MDB = kiri.openCatalog(new MOTO.Storage('meta')),
        KDB = kiri.openCatalog(new MOTO.Storage('kiri')),
        // ---------------
        CP = Cube.prototype,
        BP = Bounds.prototype,
        // ---------------
        FACES = ['bt','tb','lr','rl','fb','bf'],
        FACE = {
            rl: { mi:0, x: HALF, y:0, z:0, rx:0, ry:PI2, rz:0, ox: 1, oy:0, oz:0, tx:PI2, ty:0, tz:0 },
            lr: { mi:1, x:-HALF, y:0, z:0, rx:0, ry:PI2, rz:0, ox:-1, oy:0, oz:0, tx:PI2, ty:0, tz:0 },
            bf: { mi:2, x:0, y:-HALF, z:0, rx:0, ry:0, rz:0, ox:0, oy: 1, oz:0, tx:PI2, ty:0, tz:0 },
            fb: { mi:3, x:0, y: HALF, z:0, rx:0, ry:0, rz:0, ox:0, oy:-1, oz:0, tx:PI2, ty:0, tz:0 },
            tb: { mi:4, x:0, y:0, z: HALF, rx:PI2, ry:0, rz:0, ox:0, oy:0, oz: 1, tx:0, ty:0, tz:0 },
            bt: { mi:5, x:0, y:0, z:-HALF, rx:PI2, ry:0, rz:0, ox:0, oy:0, oz:-1, tx:0, ty:0, tz:0 }
        },
        FACEROT = {
            '00':{x:0,y:1,z:2},
            '01':{x:0,y:1,z:3},
            '02':{x:0,y:1,z:0},
            '03':{x:0,y:1,z:1},
            '10':{x:3,y:0,z:0},
            '11':{x:3,y:0,z:1},
            '12':{x:3,y:0,z:2},
            '13':{x:3,y:0,z:3},
            '20':{x:0,y:0,z:1},
            '21':{x:0,y:0,z:2},
            '22':{x:0,y:0,z:3},
            '23':{x:0,y:0,z:0},
            '30':{x:0,y:3,z:0},
            '31':{x:0,y:3,z:3},
            '32':{x:0,y:3,z:2},
            '33':{x:0,y:3,z:1},
            '40':{x:1,y:0,z:0},
            '41':{x:1,y:0,z:3},
            '42':{x:1,y:0,z:2},
            '43':{x:1,y:0,z:1},
            '50':{x:2,y:0,z:1},
            '51':{x:2,y:0,z:2},
            '52':{x:2,y:0,z:3},
            '53':{x:2,y:0,z:0}
        },
        // ---------------
        EDIT = {
            ADD: 1,
            SELECT: 2,
            DELETE: 3,
            CLONE: 4,
            MARK: 5
        },
        SELECT = {
            PLANE: 1,
            REGION: 2,
            JOINED: 3,
            DRILL: 4,
            CUBE: 5
        },
        MARK = {
            NONE: 1,
            EMIT: 2,
            SLIDE: 3,
            CLEAR: 5
        },
        COLOR = {
            ADD: 0x00ff00,
            SELECT: 0xffff00,
            DELETE: 0xff0000,
            CLONE: 0xff00ff,
            EMIT: 0x555555,
            SLIDE: 0xcccccc,
            CLEAR: 0xffffff,
            DEFAULT: 0xdddddd
        },
        // ---------------
        boxMaterial = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0x00ff00,
            specular: 0x111111,
            transparent: false,
            shininess: 100,
            opacity: 0.8
        }).motoSetup(),
        boxMaterialSelected = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0xffff00,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.6
        }).motoSetup(),
        boxMaterialSelectedSynthetic = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0xffff77,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.6
        }).motoSetup(),
        faceMaterialSelected = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0xffbb00,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.8
        }).motoSetup(),
        faceMaterialSlide = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: COLOR.SLIDE,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.8
        }).motoSetup(),
        faceMaterialEmit = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: COLOR.EMIT,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.8
        }).motoSetup(),
        faceMaterialInside = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0xffffff,
            specular: 0x111111,
            transparent: true,
            shininess: 100,
            opacity: 0.0
        }).motoSetup(),
        faceMaterialSynthetic = new THREE.MeshPhongMaterial({
            side:THREE.DoubleSide,
            color: 0x55ff55,
            specular: 0x111111,
            transparent: false,
            shininess: 100,
            opacity: 0.6
        }).motoSetup(),
        hoverMaterial = new THREE.MeshBasicMaterial({
            color: 0x0,
            opacity: 0.75,
            transparent: true,
            side: THREE.DoubleSide
        }).motoSetup(),
        // ---------------
        UI = {},
        SPACES = [],
        SPACENAMES = {},
        LIBCACHE = {},
        HASHMATCH = null,
        DATA = "/data/",
        // ---------------
        hashWatcher = null,
        selectMode = SELECT.REGION,
        editMode = EDIT.SELECT,
        markMode = MARK.EMIT,
        updateFacesScheduled = false,
        updateSynthetic = true,
        enablePost = true,
        dragCopy = false,
        selectedFace = null,
        hoverSpot = null,
        // ---------------
        editModeButtons = {},
        selectModeButtons = {},
        markTypeButtons = {},
        // ---------------
        spaceUnits = null,
        spaceName = 'untitled',
        spaceID = null,
        spaceVer = 0,
        gridSize = 5,
        matrix = {},
        selected = [], // cubes
        selectable = [], // meshes
        selectedBounds = new Bounds();

    /** ******************************************************************
     * LETS_GET_THIS_PARTY_STARTED()
     ******************************************************************* */

    if (MOTO.KV.__mem__) alert(
        "browser is blocking local storage or\n"+
        "3rd party cookies required to store\n" +
        "application state.");

    SPACE.addEventListener(DOC, 'DOMContentLoaded', metaInit, false);

    function metaInit() {
        SPACE.showSkyGrid(false);
        SPACE.setSkyColor(0xf8f8f8);

        SPACE.init($('container'));
        SPACE.selectRecurse(true);
        SPACE.useDefaultKeys(false);

        SPACE.platform.setSize(300,300,0.5);
        SPACE.platform.setHiding(true);
        SPACE.platform.setHidden(true);
        SPACE.platform.setZOff(0.55);
        SPACE.platform.setGZOff(0.3);
        SPACE.platform.opacity(0.2);

        hoverSpot = new THREE.Mesh(new THREE.PlaneBufferGeometry(0.8, 0.8, 1, 1), hoverMaterial);
        SPACE.scene.add(hoverSpot);

        SPACE.platform.onHover(function(point) {
            hoverSpot.visible = true;
            hoverSpot.position.set(ROUND(point.x), -0.5, ROUND(point.z));
            hoverSpot.rotation.set(PI2, 0, 0);
            SPACE.update(25);
        });

        SPACE.platform.onClick(function(point) {
            if (editMode === EDIT.ADD) new Cube(ROUND(point.x), -ROUND(point.z), 0).add();
        });

        SPACE.mouse.downSelect(function(selection, event) {
            dragCopy = selection && event.metaKey;
            return selectedFace ? [ selectedFace.cube.boxM ] : null;
        });

        SPACE.mouse.upSelect(function(selection, event) {
            if (event) {
                if (selection && selection.faceIndex) {
                    var face = selection.face.onface,
                        cube = face.cube;
                    switch (editMode) {
                        case EDIT.MARK:
                            if (!cube.isSynthetic()) markFace(face);
                            scheduleUpdateFaces(cube, face);
                            break;
                        case EDIT.SELECT:
                            var shift = event.shiftKey,
                                meta = event.metaKey,
                                isSelected = cube.isSelected();
                            if (shift) {
                                selectRegion(face, true, meta ? SELECT.REGION : selectMode);
                            } else if (!isSelected) {
                                clearSelections();
                                selectRegion(face, true, meta ? SELECT.REGION : selectMode);
                            }
                            if (cube.isSelected()) {
                                selectedFace = face;
                                scheduleUpdateFaces(cube, face);
                            }
                            var s = face.set, rot = { x: s.tx, y: s.ty, z: s.tz };
                            SPACE.alignTracking(selection.point, rot, {x:-ABS(s.ox), y:-ABS(s.oz), z:-ABS(s.oy)});
                            break;
                        case EDIT.ADD:
                            clearSelections();
                            cube.newAdjacent(face).add();
                            break;
                        case EDIT.CLONE:
                            clearSelections();
                            cube.newAdjacent(face).add().cloneFrom(cube);
                            break;
                        case EDIT.DELETE:
                            if (cube.isSynthetic()) return;
                            clearSelections();
                            removeCube(cube);
                            break;
                    }
                } else {
                    clearSelections();
                }
            }
            return selectable;
        });

        SPACE.mouse.onDrag(function(delta, offset, end) {
            if (offset) moveSelection(offset);
            if (end) moveComplete();
            return selectedFace.cube.boxM;
        });

        SPACE.mouse.onHover(function(selection, event) {
            if (event) {
                if (selection && selection.faceIndex) {
                    var cf = selection.face.onface,
                        s = cf.set,
                        p = cf.cube.pos;
                    hoverSpot.rotation.set(s.rx, s.ry, s.rz);
                    hoverSpot.position.set(p.x + s.x * 1.05, p.z + s.z * 1.05, -p.y + s.y * 1.05);
                    SPACE.update(25);
                }
            } else {
                return selectable;
            }
        });

        function inputHasFocus() {
            return DOC.activeElement && (DOC.activeElement != DOC.body);
        }

        function setAnchorSelection(x,y,z) {
            if (selected.length === 0) return;
            for (var i=0; i<selected.length; i++) selected[i].setMeshAnchor(x,y,z);
            SPACE.update();
        }

        function updateAnchorSelection(x,y,z) {
            if (selected.length === 0) return;
            for (var i=0; i<selected.length; i++) selected[i].alterMeshAnchor(x,y,z);
            SPACE.update();
        }

        function rotateSelection(x,y,z) {
            if (selected.length === 0) return;
            for (var i=0; i<selected.length; i++) selected[i].rotateMesh(x,y,z);
            SPACE.update();
        }

        function keyDownHandler(evt) {
            //if (inputHasFocus()) return false;
            switch (evt.keyCode) {
                case 8:
                    if (inputHasFocus()) return;
                    event.preventDefault();
                    deleteSelection();
                    break;
                case 37: // left arrow
                    rotateSelection(0,0,-1);
                    evt.preventDefault();
                    break;
                case 39: // right arrow
                    rotateSelection(0,0,1);
                    evt.preventDefault();
                    break;
                case 38: // up arrow
                    if (evt.shiftKey) rotateSelection(0,-1,0); else rotateSelection(1,0,0);
                    evt.preventDefault();
                    break;
                case 40: // down arrow
                    if (evt.shiftKey) rotateSelection(0,1,0); else rotateSelection(-1,0,0);
                    evt.preventDefault();
                    break;
                case 65: // 'a' for select all
                    if (inputHasFocus()) return;
                    if (evt.metaKey) {
                        evt.preventDefault();
                        selectAll();
                    }
                    break;
                case 83: // 's' for save workspace
                    if (evt.metaKey) {
                        evt.preventDefault();
                        saveWorkspace();
                    }
                    break;
                case 76: // 'l' for restore workspace
                    if (evt.metaKey) {
                        evt.preventDefault();
                        restoreWorkspace();
                    }
                    break;
            }
        }

        function keyUpHandler(evt) {
            if (inputHasFocus()) return false;
            switch(evt.keyCode) {
                case 27: // escape
                    clearSelections();
                    setEditMode(EDIT.SELECT);
                    break;
            }
            return false;
        }

        function cca(c) {
            return c.charCodeAt(0);
        }

        function computeCenter() {
            var bounds = new Bounds(), i = 0;
            if (selected.length > 0) {
                while (i < selected.length) {
                    bounds.update(selected[i++].pos);
                }
            } else {
                while (i < selectable.length) {
                    bounds.update(selectable[i++].cube.pos);
                }
            }
            SPACE.platform.setMaxZ(i > 0 ? bounds.z.max : 0);
        }

        function keyPressHandler(evt) {
            if (inputHasFocus()) return false;
            var handled = true, style;
            switch(evt.charCode) {
                case cca('h'):
                    computeCenter();
                    SPACE.view.home();
                    break;
                case cca('t'):
                    computeCenter();
                    SPACE.view.top();
                    break;
                case cca('a'):
                    setEditMode(EDIT.ADD);
                    break;
                case cca('s'):
                    setEditMode(EDIT.SELECT);
                    break;
                case cca('d'):
                    setEditMode(EDIT.DELETE);
                    break;
                case cca('e'):
                    setMarkMode(MARK.EMIT);
                    break;
                case cca('w'):
                    setMarkMode(MARK.SLIDE);
                    break;
                case cca('q'):
                    setMarkMode(MARK.CLEAR);
                    break;
                case cca('c'):
                    if (selected.length === 0) {
                        setEditMode(EDIT.CLONE)
                    } else {
                        cloneSelection(false);
                    }
                    break;
                case cca('m'):
                    mirrorSelection();
                    break;
                case cca('n'):
                    window.n = [];
                    for (var i=0; i<selected.length; i++) window.n.push(selected[i]);
                    break;
                case cca('p'):
                    enablePost = !enablePost;
                    removeSynthetic();
                    updateFaces();
                    break;
                case cca('l'):
                    selectionToLibrary();
                    break;
                case cca('x'):
                    sendWorkspace();
                    break;
                case cca('X'):
                    sendWorkspace("http://localhost:8080");
                    break;
                case cca('1'): // toggle control left
                    if (evt.ctrlKey) {
                        style = ctrlLeft.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        handled = false;
                    }
                    break;
                case cca('2'): // toggle control right
                    if (evt.ctrlKey) {
                        style = ctrlRight.style;
                        style.display = style.display === 'none' ? 'block' : 'none';
                    } else {
                        handled = false;
                    }
                    break;
                default:
                    handled = false;
                    break;
            }
            if (handled) evt.preventDefault();
            return false;
        }

        function setEditMode(mode,term) {
            for (var key in editModeButtons) {
                if (!editModeButtons.hasOwnProperty(key)) continue;
                editModeButtons[key].setAttribute('class', parseInt(key) === parseInt(mode) ? 'buton' : 'butoff');
            }
            if (mode === null) return;
            mode = parseInt(mode);
            if (term && mode === editMode) return;
            editMode = mode;
            setMarkMode(mode === EDIT.MARK ? markMode : null,true);
            setSelectMode(mode === EDIT.SELECT ? selectMode : null,true);
            scheduleUpdateFaces();
            var color = 0xffffff;
            switch (mode) {
                case EDIT.ADD: color = COLOR.ADD; break;
                case EDIT.DELETE: color = COLOR.DELETE; break;
                case EDIT.SELECT: color = COLOR.SELECT; break;
                case EDIT.CLONE: color = COLOR.CLONE; break;
            }
            hoverMaterial.color.setHex(color);
            SPACE.update();
        }

        function setSelectMode(mode,term) {
            for (var key in selectModeButtons) {
                if (!selectModeButtons.hasOwnProperty(key)) continue;
                selectModeButtons[key].setAttribute('class', parseInt(key) === parseInt(mode) ? 'buton' : 'butoff');
            }
            if (mode == null) return;
            mode = parseInt(mode);
            if (term && mode === selectMode) return;
            selectMode = mode;
            setMarkMode(null,true);
            setEditMode(EDIT.SELECT,true);
            scheduleUpdateFaces();
            SDB['meta-smode'] = mode;
        }

        function setMarkMode(mode,term) {
            for (var key in markTypeButtons) {
                if (!markTypeButtons.hasOwnProperty(key)) continue;
                markTypeButtons[key].setAttribute('class', parseInt(key) === parseInt(mode) ? 'buton' : 'butoff');
            }
            if (mode === null) return;
            mode = parseInt(mode);
            if (term && mode === markMode) return;
            markMode = mode;
            selectedFace = null;
            setSelectMode(selectMode,true);
            setEditMode(EDIT.MARK,true);
            scheduleUpdateFaces();
            var color = COLOR.SELECT;
            switch (mode) {
                case MARK.EMIT: color = COLOR.EMIT; break;
                case MARK.SLIDE: color = COLOR.SLIDE; break;
                case MARK.CLEAR: color = COLOR.CLEAR; break;
            }
            hoverMaterial.color.setHex(color);
            SPACE.update();
        }

        /** library drag/drop handlers */

        function dragOverHandler(evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy';
            UI.libdrop.style.backgroundColor = '#8f8';
        }

        function dragLeave() {
            UI.libdrop.style.backgroundColor = '#ccc';
        }

        function dropHandler(evt) {
            evt.stopPropagation();
            evt.preventDefault();

            UI.libdrop.style.backgroundColor = '#ccc';

            var files = evt.dataTransfer.files,
                add = files.length <= 1 || confirm('add '+files.length+' objects to library?'),
                i;
            for (i=0; add && i<files.length; i++) {
                if (files[i].name.toLowerCase().indexOf(".stl") < 0) continue;
                var reader = new FileReader();
                reader.file = files[i];
                reader.onloadend = function (e) {
                    var vertices = new moto.STL().parse(e.target.result);
                    MDB.putFile(e.target.file.name, vertices);
                };
                reader.readAsBinaryString(reader.file);
            }
        }

        function keysToSortedArray(obj) {
            var array = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) array.push(key);
            }
            array.sort();
            return array;
        }

        function updateMeshList(files) {
            var lib = UI.library,
                html = [],
                filenames = keysToSortedArray(files),
                name, sname, button,
                i = 0;

            filenames.forEach(function(name) {
                sname = name.split('.')[0];
                sname = sname > 15 ? sname.substring(0,13)+"..." : sname;
                html.push('<div><button id="slib_'+i+'" class="load">'+sname+'</button><button id="dlib_'+i+'" class="del">x</button></div>');
                i++;
            });
            html.push();
            lib.innerHTML = html.join('');

            i = 0;
            filenames.forEach(function(name) {
                button = $('slib_'+i);
                button.onclick = function() { libraryToSelection(this.filename) };
                button.title = name+'\rvertices: '+files[name].vertices;
                button.filename = name;
                button = $('dlib_'+i);
                button.onclick = function() { if (confirm('delete '+this.filename+'?')) MDB.deleteFile(this.filename) };
                button.filename = name;
                button.title = 'delete';
                i++;
            });
        }

        /** setup UI control elements */

        var UC = moto.ui.prefix('meta'),
            ctrlLeft  = $('control-left'),
            ctrlRight = $('control-right'),
            assets    = $('assets'),
            control   = $('control'),
            selCube   = UC.newButton('cube',   function() { setSelectMode(SELECT.CUBE) }),
            selRegion = UC.newButton('region', function() { setSelectMode(SELECT.REGION) }),
            selJoined = UC.newButton('joined', function() { setSelectMode(SELECT.JOINED) }),
            selPlane  = UC.newButton('planar', function() { setSelectMode(SELECT.PLANE) }),
            selDrill  = UC.newButton('core',   function() { setSelectMode(SELECT.DRILL) }),
            editAdd   = UC.newButton('add',    function() { setEditMode(EDIT.ADD) }),
            editDel   = UC.newButton('delete', function() { setEditMode(EDIT.DELETE) }),
            editSel   = UC.newButton('select', function() { setEditMode(EDIT.SELECT) }),
            editClo   = UC.newButton('clone',  function() { setEditMode(EDIT.CLONE) }),
            editMark  = UC.newButton('mark',   function() { setEditMode(EDIT.MARK) }),
            markEmit  = UC.newButton('emit',   function() { setMarkMode(MARK.EMIT) }),
            mtypStop  = UC.newButton('stop',   function() { setMarkMode(MARK.SLIDE) }),
            mtypClear = UC.newButton('clear',  function() { setMarkMode(MARK.CLEAR) }),
            verDown   = UC.newButton('-',      function() { restoreWorkspaceVersion(spaceVer-1) }),
            verUp     = UC.newButton('+',      function() { restoreWorkspaceVersion(spaceVer+1) });

        selectModeButtons[SELECT.CUBE] = selCube;
        selectModeButtons[SELECT.REGION] = selRegion;
        selectModeButtons[SELECT.JOINED] = selJoined;
        selectModeButtons[SELECT.PLANE] = selPlane;
        selectModeButtons[SELECT.DRILL] = selDrill;

        editModeButtons[EDIT.ADD] = editAdd;
        editModeButtons[EDIT.DELETE] = editDel;
        editModeButtons[EDIT.SELECT] = editSel;
        editModeButtons[EDIT.CLONE] = editClo;
        editModeButtons[EDIT.MARK] = editMark;

        markTypeButtons[MARK.EMIT] = markEmit;
        markTypeButtons[MARK.SLIDE] = mtypStop;
        markTypeButtons[MARK.CLEAR] = mtypClear;

        UC.newGroup('workspace', assets);
        UC.newTableRow([[
            UC.newButton('new',  newWorkspace),
            UC.newButton('fork', forkWorkspace),
            UC.newButton('save', saveWorkspace)
        ]]);
        UC.newGroup('mode').setAttribute("title","choose adding, deleting\ncloning or selecting cubes");
        UC.newTableRow([
            [ editAdd, editDel ],
            [ editSel, editClo ],
            [ editMark ]
        ]);
        UC.newGroup('action').setAttribute("title","action to perform on current selection");
        UC.newTableRow([
            [
                UC.newButton('clone',        cloneSelection     ),
                UC.newButton('mirror',       mirrorSelection    )
            ],[
                UC.newButton('solidify',     convertSelection   ),
                UC.newButton('clear',        selectionClearMesh )
            ],[
                UC.newButton('to meshes',    selectionToLibrary )
            ],[
                UC.newButton('to kiri:moto', selectionToKiri    )
            ],[
                UC.newButton('download STL', downloadSelection  )
            ]
        ]);
        UC.newGroup('select').setAttribute("title","criteria for choosing the selection");
        UC.newTableRow([
            [ selCube, selRegion ],
            [ selJoined, selPlane ],
            [ selDrill ]
        ]);
        UC.newGroup('mark').setAttribute("title","mark cube faces to control\nselection and region fills");
        UC.newTableRow([
            [ markEmit, mtypStop ],
            [ mtypClear ]
        ]);
        UC.newGroup('mesh rotate');
        UC.newTableRow([
            [
                UC.newButton('x-', function() { rotateSelection(-1, 0, 0) }),
                UC.newButton('x+', function() { rotateSelection( 1, 0, 0) })
            ],[
                UC.newButton('y-', function() { rotateSelection( 0,-1, 0) }),
                UC.newButton('y+', function() { rotateSelection( 0, 1, 0) })
            ],[
                UC.newButton('z-', function() { rotateSelection( 0, 0,-1) }),
                UC.newButton('z+', function() { rotateSelection( 0, 0, 1) })
            ]
        ]);
        UC.newGroup('mesh anchor');
        UC.newTableRow([
            [
                UC.newButton('x-', function() { updateAnchorSelection(-1, 0, 0) }),
                UC.newButton('x+', function() { updateAnchorSelection( 1, 0, 0) })
            ],[
                UC.newButton('y-', function() { updateAnchorSelection( 0,-1, 0) }),
                UC.newButton('y+', function() { updateAnchorSelection( 0, 1, 0) })
            ],[
                UC.newButton('z-', function() { updateAnchorSelection( 0, 0,-1) }),
                UC.newButton('z+', function() { updateAnchorSelection( 0, 0, 1) })
            ],[
                UC.newButton('center', function() { setAnchorSelection(0,0,0)   })
            ]
        ]);

        UC.newGroup('space', control);
        UI.name = UC.newInput('name', {size:10});
        UI.units = UC.newInput('units');
        UI.grid = UC.newInput('grid');
        UI.version = UC.newInput('version', {disabled:true});
        UC.newTableRow([[ verDown, verUp ]]);

        UC.newGroup('selection');
        UI.sel_x = UC.newInput('width', {disabled:true});
        UI.sel_y = UC.newInput('depth', {disabled:true});
        UI.sel_z = UC.newInput('height', {disabled:true});
        UI.sel_b = UC.newInput('blocks', {disabled:true});

        UC.newGroup('spaces');
        UI.models = UC.newRow();

        UC.newGroup('import mesh');
        UI.libdrop = UC.newButton('(drop mesh here)');
        UI.libdrop.id = "dropbutton";
        UC.newRow([UI.libdrop]);

        UC.newGroup('meshes');
        UI.library = UC.newRow();

        /** attach our key board controls */

        SPACE.addEventHandlers(window, [
            'keyup', keyUpHandler,
            'keydown', keyDownHandler,
            'keypress', keyPressHandler
        ]);

        SPACE.onEnterKey([
            UI.grid, function(ev) { setGridSize(parseInt(UI.grid.value)) },
            UI.name, function(ev) { updateSpaceName(UI.name.value) },
            UI.units, function(ev) { setSpaceUnits(UI.units.value) }
        ]);

        /** prevent mouse hover, click in control panels from affecting space */

        function killev(ev) { ev.stopImmediatePropagation(); return false }

        SPACE.addEventHandlers(ctrlLeft, [
            'mousemove', killev,
            'mousedown', killev,
            'mouseup', killev
        ]);
        SPACE.addEventHandlers(ctrlRight, [
            'mousemove', killev,
            'mousedown', killev,
            'mouseup', killev
        ]);

        /** wire up drag and drop handlers and library listener */

        SPACE.addEventHandlers(UI.libdrop, [
            'dragover', dragOverHandler,
            'dragleave', dragLeave,
            'drop', dropHandler
        ]);

        MDB.addFileListener(updateMeshList);

        /** and a few more settings before we're done */

        setGridSize(gridSize);
        setMarkMode(MARK.NONE);
        setEditMode(EDIT.SELECT);
        setSelectMode(SDB['meta-smode']);
        setSpaceUnits('1 cm');

        restoreWorkspace();
        seedCorners();

        ctrlLeft.style.display = 'block';
        ctrlRight.style.display = 'block';
    }

    /** ******************************************************************
     * Object Definitions
     ******************************************************************* */

    function MinMax() {
        this.min = Infinity;
        this.max = -Infinity;
    }

    MinMax.prototype.update = function(v) {
        if (v < this.min) this.min = v;
        if (v > this.max) this.max = v;
    };

    function Bounds() {
        this.x = new MinMax();
        this.y = new MinMax();
        this.z = new MinMax();
        this.dx = 0;
        this.dy = 0;
        this.dz = 0;
        this.count = 0;
    }

    BP.update = function(pos) {
        this.x.update(pos.x);
        this.y.update(pos.y);
        this.z.update(pos.z);
        this.count++;
        this.dx = this.x.max - this.x.min + 1;
        this.dy = this.y.max - this.y.min + 1;
        this.dz = this.z.max - this.z.min + 1;
    };

    BP.center = function() {
        return {
            x: this.x.min + (this.dx / 2),
            y: this.y.min + (this.dy / 2),
            z: this.z.min + (this.dz / 2)
        };
    };

    function Cube(x, y, z, synth) {
        this.pos = {x:x, y:y, z:z};
        this.key = [x,y,z].join(',');

        this.synth = synth;
        this.selected = false;

        this.materials = [
            boxMaterial, boxMaterial, boxMaterial, boxMaterial, boxMaterial, boxMaterial
        ];

        this.box = new THREE.BoxGeometry(1,1,1,1,1,1);
        this.boxM = new THREE.Mesh(this.box, this.materials);
        this.boxM.position.set(x, y, z);
        this.boxM.cube = this;

        this.mesh = null;
        this.meshRotate = null;

        this.group = new THREE.Object3D();
        this.group.cube = this;
        this.group.add(this.boxM);

        this.faces = {
            rl: this.makeFace('rl'),
            lr: this.makeFace('lr'),
            bf: this.makeFace('bf'),
            fb: this.makeFace('fb'),
            tb: this.makeFace('tb'),
            bt: this.makeFace('bt')
        };

        var b = this.box, f, key;
        for (var i=0; i<b.faces.length; i++) {
            f = b.faces[i];
            switch (f.materialIndex) {
                case 0: key = "rl"; break;
                case 1: key = "lr"; break;
                case 2: key = "bf"; break;
                case 3: key = "fb"; break;
                case 4: key = "tb"; break;
                case 5: key = "bt"; break;
            }
            f.onface = this.faces[key];
        }
    }

    CP.copyMesh = function(cube) {
        if (cube.mesh) {
            this.setMesh(geoToMesh(cube.mesh.geometry));
            var mrt = this.meshRotate,
                mrf = cube.meshRotate;
            mrt.f = mrf.f;
            mrt.r = mrf.r;
            mrt.mx = mrf.mx;
            mrt.my = mrf.my;
            mrt.mz = mrf.mz;
            mrt.ax = mrf.ax;
            mrt.ay = mrf.ay;
            mrt.az = mrf.az;
        }
    };

    CP.setMesh = function(mesh) {
        if (this.mesh) this.group.remove(this.mesh);
        if (mesh) {
            this.group.add(mesh);
            mesh.position.copy(this.boxM.position);
        }
        this.mesh = mesh;
        this.meshRotate = {f:2, r:3, mx:0, my:0, mz:0, ax:0, ay:0, az:0};
    };

    CP.updateMeshAnchor = function(force) {
        var mr = this.meshRotate;
        if (mr && (force || mr.ax || mr.ay || mr.az)) this.mesh.geometry.center(mr.ax, mr.ay, mr.az);
    };

    CP.alterMeshAnchor = function(x,y,z) {
        var mr = this.meshRotate;
        if (mr) this.setMeshAnchor(mr.ax + x, mr.ay + y, mr.az + z);
    };

    CP.setMeshAnchor = function(x,y,z) {
        var mr = this.meshRotate;
        if (mr && (mr.ax != x || mr.ay != y || mr.az != z)) {
            mr.ax = BOUND(x,-1,1);
            mr.ay = BOUND(y,-1,1);
            mr.az = BOUND(z,-1,1);
            this.updateMeshAnchor(true);
        }
    };

    CP.setMeshRotation = function(f,r) {
        var rtt = FACEROT[[f,r].join('')], mr = this.meshRotate;
        if (rtt) {
            this.rotateMesh(rtt.x,rtt.y,rtt.z,true);
            mr.f = f;
            mr.r = r;
        }
    };

    CP.setMeshMirror = function(x,y,z) {
        var mr = this.meshRotate;
        if (x != mr.mx) { this.mesh.mirrorX(); mr.mx = x; }
        if (y != mr.my) { this.mesh.mirrorY(); mr.my = y; }
        if (z != mr.mz) { this.mesh.mirrorZ(); mr.mz = z; }
    };

    CP.mirrorMesh = function(x,y,z) {
        if (!(x || y || z)) return;
        var mr = this.meshRotate;
        if (x) { this.mesh.mirrorX(); mr.mx = 1 - mr.mx; }
        if (y) { this.mesh.mirrorY(); mr.my = 1 - mr.my; }
        if (z) { this.mesh.mirrorZ(); mr.mz = 1 - mr.mz; }
        this.updateMeshAnchor();
    };

    CP.rotateMesh = function(x,y,z,nostate) {
        if (this.mesh) {
            this.mesh.geometry.applyMatrix(new THREE.Matrix4().makeRotationFromEuler(
                new THREE.Euler((-x || 0) * PI2, (y || 0) * PI2, (-z || 0) * PI2))
            );

            if (nostate) return;

            var mr = this.meshRotate,
                //f = mr.f,
                fdir = null, fro = 0, sum = x + y + z;

            //console.log(['rot',x,y,z,'sum',sum]);

            if (x > 0) { fdir = [0,2,4,3,5,1]; fro = [ 1,-1, 0, 1,-1, 0] } else
            if (x < 0) { fdir = [0,5,1,3,2,4]; fro = [-1, 0, 1,-1, 0, 1] } else
            if (y > 0) { fdir = [5,1,0,2,4,3]; fro = [ 0, 1,-1, 0, 1,-1] } else
            if (y < 0) { fdir = [2,1,3,5,4,0]; fro = [ 1,-1, 0, 1,-1, 0] } else
            if (z > 0) { fdir = [1,3,2,4,0,5]; fro = [ 1, 0, 1, 1, 0,-1] } else
            if (z < 0) { fdir = [4,0,2,1,3,5]; fro = [ 0, 1,-1, 0, 1, 1] }

            //console.log(['was', mr.f, mr.r, 'fro', fro[mr.f]]);

            if (fro[mr.f] === 0) {
                // invert rotation when changing face sign (i.e. +x to -y)
                mr.r = 3 - mr.r;
            } else {
                mr.r = mr.r + fro[mr.f];
                // normalize in 0-3 range
                if (mr.r <= 0) mr.r += 4;
                if (mr.r >= 4) mr.r -= 4;
            }
            mr.f = fdir[mr.f];

            //console.log(['now', mr.f, mr.r]);

            this.updateMeshAnchor();
        }
    };

    CP.setFaceMaterial = function(index, mat) {
        this.materials[index] = mat;
    };

    CP.showHideFace = function(index, show) {
        this.materials[index].visible = show;
    };

    CP.canMoveTo = function(delta) {
        if (!this.isSelected()) return true;
        var adjacent = this.offsetCube(delta);
        if (adjacent === this) return true;
        if (this.pos.z + delta.z < 0) return false;
        return (!adjacent || adjacent.isSelected() || adjacent.isSynthetic());
    };

    CP.moveTo = function(delta) {
        if (this.selected) {
            this.group.position.set(delta.x, delta.y, delta.z);
        }
    };

    CP.dropAndUpdate = function(clone) {
        var pos = this.pos,
            delta = this.group.position,
            faces = this.faces,
            npos = {x:pos.x + delta.x, y:pos.y + delta.y, z:pos.z + delta.z},
            i, k, face;
        if (clone) {
            this.group.position.set(0,0,0);
            return this.cloneTo(npos.x, npos.y, npos.z);
        } else {
            this.boxM.position.add(delta);
            if (this.mesh) this.mesh.position.add(delta);
            this.group.position.set(0,0,0);
            if (!delete matrix[this.key]) throw "missing cube @ "+this.key;
            this.pos = npos;
            this.key = [npos.x, npos.y, npos.z].join(',');
            return this;
        }
    };

    CP.add = function() {
        return addCube(this);
    };

    CP.remove = function() {
        removeCube(this);
    };

    CP.newAdjacent = function(face, mult, synth) {
        var pos = this.pos,
            off = FACE[face.key],
            prod = mult || 1;
        if (pos.z + off.oz * prod < 0) return null;
        return new Cube(pos.x + off.ox * prod, pos.y + off.oy * prod, pos.z + off.oz * prod, synth);
    };

    CP.offsetPosition = function(off, mult) {
        var pos = this.pos,
            prod = mult || 1;
        return {
            x: pos.x + off.x * prod,
            y: pos.y + off.y * prod,
            z: pos.z + off.z * prod
        };
    };

    CP.offsetCube = function(off, mult) {
        var pos = this.pos,
            prod = mult || 1,
            key = [pos.x + off.ox * prod, pos.y + off.oy * prod, pos.z + off.oz * prod].join(',');
        return matrix[[pos.x + off.ox * prod, pos.y + off.oy * prod, pos.z + off.oz * prod].join(',')];
    };

    CP.adjacentCube = function(face) {
        return this.offsetCube(FACE[face.key]);
    };

    CP.adjacentCubeFace = function(face, key) {
        var cube = this.adjacentCube(face);
        if (cube) return cube.faces[key.reverse()];
        return null;
    };

    CP.makeFace = function(key) {
        return {
            mark: MARK.NONE,
            cube: this,
            set: FACE[key],
            key: key
        };
    };

    CP.mirrorSwapFace = function(facekey) {
        var f = this.faces,
            rev = facekey.reverse(),
            tmp = f[facekey].mark;
        f[facekey].mark = f[rev].mark;
        f[rev].mark = tmp;
        if (this.mesh) {
            var fd = 0, mr = this.meshRotate;
            switch (facekey) {
                case 'tb':
                case 'bt':
                    this.mirrorMesh(0,0,1);
                    break;
                case 'lr':
                case 'rl':
                    this.mirrorMesh(1,0,0);
                    break;
                case 'fb':
                case 'bf':
                    this.mirrorMesh(0,1,0);
                    break;
            }
        }
    };

    // todo: make more efficient by marking cube changes and only updating
    // todo: if this cube or one if it's neighbors has been changed
    CP.updateFaces = function() {
        if (this.mesh) {
            this.mesh.material = this.selected ? boxMaterialSelected : boxMaterial;
        }
        for (var k in this.faces) {
            if (!HAS(this.faces, k)) continue;
            var select = this.selected,
                face = this.faces[k],
                cube = face.cube,
                syn = this.isSynthetic(),
                sel = select && face === selectedFace,
                mat = select ? boxMaterialSelected : boxMaterial,
                adj = cube.adjacentCube(face),
                acf = cube.adjacentCubeFace(face, k),
                adjm = adj && adj.mesh,
                mark = face.mark != MARK.NONE;
            if (syn) {
                mat = select ? boxMaterialSelectedSynthetic : faceMaterialSynthetic;
            }
            // set adjacent face material
            if (adj && !adjm) {
                mat = faceMaterialInside;
            }
            if (mark) {
                if (face.mark === MARK.EMIT) mat = faceMaterialEmit;
                if (face.mark === MARK.SLIDE) mat = faceMaterialSlide;
            }
            // mark adjacent faces with this face's mark
            //if (acf && !adj.isSynthetic() && face.mark != MARK.NONE) {
            //    acf.mark = face.mark;
            //}
            if (sel) {
                mat = faceMaterialSelected;
            }
            face.inside = adj && !adjm;
            cube.setFaceMaterial(face.set.mi, mat);
            cube.showHideFace(face.set.mi, mark || sel || !(face.inside || this.mesh));
        }
        SPACE.update();
    };

    CP.clearMarks = function() {
        for (var k in this.faces) {
            if (!HAS(this.faces, k)) continue;
            this.faces[k].mark = MARK.NONE;
        }
        this.updateFaces();
    };

    CP.addSynthetic = function() {
        for (var k in this.faces) {
            if (!HAS(this.faces, k)) continue;
            var face = this.faces[k],
                krev = k.reverse(),
                offset = FACE[face.key];
            if (face.mark === MARK.EMIT) {
                var found = false,
                    build = [],
                    count = 1,
                    next;
                while (true) {
                    if (count > 50) break;
                    next = this.offsetCube(offset,count++);
                    if (!next) {
                        build.push(count-1);
                        continue;
                    }
                    if (next.isSynthetic()) continue;
                    if (next.faces[krev].mark === MARK.EMIT) {
                        found = true;
                        break;
                    } else {
                        return;
                    }
                }
                if (found) {
                    for (var i=0; i<build.length; i++) {
                        this.newAdjacent(face, build[i], true).add();
                    }
                }
            }
        }
    };

    CP.isSynthetic = function() {
        return this.synth;
    };
    CP.isSelected = function() {
        return this.selected;
    };

    CP.setSelected = function(select) {
        this.selected = select;
        scheduleUpdateFaces();
    };

    CP.cloneTo = function(x, y, z) {
        var cube = new Cube(x, y, z).add();
        if (cube) {
            for (var i=0; i<FACES.length; i++) {
                var k = FACES[i];
                cube.faces[k].mark = this.faces[k].mark;
            }
            cube.copyMesh(this);
        }
        return cube;
    };

    CP.cloneFrom = function(cube) {
        for (var i=0; i<FACES.length; i++) {
            var k = FACES[i];
            this.faces[k].mark = cube.faces[k].mark;
        }
        this.copyMesh(cube);
    };

    /** ******************************************************************
     * The Rest
     ******************************************************************* */

    function addCube(cube) {
        var key = cube.key;
        if (!matrix[key]) {
            matrix[key] = cube;
            SPACE.platform.add(cube.group);
            selectable.push(cube.boxM);
            scheduleUpdateFaces();
            return cube;
        }
        return null;
    }

    function removeCube(cube, nosynth) {
        var key = cube.key;
        if (matrix[key]) {
            delete matrix[key];
            SPACE.platform.remove(cube.group);
            selected.remove(cube);
            selectable.remove(cube.boxM);
        }
        if (!nosynth) removeSynthetic();
        scheduleUpdateFaces();
    }

    function markFace(face) {
        if (markMode != MARK.NONE) {
            var mark = markMode === MARK.CLEAR ? MARK.NONE : markMode;
            if (editMode === EDIT.MARK) {
                var sel = selectRegion(face, false, selectMode === SELECT.PLANE ? SELECT.PLANE : SELECT.CUBE);
                for (var i=0; i<sel.length; i++) {
                    sel[i].faces[face.key].mark = mark;
                }
            } else {
                face.mark = mark;
            }
            // todo make this way more efficient
            removeSynthetic();
        }
    }

    function deleteSelection() {
        var i = 0, list = selected.slice();
        while (i < list.length)  {
            removeCube(list[i++]);
        }
        scheduleUpdateFaces();
    }

    function clearSelections() {
        for (var k = 0; k < selected.length; k++) {
            selected[k].setSelected(false);
        }
        selectedFace = null;
        selected = [];
        updateSelectionStats();
    }

    function mirrorSelection() {
        cloneSelection(true);
    }

    function cloneSelection(mirror) {
        if (!selectedFace) return;
        var newcubes = [],
            i = 0,
            sfkey = selectedFace.key,
            cube, x, y, z, nx, ny, nz, hasface, newface,
            off = FACE[selectedFace.key];
        while (i < selected.length) {
            cube = selected[i++];
            if (cube.isSynthetic()) continue;
            x = cube.pos.x;
            y = cube.pos.y;
            z = cube.pos.z;
            if (mirror) {
                if (off.ox) x = selectedBounds.x.min + selectedBounds.x.max - x;
                if (off.oy) y = selectedBounds.y.min + selectedBounds.y.max - y;
                if (off.oz) z = selectedBounds.z.min + selectedBounds.z.max - z;
            }
            nx = x + off.ox * selectedBounds.dx;
            ny = y + off.oy * selectedBounds.dy;
            nz = z + off.oz * selectedBounds.dz;
            if (!hasface && selectedFace.cube === cube) hasface = cube;
            cube = cube.cloneTo(nx, ny, nz);
            if (cube) {
                newcubes.push(cube);
                if (!newface && hasface) newface = cube.faces[sfkey];
                if (mirror) {
                    sfkey = sfkey.reverse();
                    if (off.ox) { cube.mirrorSwapFace('lr') }
                    if (off.oy) { cube.mirrorSwapFace('fb') }
                    if (off.oz) { cube.mirrorSwapFace('tb') }
                }
            }
        }
        setSelection(newcubes);
        if (newface) selectedFace = newface;
        updateSynthetic = true;
        scheduleUpdateFaces();
    }

    function convertSelection() {
        var i = 0;
        while (i < selected.length) {
            selected[i++].synth = false;
        }
        scheduleUpdateFaces();
    }

    function selectionToGeometry(scale) {
        var vertices = [],
            normals = [],
            i = 0, cube, j, k, face, pos, off, fix, arr;

        while (i < selected.length) {
            cube = selected[i++];
            pos = cube.pos;
            if (cube.mesh) {
                var k = 0, arr = cube.mesh.geometry.attributes.position.array;
                while (k < arr.length) {
                    vertices.push(arr[k++] + pos.x);
                    vertices.push(arr[k++] + pos.y);
                    vertices.push(arr[k++] + pos.z);
                }
                continue;
            }
            for (j = 0; j < FACES.length; j++) {
                face = cube.faces[FACES[j]];
                if (face.inside && face.mark === MARK.NONE && cube.adjacentCube(face).isSelected()) continue;
                off = FACE[face.key];
                // output 2 triangles, 6 points, 18 elements
                if (off.ox) {
                    fix = pos.x + HALF * off.ox;
                    arr = [
                        // triangle 1
                        [fix, pos.y - HALF, pos.z - HALF],
                        [fix, pos.y + HALF, pos.z + HALF],
                        [fix, pos.y + HALF, pos.z - HALF],
                        // triangle 2
                        [fix, pos.y - HALF, pos.z - HALF],
                        [fix, pos.y - HALF, pos.z + HALF],
                        [fix, pos.y + HALF, pos.z + HALF]
                    ];
                    if (off.ox > 0) arr.reverse();
                }
                if (off.oy) {
                    fix = pos.y + HALF * off.oy;
                    arr = [
                        // triangle 1
                        [pos.x - HALF, fix, pos.z - HALF],
                        [pos.x + HALF, fix, pos.z + HALF],
                        [pos.x + HALF, fix, pos.z - HALF],
                        // triangle 2
                        [pos.x - HALF, fix, pos.z - HALF],
                        [pos.x - HALF, fix, pos.z + HALF],
                        [pos.x + HALF, fix, pos.z + HALF]
                    ];
                    if (off.oy < 0) arr.reverse();
                }
                if (off.oz) {
                    fix = pos.z + HALF * off.oz;
                    arr = [
                        // triangle 1
                        [pos.x - HALF, pos.y - HALF, fix],
                        [pos.x + HALF, pos.y + HALF, fix],
                        [pos.x + HALF, pos.y - HALF, fix],
                        // triangle 2
                        [pos.x - HALF, pos.y - HALF, fix],
                        [pos.x - HALF, pos.y + HALF, fix],
                        [pos.x + HALF, pos.y + HALF, fix]
                    ];
                    if (off.oz > 0) arr.reverse();
                }
                for (k = 0; k < arr.length; k++) {
                    vertices.appendAll(arr[k]);
                }
                normals.appendAll([
                    0,0,0,
                    0,0,0
                ]);
            }
        }
        if (scale) {
            for (i = 0; i < vertices.length; i++) {
                vertices[i] *= scale;
            }
        }
        return {vertices: vertices, normals: null};
    }

    function unitsToMM(units) {
        var num = parseFloat(units),
            scale = 10.0;
        units = units.toString();
        if (units.indexOf('mm') > 0) scale = 1.0;
        else if (units.indexOf('cm') > 0) scale = 10.0;
        else if (units.indexOf('in') > 0) scale = 25.4;
        else if (units.indexOf('ft') > 0) scale = 25.4 * 12;
        else if (units.indexOf('feet') > 0) scale = 25.4 * 12;
        else if (units.indexOf('yard') > 0) scale = 25.4 * 12 * 3;
        else if (units.indexOf('meter') > 0) scale = 100.0;
        else if (units.indexOf('m') > 0) scale = 10.0;
        return num * scale;
    }

    function geoToMesh(geo) {
        var newgeo = geo.clone(),
            mesh = new THREE.Mesh(newgeo, boxMaterial);
        newgeo.filename = geo.filename;
        mesh.filename = geo.filename;
        return mesh;
    }

    function getLibraryGeo(filename, callback) {
        if (!filename) return; // todo this should not happen -- bad encoding
        if (LIBCACHE[filename]) callback(LIBCACHE[filename]);
        MDB.getFile(filename, function(vertices) {
            if (!vertices) return callback();
            var geo = THREE.Geometry.fromVertices(vertices).unitScale().center().fixNormals();
            geo.filename = filename;
            callback(LIBCACHE[filename] = geo);
        });
    }

    function libraryToSelection(filename) {
        if (selected.length === 0) return alert("no selection for mesh");
        getLibraryGeo(filename, function(geo) {
            for (var i=0; i<selected.length; i++) {
                selected[i].setMesh(geoToMesh(geo));
            }
            updateFaces();
        });
    }

    function selectionClearMesh() {
        selected.forEach(function (m) {
            m.setMesh(null);
        });
        updateFaces();
    }

    function selectionToKiri() {
        if (selected.length === 0) return alert("make a selection to send");
        var scale = unitsToMM(spaceUnits),
            geo = selectionToGeometry(scale),
            name = prompt("Name of Selection", "");
        if (name && name.length > 0) KDB.putFile(name, geo.vertices.toFloat32(), function(done) {
            if (done) alert("selection sent to kiri");
        });
    }

    function selectionToLibrary() {
        if (selected.length === 0) return alert("make a selection to import");
        var scale = unitsToMM(spaceUnits),
            geo = selectionToGeometry(scale),
            name = prompt("Name of Selection", "");
        if (name && name.length > 0) MDB.putFile(name, geo.vertices.toFloat32());
    }

    function downloadSelection() {
        if (selected.length === 0) return alert("make a selection to export");
        var name = prompt("Download Name", spaceName);
        if (!name) return;
        var scale = unitsToMM(spaceUnits),
            geo = selectionToGeometry(scale),
            stl = new moto.STL().encode(geo.vertices, geo.normals),
            blob = new Blob([stl], {type: 'application/octet-binary'}),
            save = saveAs(blob, name+".stl");
    }

    function sendWorkspace(to) {
        var data = (to || gs_meta.sendTo)+"/data/"+spaceID,
            space = (to || gs_meta.sendTo)+"/meta/#"+spaceID;
        new moto.Ajax(function(res, ajax) {
            if (res) WIN.location = space;
        }).request(data, SDB['workspace']);
    }

    function selectAll() {
        selected = [];
        for (var i = 0; i < selectable.length; i++) {
            var cube = selectable[i].cube;
            cube.setSelected(true);
            selected.push(cube);
        }
        updateSelectionStats();
    }

    function setSelection(cubes) {
        clearSelections();
        selected = cubes;
        for (var i=0; i<cubes.length; i++) cubes[i].setSelected(true);
        updateSelectionStats();
    }

    function selectRegion(face, modify, type) {
        var cache = {},
            cube = face.cube,
            stack = [cube],
            mode = !cube.isSelected(),
            fkey = face.key,
            revkey = fkey.reverse(),
            pkeys = [fkey, revkey],
            newSelected = [],
            selType = type || selectMode,
            k, next;
        while (stack.length > 0) {
            cube = stack.pop();
            if (modify) cube.setSelected(mode);
            cache[cube.key] = cube;
            for (k in cube.faces) {
                if (!HAS(cube.faces, k)) continue;
                face = cube.faces[k];
                if (selType === SELECT.CUBE) break;
                if (selType === SELECT.DRILL && k != revkey) continue;
                if (selType === SELECT.PLANE && pkeys.contains(k)) continue;
                if (selType === SELECT.REGION) {
                    if (face.mark != MARK.NONE) continue;
                    var adjface = cube.adjacentCubeFace(face,k);
                    if (adjface && adjface.mark !== MARK.NONE) continue;
                }
                next = cube.adjacentCube(face);
                if (next && !cache[next.key]) {
                    if (next.isSynthetic() && !cube.isSynthetic()) {
                        if (selType === SELECT.REGION || !modify) continue;
                    }
                    stack.push(next);
                }
            }
        }
        if (modify) {
            for (k in matrix) {
                if (HAS(matrix,k)) {
                    if ((cube = matrix[k]).isSelected()) newSelected.push(cube)
                }
            }
        } else {
            for (k in cache) {
                if (HAS(cache,k)) {
                    if (!(cube = cache[k]).isSynthetic()) {
                        newSelected.push(cube);
                    }
                }
            }
        }
        if (modify) {
            selected = newSelected;
            scheduleUpdateFaces();
            updateSelectionStats();
        }
        return newSelected;
    }

    function updateSelectionStats() {
        var bounds = new Bounds();
        UI.sel_b.value = selected.length || '';
        if (selected.length === 0) {
            UI.sel_x.value = '';
            UI.sel_y.value = '';
            UI.sel_z.value = '';
        } else {
            var i = 0;
            while (i < selected.length) {
                bounds.update(selected[i++].pos);
            }
            UI.sel_x.value = bounds.dx;
            UI.sel_y.value = bounds.dy;
            UI.sel_z.value = bounds.dz;
        }
        selectedBounds = bounds;
    }

    function moveSelection(delta) {
        var k, rd = {x:ROUND(delta.x), y:-ROUND(delta.z), z:ROUND(delta.y)};
        // TODO ugly hack to workaround faces to box transition ... fix
        rd.ox = rd.x;
        rd.oy = rd.y;
        rd.oz = rd.z;
        for (k in selected) if (HAS(selected,k) && !selected[k].canMoveTo(rd)) return;
        for (k in selected) if (HAS(selected,k)) selected[k].moveTo(rd);
    }

    function moveComplete() {
        removeSynthetic();
        var i, list = selected.slice();
        for (i=0; i<list.length; i++) list[i].dropAndUpdate(dragCopy);
        if (!dragCopy) for (i=0; i<list.length; i++) matrix[list[i].key] = selected[i];
        scheduleUpdateFaces();
    }

    // todo called in too many places
    function scheduleUpdateFaces() {
        if (!updateFacesScheduled) {
            updateFacesScheduled = setTimeout(updateFaces, 10);
        }
    }

    function removeSynthetic() {
        var remove = [], i, k, cube;
        for (k in matrix) {
            if (HAS(matrix, k)) {
                cube = matrix[k];
                if (cube.isSynthetic()) remove.push(cube);
            }
        }
        for (i=0; i<remove.length; i++) removeCube(remove[i],true);
        updateSynthetic = true;
    }

    function updateFaces() {
        var i = 0, k;
        if (updateSynthetic && enablePost) {
            while (i < selectable.length) selectable[i++].cube.addSynthetic();
        }
        for (k in matrix) {
            if (HAS(matrix,k)) {
                matrix[k].updateFaces();
            }
        }
        updateFacesScheduled = false;
        updateSynthetic = false;
        SPACE.update();
    }

    function del_encode(array) {
        var idx = 0,
            val = array[idx++],
            out = [val];
        while (idx < array.length) {
            out.push(val - (val = array[idx++]));
        }
        return out;
    }

    function del_decode(array) {
        var idx = 0,
            val = array[idx++],
            out = [val];
        while (idx < array.length) {
            out.push(val -= array[idx++]);
        }
        return out;
    }

    function rle_encode(array) {
        var out = [],
            nv = null,
            v = array[0],
            i = 1,
            c = 1;
        while (i < array.length) {
            nv = array[i++];
            if (nv === v) {
                c++;
                continue;
            }
            out.push(c);
            out.push(v);
            v = nv;
            c = 1;
        }
        out.push(c);
        out.push(v);
        return out;
    }

    function rle_decode(array) {
        var out = [],
            i = 0,
            c, v;
        while (i < array.length) {
            c = array[i++];
            v = array[i++];
            while (c-- > 0) out.push(v);
        }
        return out;
    }

    function setSpaceUnits(units) {
        spaceUnits = units || '1 cm';
        UI.units.value = spaceUnits;
    }

    function updateSpaceName(name) {
        setSpaceName(name);
        updateSpacesList();
        SDB['spaceNames'] = JSON.stringify(SPACENAMES);
    }

    function setSpaceName(name) {
        spaceName = name || 'untitled';
        SPACENAMES[spaceID] = spaceName;
        UI.name.value = spaceName;
    }

    function setSpaceVersion(ver) {
        spaceVer = Math.max(ver || 1, 1);
        UI.version.value = spaceVer;
    }

    function setGridSize(size) {
        gridSize = ROUND(size);
        UI.grid.value = size;
        SPACE.platform.setGrid(gridSize, 1);
        SPACE.update();
    }

    function loadSTL(url, name) {
        new moto.STL().load(url, function(vertices) {
            if (vertices && vertices.length > 0) MDB.putFile(name, vertices);
        });
    }

    function seedCorners() {
        if (!SDB['meta-seed']) {
            loadSTL("/obj/meta-corner-1.stl","corner-1");
            loadSTL("/obj/meta-corner-2.stl","corner-2");
            loadSTL("/obj/meta-corner-3.stl","corner-3");
            loadSTL("/obj/meta-corner-4.stl","corner-4");
            SDB['meta-seed'] = new Date().getTime();
        }
    }

    function seedWorkspace() {
        new Cube(-1, 1, 0).add();
        new Cube(-1,-1, 0).add();
        new Cube( 1,-1, 0).add();
        new Cube( 1, 1, 0).add();
        new Cube( 1, 0, 0).add();
        new Cube(-1, 0, 0).add();
        new Cube( 0, 1, 0).add();
        new Cube( 0,-1, 0).add();
    }

    function newWorkspace() {
        if (!confirm("start a new workspace?")) return;
        spaceID = genKey();
        selectAll();
        deleteSelection();
        setGridSize(5);
        setSpaceName('newspace');
        setSpaceVersion(1);
        setSpaceUnits('1 cm');
        updateURL();
    }

    function updateSpaceState() {
        if (!SPACES.contains(spaceID)) {
            SPACES.push(spaceID);
            SPACENAMES[spaceID] = spaceName;
        }
        SDB['workspace-i'] = spaceID;
        SDB['workspace-v'] = spaceVer;
        SDB['spaces'] = JSON.stringify(SPACES);
        SDB['spaceNames'] = JSON.stringify(SPACENAMES);
        updateSpacesList();
    }

    function saveWorkspace() {
        var cubes = selectable,
            cube,
            face,
            px = [],
            py = [],
            pz = [],
            marks = [],
            files = [],
            mesh = [],
            mfac = [],
            mfro = [],
            mmir = [],
            manc = [],
            coded = 0,
            i = 0, k;

        selectable.sort(function(a,b) {
            return a.cube.key > b.cube.key ? 1 : -1;
        });

        while (i < cubes.length) {
            cube = cubes[i++].cube;
            if (cube.isSynthetic()) continue;
            if (cube.mesh) {
                var mr = cube.meshRotate,
                    fn = cube.mesh.filename,
                    fnp = files.indexOf(fn);
                if (fnp < 0) {
                    fnp = files.length;
                    files.push(fn);
                }
                mesh.push(fnp);
                mfac.append(mr.f);
                mfro.append(mr.r);
                mmir.append(mr.mx | (mr.my << 1) | (mr.mz << 2));
                manc.append(mr.ax + 1 | ((mr.ay + 1) << 2) | ((mr.az + 1) << 4));
            } else {
                mesh.push('-');
            }
            for (k = 0; k < FACES.length; k++) {
                face = cube.faces[FACES[k]];
                marks.push(face.mark || 1);
            }
            px.push(cube.pos.x);
            py.push(cube.pos.y);
            pz.push(cube.pos.z);
            coded++;
        }
        var save = JSON.stringify({
            files: files,
            cubes: coded,
            px: rle_encode(del_encode(px)),
            py: rle_encode(del_encode(py)),
            pz: rle_encode(del_encode(pz)),
            mark: rle_encode(marks),
            mesh: rle_encode(mesh),
            mfac: rle_encode(mfac),
            mfro: rle_encode(mfro),
            mmir: rle_encode(mmir),
            manc: rle_encode(manc),
            cam: SPACE.view.save(),
            grid: gridSize,
            name: spaceName,
            units: spaceUnits
        });

        SDB['workspace'] = save;

        new moto.Ajax(function(reply) {
            if (reply) {
                var res = JSON.parse(reply);
                if (res && res.ver) {
                    // server-side fork when save but not owned
                    if (res.space != spaceID) setSpaceName(spaceName+" new");
                    SDB['workspace-i'] = spaceID = res.space;
                    SDB['workspace-v'] = res.ver;
                    setSpaceVersion(res.ver);
                    updateURL();
                    updateSpaceState();
                }
            } else {
                updateSpaceState();
            }
        }).request(DATA + spaceID + "/" + spaceVer, save);
    }

    function updateSpacesList() {
        var models = UI.models,
            idx = SPACES.length- 1,
            html = [],
            id, name, button;

        while (idx >= 0) {
            id = SPACES[idx--];
            name = SPACENAMES[id] || id;
            html.push('<div><button id="smod_'+id+'" class="load">'+name+'</button><button id="dmod_'+id+'" class="del">x</button></div>');
        }
        models.innerHTML = html.join('');

        idx = SPACES.length - 1;
        while (idx >= 0) {
            id = SPACES[idx--];
            name = SPACENAMES[id] || id;
            button = $('smod_'+id);
            button.title = name;
            button.model = id;
            button.onclick = function() { restoreWorkspace(this.model) };
            button = $('dmod_'+id);
            button.title = name;
            button.model = id;
            button.onclick = function() { deleteWorkspace(this.model) };
        }
    }

    function deleteWorkspace(id) {
        var io = SPACES.indexOf(id);
        if (io >= 0) {
            if (!confirm("delete workspace "+(SPACENAMES[id] || id))) return;
            SPACES.splice(io,1);
            delete SPACENAMES[id];
            SDB['spaces'] = JSON.stringify(SPACES);
            SDB['spaceNames'] = JSON.stringify(SPACENAMES);
        }
        updateSpacesList();
    }

    function restoreWorkspaceVersion(ver) {
        restoreWorkspace(spaceID, Math.max(ver,1));
    }

    function restoreWorkspace(newID,ver) {
        if (newID) {
            LOC.hash = ver ? newID + "/" + ver : newID;
            spaceID = newID;
            spaceVer = ver || spaceVer;
            selectAll();
            deleteSelection();
        } else {
            SPACE.view.load({scale:0.1});
        }
        var hash = LOC.hash;
        if (hash.length > 1) {
            var x = hash.substring(1).split("/"),
                xs = x[0] || '',
                xv = x[1] || '',
                handled = false;
            if (xs && xs.length >= 4 && xs.length <= 8) {
                handled = true;
                new moto.Ajax(function (json) {
                    if (json && json.charAt(0) === '{') {
                        var rec = JSON.parse(json);
                        loadWorkspace(rec.rec);
                        spaceID = rec.space;
                        setSpaceVersion(rec.ver);
                        SDB['workspace'] = rec.rec;
                        SDB['workspace-i'] = spaceID;
                        SDB['workspace-v'] = spaceVer;
                        updateURL();
                        updateFaces();
                    } else {
                        restoreWorkspaceLocal();
                    }
                }).request(DATA + xs + "/" + xv);
            }
        }
        if (!handled) restoreWorkspaceLocal();
    }

    function restoreWorkspaceLocal() {
        spaceID = SDB['workspace-i'] || genKey();
        setSpaceVersion(SDB['workspace-v'] || 1);
        loadWorkspace(SDB['workspace']);
    }

    function forkWorkspace() {
        spaceID = genKey();
        setSpaceVersion(1);
        setSpaceName(spaceName+"_fork");
        updateURL();
        alert("workspace forked\nsave to start a new timeline");
    }

    function loadWorkspace(json) {
        if (json && json.length > 0) {
            var cubes = selectable.slice(),
                wrk = JSON.parse(json),
                pos = wrk.pos,
                px = wrk.px ? del_decode(rle_decode(wrk.px)) : null,
                py = wrk.py ? del_decode(rle_decode(wrk.py)) : null,
                pz = wrk.pz ? del_decode(rle_decode(wrk.pz)) : null,
                marks = rle_decode(wrk.mark),
                mesh = wrk.mesh ? rle_decode(wrk.mesh) : null,
                mfac = wrk.mfac ? rle_decode(wrk.mfac) : null,
                mfro = wrk.mfro ? rle_decode(wrk.mfro) : null,
                mmir = wrk.mmir ? rle_decode(wrk.mmir) : [],
                manc = wrk.manc ? rle_decode(wrk.manc) : [],
                files = wrk.files,
                count = wrk.cubes,
                cam = wrk.cam,
                pid = 0,
                fid = 0,
                mfr = 0,
                mp = 0,
                i = 0;
            while (i < cubes.length) {
                removeCube(cubes[i++]);
            }
            while (count-- > 0) {
                var cube = px ? new Cube(px[pid], py[pid], pz[pid++]) : new Cube(pos[pid++], pos[pid++], pos[pid++]),
                    mfile = mesh ? mesh[mp++] : null;
                for (i = 0; i < FACES.length; i++) {
                    cube.faces[FACES[i]].mark = marks[fid++];
                }
                if (!(mfile === null || mfile === '-') && mfac && mfro) {
                    (function() {
                        var mi = {c: cube, f: mfac[mfr], r: mfro[mfr], m: mmir[mfr], a:manc[mfr++]};
                        getLibraryGeo(files[mfile], function (geo) {
                            if (!geo) return;
                            mi.c.setMesh(geoToMesh(geo));
                            mi.c.setMeshRotation(mi.f, mi.r);
                            mi.c.setMeshMirror(mi.m & 1, mi.m & 2 ? 1 : 0, mi.m & 4 ? 1 : 0);
                            if (wrk.manc) mi.c.setMeshAnchor((mi.a & 3) - 1, ((mi.a >> 2) & 3) - 1, ((mi.a >> 4) & 3) - 1);
                            scheduleUpdateFaces();
                        });
                    })();
                }
                if (typeof(cube.pos.x + cube.pos.y + cube.pos.z) === 'number') cube.add();
            }
            setSpaceName(wrk.name || 'untitled');
            setSpaceUnits(wrk.units || '1 cm');
            setGridSize(wrk.grid || 5);
            SPACE.view.reset();
            if (cam) {
                SPACE.view.load(cam);
            } else {
                SPACE.view.top();
            }
        } else {
            seedWorkspace();
        }
        var spaces = SDB['spaces'],
            spaceNames = SDB['spaceNames'];
        if (spaceNames) {
            SPACENAMES = JSON.parse(spaceNames);
        }
        if (spaces) {
            SPACES = JSON.parse(spaces);
            updateSpacesList();
        }
        updateURL();
    }

    function watchHash() {
        if (hashWatcher) return;
        hashWatcher = setTimeout(function() {
            if (LOC.hash != HASHMATCH) restoreWorkspace();
            hashWatcher = null;
            watchHash();
        }, 100);
    }

    function updateURL() {
        HASHMATCH = "#"+spaceID+"/"+spaceVer;
        LOC.hash = HASHMATCH;
        watchHash();
    }

    function genKey() {
        while (true) {
            var k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

})();
