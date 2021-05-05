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

        list: () => {
            return groups.slice()
        },

        merge: (widgets) => {
            let grps = widgets.map(w => w.group).uniq();
            if (grps.length > 1) {
                let root = grps.shift();
                let rpos = root[0].track.pos;
                for (let grp of grps) {
                    for (let w of grp) {
                        let wpos = w.track.pos;
                        w.group = root;
                        w.moveMesh(rpos.x - wpos.x, rpos.y - wpos.y, rpos.z - wpos.z);
                        w._move(rpos.x, rpos.y, rpos.z, true);
                        root.push(w);
                    }
                    groups.splice(groups.indexOf(grp),1);
                }
            }
        },

        split: (widgets) => {
            for (let group of widgets.map(w => w.group).uniq()) {
                groups.splice(groups.indexOf(group),1);
                for (let widget of group) {
                    let nugroup = Group.forid(widget.id);
                    nugroup.push(widget);
                    widget.group = nugroup;
                }
            }
        },

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
    function Widget(id, group) {
        this.id = id || new Date().getTime().toString(36)+(nextId++);
        this.group = group || [];
        this.group.push(this);
        if (!this.group.id) {
            this.group.id = this.id;
        }
        if (groups.indexOf(this.group) < 0) {
            groups.push(this.group);
        }
        // rotation stack (for undo)
        this.roto = [];
        // added meshes (supports, tabs, etc)
        this.adds = [];
        // THREE Mesh and points
        this.mesh = null;
        this.points = null;
        // todo resolve use of this vs. mesh.bounds
        this.bounds = null;
        // wireframe
        this.wire = null;
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
            top: 0, // z top
            mirror: false
        },
        this.stats = {
            slice_time: 0,
            load_time: 0,
            progress: 0
        };
        this.meta = {
            url: null,
            file: null,
            saved: false
        };
        // if this is a synthesized support widget
        this.support = false;
    }

    /** ******************************************************************
     * Widget Class Functions
     ******************************************************************* */

    Widget.loadFromCatalog = function(filename, ondone) {
        KIRI.catalog.getFile(filename, function(data) {
            let widget = newWidget().loadVertices(data);
            widget.meta.file = filename;
            ondone(widget);
        });
    };

    Widget.loadFromState = function(id, ondone, move) {
        KIRI.odb.get('ws-save-'+id, function(data) {
            if (data) {
                let vertices = data.geo || data,
                    track = data.track || undefined,
                    group = data.group || id,
                    widget = newWidget(id, Group.forid(group)),
                    meta = data.meta || widget.meta,
                    ptr = widget.loadVertices(vertices);
                widget.meta = meta;
                // restore widget position if specified
                if (move && track && track.pos) {
                    widget.track = track;
                    widget.move(track.pos.x, track.pos.y, track.pos.z, true);
                }
                ondone(ptr);
            } else {
                ondone(null);
            }
        });
    };

    Widget.deleteFromState = function(id,ondone) {
        KIRI.odb.remove('ws-save-'+id, ondone);
    };

    /** ******************************************************************
     * Widget Prototype Functions
     ******************************************************************* */

    PRO.saveToCatalog = function(filename) {
        let widget = this;
        let time = UTIL.time();
        widget.meta.file = filename;
        widget.meta.save = time;
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
            geo: widget.getGeoVertices(),
            track: widget.track,
            group: this.group.id,
            meta: this.meta
        }, function(result) {
            widget.meta.saved = time();
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
            this.meta.vertices = vertices.length / 3;
            return this;
        } else {
            let geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            this.meta.vertices = vertices.length / 3;
            return this.loadGeometry(geometry);
        }
    };

    PRO.getVertices = function() {
        return this.mesh.geometry.attributes.position;
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
        mesh.renderOrder = 1;
        // fix invalid normals
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
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
        if (slices && mesh && mesh.remove) {
            slices.forEach(function(slice) {
                mesh.remove(slice.view);
            });
        }
        this.slices = null;
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
        this.track.center = { dx, dy, dz };
        // move mesh for each widget in group
        if (!init) {
            this.group.forEach(w => {
                w.moveMesh(dx,dy,dz);
            });
        }
        return this;
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
            pos = this.track.pos,
            ltz = this.last_top_z || {},
            mbz = mesh.getBoundingBox().max.z;
        if (z) {
            pos.z = mbz - z;
            mesh.position.z = -pos.z - 0.01;
            this.track.top = z;
        } else {
            pos.z = 0;
            mesh.position.z = 0;
            this.track.top = mbz;
        }
        let ntz = {
            pz: pos.z,
            mpz: mesh.position.z
        };
        this.modified |= (ltz.pz !== ntz.pz || ltz.mpz !== ntz.mpz);
        this.last_top_z = ntz;
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
        this.modified = true;
    };

    PRO.rotate = function(x, y, z, temp) {
        this.group.forEach(w => {
            w._rotate(x, y, z, temp);
        });
        this.center(false);
    };

    PRO.rotateRaw = function(x, y, z, temp) {
        this.group.forEach(w => {
            w._rotate(x, y, z, temp);
        });
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
        this.roto.push(m4);
        this.mesh.geometry.applyMatrix4(m4);
        if (!temp && euler) {
            let rot = this.track.rot;
            rot.x += (x || 0);
            rot.y += (y || 0);
            rot.z += (z || 0);
        }
        this.modified = true;
    };

    PRO.unrotate = function() {
        this.roto.reverse().forEach(m => {
            this.mesh.geometry.applyMatrix4(m.clone().invert());
        });
        this.roto = [];
        this.center();
        this.modified = true;
    };

    PRO.mirror = function() {
        this.group.forEach(w => {
            w._mirror();
        });
        this.center();
    };

    PRO._mirror = function() {
        this.clearSlices();
        this.setWireframe(false);
        let geo = this.mesh.geometry, ot = this.track;
        let pos = geo.attributes.position;
        let arr = pos.array;
        let count = pos.count;
        // invert x
        for (let i=0; i<count; i++) {
            arr[i*3] = -arr[i*3];
        }
        // invert face vertices
        for (let i=0; i<count; i+=3) {
            let x = arr[i*3+0];
            let y = arr[i*3+1];
            let z = arr[i*3+2];
            arr[i*3+0] = arr[i*3+6];
            arr[i*3+1] = arr[i*3+7];
            arr[i*3+2] = arr[i*3+8];
            arr[i*3+6] = x;
            arr[i*3+7] = y;
            arr[i*3+8] = z;
        }
        pos.needsUpdate = true;
        geo.computeFaceNormals();
        geo.computeVertexNormals();
        ot.mirror = !ot.mirror;
        this.modified = true;
        this.points = null;
    };

    PRO.getGeoVertices = function() {
        let geo = this.mesh.geometry;
        let pos = geo.getAttribute('position').array;
        if (geo.index) {
            let idx = geo.index.array;
            let len = idx.length;
            let p2 = new Float32Array(len * 3);
            let inc = 0;
            for (let i=0; i<len; i++) {
                let iv = idx[i];
                let ip = iv * 3;
                p2[inc++] = pos[ip++];
                p2[inc++] = pos[ip++];
                p2[inc++] = pos[ip];
            }
            return p2;
        } else {
            return pos;
        }
    };

    PRO.getPoints = function() {
        if (!this.points) {
            // convert and cache points from geometry vertices
            this.points = BASE.verticesToPoints(this.getGeoVertices(), {
                maxpass: 0 // disable decimation
            });
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

    // allow worker code to run in same memspace as client
    PRO.setInWorker = function() {
        this.inWorker = true;
        return this;
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
     */
    PRO.slice = function(settings, ondone, onupdate) {
        let widget = this;
        let startTime = UTIL.time();

        widget.settings = settings;
        widget.clearSlices();
        onupdate(0.0001, "slicing");

        if (KIRI.client && !widget.inWorker) {
            // in case result of slice is nothing, do not preserve previous
            widget.slices = []

            // executed from kiri.js
            KIRI.client.slice(settings, this, function(reply) {
                if (reply.update) {
                    onupdate(reply.update, reply.updateStatus);
                }
                if (reply.send_start) {
                    widget.xfer = {start: reply.send_start};
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
                if (reply.rotinfo) {
                    widget.rotinfo = reply.rotinfo;
                }
                if (reply.done) {
                    ondone(true);
                }
                if (reply.error) {
                    ondone(false, reply.error);
                }
            });
        }

        if (KIRI.server) {
            // executed from kiri-worker.js
            let catchdone = function(error) {
                if (error) {
                    return ondone(error);
                }

                onupdate(1.0, "transfer");

                widget.stats.slice_time = UTIL.time() - startTime;

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

    /**
     * render to provided stack
     */
    PRO.render = function(stack) {
        const mark = Date.now();
        this.slices.forEach(slice => {
            if (slice.layers) {
                stack.add(slice.layers);
            }
        });
        return Date.now() - mark;
    };

    PRO.setWireframe = function(set, color, opacity) {
        let mesh = this.mesh,
            widget = this;
        if (this.wire) {
            mesh.remove(this.wire);
            this.wire = null;
            this.setOpacity(solid_opacity);
        }
        if (set) {
            widget.wire = base.render.wireframe(mesh, this.getPoints(), color);
        }
        if (opacity !== undefined) {
            widget.setOpacity(opacity);
        }
    };

    PRO.show = function() {
        this.mesh.visible = true;
    };

    PRO.hide = function() {
        this.mesh.visible = false;
    };

})();
