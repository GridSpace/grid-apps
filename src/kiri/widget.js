/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.Widget) return;

    const KIRI = self.kiri,
        DRIVERS = KIRI.driver,
        BASE = self.base,
        CONF = BASE.config,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        MATH = Math,
        SQRT = MATH.sqrt,
        PRO = Widget.prototype,
        time = UTIL.time,
        solid_opacity = 1.0;

    let nextId = 0,
        groups = [];

    KIRI.Widget = Widget;
    KIRI.newWidget = newWidget;

    function newWidget(id,group) { return new Widget(id,group) }

    /** ******************************************************************
     * Group helpers
     ******************************************************************* */

    let Group = Widget.Groups = {

        forid: function(id) {
            for (let i=0; i<groups.length; i++) {
                if (groups[i].id === id) return groups[i];
            }
            let group = [];
            group.id = id;
            groups.push(group);
            return group;
        },

        remove: function(widget) {
            groups.slice().forEach(group => {
                let pos = group.indexOf(widget);
                if (pos >= 0) {
                    group.splice(pos,1);
                }
                if (group.length === 0) {
                    pos = groups.indexOf(group);
                    groups.splice(pos,1);
                }
            });
        },

        blocks: function() {
            return groups.map(group => {
                return {
                    w: group[0].track.box.w,
                    h: group[0].track.box.h,
                    move: (x,y,z,abs) => {
                        group.forEach(widget => {
                            widget.mesh.material.visible = true;
                            widget._move(x, y, z, abs);
                        });
                    }
                };
            });
        },

        loadDone: function() {
            groups.forEach(group => {
                if (!group.centered) {
                    group[0].center();
                    group.centered = true;
                }
            });
        },

        bounds: function(group) {
            let bounds = null;
            group.forEach(widget => {
                let wb = widget.mesh.getBoundingBox(true);
                if (bounds) {
                    bounds = bounds.union(wb);
                } else {
                    bounds = wb;
                }
            });
            return bounds;
        }
    };

    /** ******************************************************************
     * Constructor
     ******************************************************************* */

    /**
     * @params {String} [id]
     * @constructor
     */
    function Widget(id,group) {
        this.id = id || new Date().getTime().toString(36)+(nextId++);
        this.group = group || [];
        this.group.push(this);
        if (!this.group.id) {
            this.group.id = this.id;
        }
        if (groups.indexOf(this.group) < 0) {
            groups.push(this.group);
        }
        this.mesh = null;
        this.points = null;
        // todo resolve use of this vs. mesh.bounds
        this.bounds = null;
        this.wire = null;
        this.topo = null;
        this.slices = null;
        this.settings = null;
        this.modified = true;
        this.track = {
            // box size for packer
            box: {
                w: 0,
                h: 0,
                d: 0
            },
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
        this.support = false; // is synthesized support widget
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
        KIRI.odb.get('ws-save-'+id, function(data) {
            if (data) {
                let vertices = data.geo || data,
                    track = data.track || undefined,
                    group = data.group || id,
                    widget = newWidget(id, Group.forid(group));
                widget.saved = time();
                ondone(widget.loadVertices(vertices));
                // restore widget position if specified
                if (move && track && track.pos) {
                    widget.track = track;
                    widget.move(track.pos.x, track.pos.y, track.pos.z, true);
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
        let parr = new Array(array.length / 3),
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
            let p = BASE.newPoint(array[i++], array[i++], array[i++]),
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
            let lines = [], line, dec = 0;
            for (i=0; i<oldpoints; ) {
                let p1 = parr[i++],
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
                let p1 = parr[i++],
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
        let vertices = new Float32Array(points.length * 3),
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
        let widget = this;
        let time = UTIL.time();
        KIRI.catalog.putFile(filename, this.getGeoVertices(), function(vertices) {
            if (vertices && vertices.length) {
                console.log("saving decimated mesh ["+vertices.length+"] time ["+(UTIL.time()-time)+"]");
                widget.loadVertices(vertices);
            }
        });
        return this;
    };

    PRO.saveState = function(ondone) {
        let widget = this;
        KIRI.odb.put('ws-save-'+this.id, {
            geo:widget.getGeoVertices(),
            track:widget.track,
            group:this.group.id
        }, function(result) {
            widget.saved = time();
            if (ondone) ondone();
        });
    };

    /**
     *
     * @param {Float32Array} vertices
     * @returns {Widget}
     */
    PRO.loadVertices = function(vertices) {
        if (this.mesh) {
            this.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            this.mesh.geometry.computeFaceNormals();
            this.mesh.geometry.computeVertexNormals();
            this.points = null;
            return this;
        } else {
            let geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            return this.loadGeometry(geometry);
        }
    };

    /**
     * @param {THREE.Geometry} geometry
     * @returns {Widget}
     */
    PRO.loadGeometry = function(geometry) {
        let mesh = new THREE.Mesh(
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
        this.center(true);
        return this;
    };

    PRO.groupBounds = function() {
        return Group.bounds(this.group);
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
        let slices = this.slices,
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
    PRO.setColor = function(color,settings) {
        if (Array.isArray(color)) {
            color = color[this.getExtruder(settings) % color.length];
        }
        let material = this.mesh.material;
        material.color.set(color);
    };

    /**
     * @param {number} value
     */
    PRO.setOpacity = function(value) {
        let mesh = this.mesh;
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
    PRO.center = function(init) {
        let bb = init ? this.mesh.getBoundingBox(true) : this.groupBounds(),
            bm = bb.min.clone(),
            bM = bb.max.clone(),
            bd = bM.sub(bm).multiplyScalar(0.5),
            dx = bm.x + bd.x,
            dy = bm.y + bd.y,
            dz = bm.z;
        // move mesh for each widget in group
        if (!init) {
            this.group.forEach(w => {
                w.moveMesh(dx,dy,dz);
            });
        }
    };

    /**
     * called by center() and Group.center()
     */
    PRO.moveMesh = function(x, y, z) {
        let gap = this.mesh.geometry.attributes.position,
            pa = gap.array;
        // center point array on 0,0,0
        for (let i=0; i < pa.length; i += 3) {
            pa[i    ] -= x;
            pa[i + 1] -= y;
            pa[i + 2] -= z;
        }
        gap.needsUpdate = true;
        let bb = this.groupBounds();
        this.track.box = {
            w: (bb.max.x - bb.min.x),
            h: (bb.max.y - bb.min.y),
            d: (bb.max.z - bb.min.z)
        };
        // for use with the packer
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
        let mesh = this.mesh,
            pos = this.track.pos;
        if (z) {
            pos.z = mesh.getBoundingBox().max.z - z;
            mesh.position.z = -pos.z - 0.01;
        } else {
            pos.z = 0;
            mesh.position.z = 0;
        }
        this.modified = true;
    }

    PRO.move = function(x, y, z, abs) {
        this.group.forEach(w => {
            w._move(x, y, z, abs);
        });
    };

    PRO._move = function(x, y, z, abs) {
        let mesh = this.mesh,
            pos = this.track.pos;
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
        if (x || y || z) {
            this.modified = true;
            KIRI.api.event.emit('widget.move', {widget: this, pos});
        }
    };

    PRO.scale = function(x, y, z) {
        this.group.forEach(w => {
            w._scale(x, y, z);
        });
        this.center();
    };

    PRO._scale = function(x, y, z) {
        let mesh = this.mesh,
            scale = this.track.scale;
        this.bounds = null;
        this.setWireframe(false);
        this.clearSlices();
        mesh.geometry.applyMatrix4(new THREE.Matrix4().makeScale(x, y, z));
        scale.x *= (x || 1.0);
        scale.y *= (y || 1.0);
        scale.z *= (z || 1.0);
    };

    PRO.rotate = function(x, y, z) {
        this.group.forEach(w => {
            w._rotate(x, y, z, false);
        });
        this.center();
    };

    PRO._rotate = function(x, y, z, temp) {
        if (!temp) {
            this.bounds = null;
            this.setWireframe(false);
            this.clearSlices();
        }
        let m4 = new THREE.Matrix4();
        let euler = typeof(x) === 'number';
        if (euler) {
            m4 = m4.makeRotationFromEuler(new THREE.Euler(x || 0, y || 0, z || 0));
        } else {
            m4 = m4.makeRotationFromQuaternion(x);
        }
        this.mesh.geometry.applyMatrix4(m4);
        if (!temp && euler) {
            let rot = this.track.rot;
            rot.x += (x || 0);
            rot.y += (y || 0);
            rot.z += (z || 0);
        }
    };

    PRO.mirror = function() {
        this.group.forEach(w => {
            w._mirror();
        });
        this.center();
    };

    PRO._mirror = function() {
        this.setWireframe(false);
        this.clearSlices();
        let i,
            o = this.track,
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
        if (!this.bounds || refresh) {
            this.bounds = new THREE.Box3();
            this.bounds.setFromPoints(this.getPoints());
        }
        return this.bounds;
    };

    PRO.isModified = function() {
        return this.modified;
    };

    PRO.getExtruder = function(settings) {
        if (settings && settings.widget) {
            let rec = settings.widget[this.id];
            return rec && rec.extruder >= 0 ? rec.extruder : 0;
        }
        return 0;
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
        let widget = this,
            startTime = UTIL.time();

        widget.settings = settings;
        widget.clearSlices();
        onupdate(0.0001, "slicing");

        if (remote) {
            // in case result of slice is nothing, do not preserve previous
            widget.slices = []

            // executed from kiri.js
            KIRI.work.slice(settings, this, function (reply) {
                if (reply.update) {
                    onupdate(reply.update, reply.updateStatus);
                }
                if (reply.send_start) {
                    widget.xfer = {start: reply.send_start};
                }
                if (reply.topo) {
                    widget.topo = reply.topo;
                }
                if (reply.stats) {
                    widget.stats = reply.stats;
                }
                if (reply.send_end) {
                    widget.stats.load_time = widget.xfer.start - reply.send_end;
                }
                if (reply.slice) {
                    widget.slices.push(KIRI.codec.decode(reply.slice, {mesh:widget.mesh}));
                }
                if (reply.polish) {
                    widget.polish = KIRI.codec.decode(reply.polish);
                }
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
            let catchdone = function(error) {
                if (error) {
                    return ondone(error);
                }

                onupdate(1.0, "transferring");

                widget.stats.slice_time = UTIL.time() - startTime;
                widget.modified = false;

                ondone();
            };

            let catchupdate = function(progress, message) {
                onupdate(progress, message);
            };

            let driver = DRIVERS[settings.mode.toUpperCase()];

            if (driver) {
                driver.slice(settings, widget, catchupdate, catchdone);
            } else {
                DBUG.log('invalid mode: '+settings.mode);
                ondone('invalid mode: '+settings.mode);
            }
        }
    };

    PRO.getCamBounds = function(settings) {
        let bounds = this.getBoundingBox().clone();
        bounds.max.z += settings.process.camZTopOffset;
        return bounds;
    };

    /**
     * render all slice and processed data
     */
    PRO.render = function() {
        let mark = Date.now();
        DRIVERS[this.settings.mode.toUpperCase()].sliceRender(this);
        if (KIRI.api.const.LOCAL) console.log({sliceRender: Date.now() - mark});
    };

    PRO.hideSlices = function() {
        let showing = false;
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
        let mesh = this.mesh,
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
