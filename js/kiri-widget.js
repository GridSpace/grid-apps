/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_widget = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.Widget) return;

    var KIRI = self.kiri,
        DRIVERS = KIRI.driver,
        CAM = DRIVERS.CAM,
        FDM = DRIVERS.FDM,
        LASER = DRIVERS.LASER,
        CPRO = CAM.process,
        BASE = self.base,
        CONF = BASE.config,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        MATH = Math,
        ABS = MATH.abs,
        MIN = MATH.min,
        MAX = MATH.max,
        SQRT = MATH.sqrt,
        CEIL = MATH.ceil,
        FLOOR = MATH.floor,
        ROUND = MATH.round,
        SLICER = KIRI.slicer,
        newLine = BASE.newLine,
        newPoint = BASE.newPoint,
        newSlice = KIRI.newSlice,
        newPolygon = BASE.newPolygon,
        newOrderedLine = BASE.newOrderedLine,
        time = UTIL.time,
        PRO = Widget.prototype,
        solid_opacity = 1.0,
        nextId = 0;

    KIRI.Widget = Widget;
    KIRI.newWidget = newWidget;

    function newWidget(id) { return new Widget(id) }

    /** ******************************************************************
     * Constructor
     ******************************************************************* */

    /**
     * @params {String} [id]
     * @constructor
     */
    function Widget(id) {
        this.id = id || new Date().getTime().toString(36)+(nextId++);
        this.mesh = null;
        this.points = null;
        // todo resolve use of this vs. mesh.bounds
        this.bounds = null;
        this.wire = null;
        this.topo = null;
        this.slices = null;
        this.settings = null;
        this.modified = true;
        this.orient = {
            scale: {
                x: 1.0,
                y: 1.0,
                z: 1.0
            },
            rot: {
                x: 0,
                y: 0,
                z: 0
            },
            pos: {
                x: 0,
                y: 0,
                z: 0
            },
            mirror: false
        },
        this.stats = {
            slice_time: 0,
            load_time: 0,
            progress: 0
        };
        this.saved = false;
    }

    /** ******************************************************************
     * Widget Class Functions
     ******************************************************************* */

    Widget.loadFromCatalog = function(filename, ondone) {
        KIRI.catalog.getFile(filename, function(data) {
            ondone(newWidget().loadVertices(data));
        });
    };

    Widget.loadFromState = function(id, ondone, move) {
        var widget = newWidget();
        widget.id = id;
        widget.saved = time();
        KIRI.odb.get('ws-save-'+id, function(data) {
            if (data) {
                var vertices = data.geo || data,
                    orient = data.orient || null;
                ondone(widget.loadVertices(vertices));
                // restore widget position if specified
                if (move && orient && orient.pos) {
                    widget.orient = orient;
                    widget.move(orient.pos.x, orient.pos.y, orient.pos.z, true);
                }
            } else {
                ondone(null);
            }
        });
    };

    Widget.deleteFromState = function(id,ondone) {
        KIRI.odb.remove('ws-save-'+id, ondone);
    };

    /**
     * converts a geometry point array into a kiri point array
     * with auto-decimation
     *
     * @param {Float32Array} array
     * @param {boolean} [decimate]
     * @returns {Array}
     */
    Widget.verticesToPoints = function(array,decimate) {
        var parr = new Array(array.length / 3),
            i = 0,
            j = 0,
            t = time(),
            hash = {},
            unique = 0,
            passes = 0,
            points,
            oldpoints = parr.length,
            newpoints;
        // replace point objects with their equivalents
        while (i < array.length) {
            var p = newPoint(array[i++], array[i++], array[i++]),
                k = p.key,
                m = hash[k];
            if (!m) {
                m = p;
                hash[k] = p;
                unique++;
            }
            parr[j++] = m;
        }
        // decimate until all point spacing > precision_decimate
        while (parr.length > BASE.config.decimate_threshold && decimate && BASE.config.precision_decimate > 0.0) {
            var lines = [], line, dec = 0;
            for (i=0; i<oldpoints; ) {
                var p1 = parr[i++],
                    p2 = parr[i++],
                    p3 = parr[i++];
                lines.push( {p1:p1, p2:p2, d:SQRT(p1.distToSq3D(p2))} );
                lines.push( {p1:p1, p2:p3, d:SQRT(p1.distToSq3D(p3))} );
                lines.push( {p1:p2, p2:p3, d:SQRT(p2.distToSq3D(p3))} );
            }
            // sort by ascending line length
            lines.sort(function(a,b) {
                return a.d - b.d
            });
            // create offset mid-points
            for (i=0; i<lines.length; i++) {
                line = lines[i];
                if (line.d >= BASE.config.precision_decimate) break;
                if (line.p1.op || line.p2.op) continue;
                // todo skip dropping lines where either point is a "sharp" on 3 vectors
                line.p1.op = line.p2.op = line.p1.midPointTo3D(line.p2);
                dec++;
            }
            // exit if nothing to decimate
            if (dec === 0) break;
            passes++;
            // create new facets
            points = new Array(oldpoints);
            newpoints = 0;
            for (i=0; i<oldpoints; ) {
                var p1 = parr[i++],
                    p2 = parr[i++],
                    p3 = parr[i++];
                // drop facets with two offset points
                if (p1.op && p1.op === p2.op) continue;
                if (p1.op && p1.op === p3.op) continue;
                if (p2.op && p2.op === p3.op) continue;
                // otherwise emit altered facet
                points[newpoints++] = p1.op || p1;
                points[newpoints++] = p2.op || p2;
                points[newpoints++] = p3.op || p3;
            }
            parr = points.slice(0,newpoints);
            oldpoints = newpoints;
        }
        if (passes) DBUG.log({
            before: array.length / 3,
            after: parr.length,
            unique: unique,
            decimations: passes,
            time: (time() - t)
        });
        return parr;
    };

    Widget.pointsToVertices = function(points) {
        var vertices = new Float32Array(points.length * 3),
            i = 0, vi = 0;
        while (i < points.length) {
            vertices[vi++] = points[i].x;
            vertices[vi++] = points[i].y;
            vertices[vi++] = points[i++].z;
        }
        return vertices;
    };

    /** ******************************************************************
     * Widget Prototype Functions
     ******************************************************************* */

    PRO.saveToCatalog = function(filename) {
        var widget = this;
        var time = UTIL.time();
        KIRI.catalog.putFile(filename, this.getGeoVertices(), function(vertices) {
            if (vertices && vertices.length) {
                console.log("saving decimated mesh ["+vertices.length+"] time ["+(UTIL.time()-time)+"]");
                widget.loadVertices(vertices);
            }
        });
        return this;
    };

    PRO.saveState = function(ondone) {
        var widget = this;
        KIRI.odb.put('ws-save-'+this.id, {geo:widget.getGeoVertices(), orient:widget.orient}, function(result) {
            widget.saved = time();
            if (ondone) ondone();
        });
    };

    PRO.encodeSlices = function() {
        var encoded = [];
        if (this.slices) this.slices.forEach(function(slice) {
            encoded.push(slice.encode());
        });
        return encoded;
    };

    PRO.decodeSlices = function(encoded) {
        this.slices = KIRI.codec.decode(encoded, { mesh:this.mesh });
    };

    /**
     *
     * @param {Float32Array} vertices
     * @returns {Widget}
     */
    PRO.loadVertices = function(vertices) {
        if (this.mesh) {
            this.mesh.geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
            this.mesh.geometry.computeFaceNormals();
            this.mesh.geometry.computeVertexNormals();
            this.points = null;
            return this;
        } else {
            var geometry = new THREE.BufferGeometry();
            geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
            return this.loadGeometry(geometry);
        }
    };

    /**
     * @param {THREE.Geometry} geometry
     * @returns {Widget}
     */
    PRO.loadGeometry = function(geometry) {
        var mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({
                color: 0xffff00,
                specular: 0x181818,
                shininess: 100,
                transparent: true,
                opacity: solid_opacity
            })
        );

        // fix invalid normals
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        // to fix mirroring of normals not working as expected
        mesh.material.side = THREE.DoubleSide;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.widget = this;
        this.mesh = mesh;
        // invalidates points cache (like any scale/rotation)
        this.center();
        return this;
    };

    /**
     * @param {Point[]} points
     * @returns {Widget}
     */
    PRO.setPoints = function(points) {
        this.points = points || null;
        return this;
    };

    /**
     * remove slice data and their views
     */
    PRO.clearSlices = function() {
        var slices = this.slices,
            mesh = this.mesh;
        if (slices) {
            slices.forEach(function(slice) {
                mesh.remove(slice.view);
            });
            this.slices = null;
        }
    };

    /**
     * @param {number} color
     */
    PRO.setColor = function(color) {
        var material = this.mesh.material;
        material.color.set(color);
    };

    /**
     * @param {number} value
     */
    PRO.setOpacity = function(value) {
        var mesh = this.mesh;
        if (value <= 0.0) {
            mesh.material.transparent = solid_opacity < 1.0;
            mesh.material.opacity = solid_opacity;
            mesh.material.visible = false;
        } else if (UTIL.inRange(value, 0.0, solid_opacity)) {
            mesh.material.transparent = value < 1.0;
            mesh.material.opacity = value;
            mesh.material.visible = true;
        }
    };

    /**
     * center geometry bottom (on platform) at 0,0,0
     */
    PRO.center = function() {
        var i = 0,
            mesh = this.mesh,
            geo = mesh.geometry,
            bb = mesh.getBoundingBox(true),
            bm = bb.min.clone(),
            bM = bb.max.clone(),
            bd = bM.sub(bm).multiplyScalar(0.5),
            gap = geo.attributes.position,
            pa = gap.array;
        // center point array on 0,0,0
        for ( ; i < pa.length; i += 3) {
            pa[i    ] -= bm.x + bd.x;
            pa[i + 1] -= bm.y + bd.y;
            pa[i + 2] -= bm.z;
        }
        gap.needsUpdate = true;
        bb = mesh.getBoundingBox(true);
        // for use with the packer
        mesh.w = (bb.max.x - bb.min.x);
        mesh.h = (bb.max.y - bb.min.y);
        mesh.d = (bb.max.z - bb.min.z);
        // invalidate cached points
        this.points = null;
        this.modified = true;
    };

    /**
     * moves top of widget to given Z
     * used in CAM mode
     *
     * @param {number} z position
     */
    PRO.setTopZ = function(z) {
        var mesh = this.mesh,
            pos = this.orient.pos;
        if (z) {
            pos.z = mesh.getBoundingBox().max.z - z;
            mesh.position.z = -pos.z - 0.01;
        } else {
            pos.z = 0;
            mesh.position.z = 0;
        }
        this.modified = true;
    }

    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {boolean} abs
     */
    PRO.move = function(x, y, z, abs) {
        var mesh = this.mesh,
            pos = this.orient.pos;
        // do not allow moves in pure slice view
        if (!mesh.material.visible) return;
        if (abs) {
            mesh.position.set(x,y,z);
            pos.x = (x || 0);
            pos.y = (y || 0);
            pos.z = (z || 0);
        } else {
            mesh.position.x += ( x || 0);
            mesh.position.y += ( y || 0);
            mesh.position.z += (-z || 0);
            pos.x += (x || 0);
            pos.y += (y || 0);
            pos.z += (z || 0);
        }
        if (x || y || z) this.modified = true;
    };

    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    PRO.scale = function(x, y, z) {
        var mesh = this.mesh,
            scale = this.orient.scale;
        this.setWireframe(false);
        this.clearSlices();
        mesh.geometry.applyMatrix(new THREE.Matrix4().makeScale(x, y, z));
        this.center();
        scale.x *= (x || 1.0);
        scale.y *= (y || 1.0);
        scale.z *= (z || 1.0);
    };

    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    PRO.rotate = function(x, y, z) {
        this.setWireframe(false);
        this.clearSlices();
        this.mesh.geometry.applyMatrix(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0)));
        this.center();
        var rot = this.orient.rot;
        rot.x += (x || 0);
        rot.y += (y || 0);
        rot.z += (z || 0);
    };

    PRO.mirror = function() {
        this.setWireframe(false);
        this.clearSlices();
        var i,
            o = this.orient,
            geo = this.mesh.geometry,
            at = geo.attributes,
            pa = at.position.array,
            nm = at.normal.array;
        for (i = 0 ; i < pa.length; i += 3) {
            pa[i] = -pa[i];
            nm[i] = -nm[i];
        }
        geo.computeFaceNormals();
        geo.computeVertexNormals();
        this.center();
        o.mirror = !o.mirror;
    };

    PRO.getGeoVertices = function() {
        return this.mesh.geometry.getAttribute('position').array;
    };

    PRO.getPoints = function() {
        if (!this.points) {
            // convert and cache points from geometry vertices
            this.points = Widget.verticesToPoints(this.getGeoVertices());
        }
        return this.points;
    };

    PRO.getBoundingBox = function(refresh) {
        // if (this.mesh) return this.mesh.getBoundingBox();
        if (!this.bounds || refresh) {
            this.bounds = new THREE.Box3();
            this.bounds.setFromPoints(this.getPoints());
        }
        return this.bounds;
    };

    PRO.isModified = function() {
        return this.modified;
    };

    /**
     * processes points into facets, then into slices
     *
     * once upon a time there were multiple slicers. this was the fastest in most cases.
     * lines are added to all the buckets they cross. then buckets are processed in order.
     * buckets are contiguous ranges of z slicers. the advantage of this method is that
     * as long as a large percentage of lines do not cross large z distances, this reduces
     * the number of lines each slice has to consider thus improving speed.
     *
     * @params {Object} settings
     * @params {Function} [ondone]
     * @params {Function} [onupdate]
     * @params {boolean} [remote]
     */
    PRO.slice = function(settings, ondone, onupdate, remote) {
        var widget = this,
            startTime = UTIL.time();

        widget.settings = settings;

        onupdate(0.0001, "slicing");

        if (remote) {

            // executed from kiri.js
            KIRI.work.slice(settings, this, function (reply) {
                if (reply.update) {
                    onupdate(reply.update, reply.updateStatus);
                }
                if (reply.send_start) widget.xfer = {start: reply.send_start};
                if (reply.topo) widget.topo = reply.topo;
                if (reply.stats) widget.stats = reply.stats;
                if (reply.send_end) widget.stats.load_time = widget.xfer.start - reply.send_end;
                if (reply.slices) { widget.clearSlices(); widget.slices = [] };
                if (reply.slice) widget.slices.push(KIRI.codec.decode(reply.slice, {mesh:widget.mesh}));
                if (reply.error) {
                    ondone(false, reply.error);
                }
                if (reply.done) {
                    widget.modified = false;
                    ondone(true);
                }
            });

        } else {

            // executed from kiri-worker.js
            widget.clearSlices();

            var catchdone = function(error) {
                if (error) {
                    return ondone(error);
                }

                onupdate(1.0, "transferring");

                widget.stats.slice_time = UTIL.time() - startTime;
                widget.modified = false;

                ondone();
            };

            var catchupdate = function(progress, message) {
                onupdate(progress, message);
            };

            var driver = null;

            switch (settings.mode) {
                case 'LASER': driver = LASER; break;
                case 'FDM': driver = FDM; break;
                case 'CAM': driver = CAM; break;
            }

            if (driver) {
                driver.slice(settings, widget, catchupdate, catchdone);
            } else {
                DBUG.log('invalid mode: '+settings.mode);
                ondone('invalid mode: '+settings.mode);
            }
        }
    };

    PRO.getCamBounds = function(settings) {
        var bounds = this.getBoundingBox().clone();
        bounds.max.z += settings.process.camZTopOffset;
        return bounds;
    };

    /**
     * render all slice and processed data
     * @param {number} renderMode
     * @param {boolean} cam mode
     */
    PRO.render = function(renderMode, cam) {
        var slices = this.slices;
        if (!slices) return;
        // render outline
        slices.forEach(function(s) { s.renderOutline(renderMode) });
        // render shells
        slices.forEach(function(s) { s.renderShells(renderMode) });
        // render diff
        if (!cam) slices.forEach(function(s) { s.renderDiff() });
        // render solid fill (include solid flats/bridges)
        slices.forEach(function(s) { s.renderSolidFill() });
        // render solid fill outlines
        if (!cam) slices.forEach(function(s) { s.renderSolidOutlines() });
        // render sparse fill
        if (!cam) slices.forEach(function(s) { s.renderSparseFill() });
        // render supports
        if (!cam) slices.forEach(function(s) { s.renderSupport() });
    };

    PRO.hideSlices = function() {
        var showing = false;
        if (this.slices) this.slices.forEach(function(slice) {
            showing = showing || slice.view.visible;
            slice.view.visible = false;
        });
        return showing;
    };

    PRO.toggleWireframe = function (color, opacity) {
        this.setWireframe(!this.wire, color, opacity);
    };

    PRO.setWireframe = function(set, color, opacity) {
        var mesh = this.mesh,
            widget = this;
        if (this.wire) {
            mesh.remove(this.wire);
            this.wire = null;
            this.setOpacity(solid_opacity);
            this.hideSlices();
        }
        if (set) {
            widget.wire = base.render.wireframe(mesh, this.getPoints(), color);
            widget.setOpacity(opacity);
        }
    };

})();
