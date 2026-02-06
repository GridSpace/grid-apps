/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { Plane } from '../plane.js';

const SKETCH_COLORS = {
    planeDefault: { fill: 0x5a9fd4, fillOpacity: 0.1, outline: 0x5a9fd4, outlineOpacity: 0.65 },
    planeHover: { fill: 0xff9933, fillOpacity: 0.14, outline: 0xff9933, outlineOpacity: 0.95 },
    planeEdit: { fill: 0x9ec7ff, fillOpacity: 0.16, outline: 0x5a9fd4, outlineOpacity: 0.95 },
    linesGray: 0x8f8f8f,
    linesHover: 0xff9933,
    linesEdit: 0xffffff,
    labelDefault: '#8f8f8f',
    labelHover: '#ff9933',
    labelEdit: '#a7cbff'
};
const SKETCH_PLANE_SCALE = 0.86;
const SKETCH_PLANE_MIN_SIZE = 24;

function createSketchRuntimeApi(getApi) {
    return {
        root: null,
        sketches: new Map(), // id -> { feature, group, plane, entitiesGroup, lines: [] }
        hoveredId: null,
        editingId: null,

        init(world) {
            if (this.root) return;
            this.root = new THREE.Group();
            this.root.name = 'sketch-runtime';
            world.add(this.root);
        },

        sync() {
            const api = getApi();
            const features = api.features.list().filter(f => f?.type === 'sketch');
            const present = new Set(features.map(f => f.id));

            for (const [id, rec] of this.sketches.entries()) {
                if (!present.has(id)) {
                    this.removeLabel(rec);
                    this.root?.remove(rec.group);
                    rec.plane?.dispose?.();
                    this.sketches.delete(id);
                }
            }

            for (const feature of features) {
                let rec = this.sketches.get(feature.id);
                if (!rec) {
                    rec = this.createSketchRecord(feature);
                    this.sketches.set(feature.id, rec);
                    this.root?.add(rec.group);
                } else {
                    rec.feature = feature;
                }
                this.updateSketchRecord(rec);
            }
        },

        createSketchRecord(feature) {
            const group = new THREE.Group();
            group.name = `sketch-${feature.id}`;
            const plane = new Plane({
                id: `sketch-plane-${feature.id}`,
                name: feature.name || 'Sketch Plane',
                size: 160,
                showHandles: false,
                color: SKETCH_COLORS.planeDefault.fill,
                outlineColor: SKETCH_COLORS.planeDefault.outline,
                opacity: SKETCH_COLORS.planeDefault.fillOpacity,
                outlineOpacity: SKETCH_COLORS.planeDefault.outlineOpacity
            });
            const planeGroup = plane.getGroup();
            planeGroup.visible = false;

            const entitiesGroup = new THREE.Group();
            entitiesGroup.name = `sketch-entities-${feature.id}`;

            group.add(planeGroup);
            group.add(entitiesGroup);

            return {
                feature,
                group,
                plane,
                entitiesGroup,
                lines: [],
                labelId: `sketch-label-${feature.id}`
            };
        },

        updateSketchRecord(rec) {
            const feature = rec.feature;
            if (feature?.plane) {
                rec.plane.setFrame(this.toDisplayPlaneFrame(feature.plane));
            }
            this.rebuildEntities(rec);
            this.applySketchState(rec);
        },

        toDisplayPlaneFrame(frame) {
            if (!frame || typeof frame !== 'object') {
                return frame;
            }
            const out = JSON.parse(JSON.stringify(frame));
            const width = Number(out?.size?.width);
            const height = Number(out?.size?.height);
            if (Number.isFinite(width) && Number.isFinite(height)) {
                out.size.width = Math.max(SKETCH_PLANE_MIN_SIZE, width * SKETCH_PLANE_SCALE);
                out.size.height = Math.max(SKETCH_PLANE_MIN_SIZE, height * SKETCH_PLANE_SCALE);
            }
            return out;
        },

        rebuildEntities(rec) {
            while (rec.entitiesGroup.children.length) {
                const child = rec.entitiesGroup.children[0];
                child.geometry?.dispose?.();
                child.material?.dispose?.();
                rec.entitiesGroup.remove(child);
            }
            rec.lines = [];

            const entities = Array.isArray(rec.feature?.entities) ? rec.feature.entities : [];
            for (const entity of entities) {
                if (entity?.type !== 'line' || !entity.a || !entity.b) {
                    continue;
                }
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(entity.a.x || 0, entity.a.y || 0, 0),
                    new THREE.Vector3(entity.b.x || 0, entity.b.y || 0, 0)
                ]);
                const material = new THREE.LineBasicMaterial({
                    color: SKETCH_COLORS.linesGray,
                    transparent: true,
                    opacity: 1,
                    depthWrite: false
                });
                const line = new THREE.Line(geometry, material);
                line.renderOrder = 7;
                rec.entitiesGroup.add(line);
                rec.lines.push(line);
            }
        },

        applySketchState(rec) {
            const feature = rec.feature || {};
            const visible = feature.visible !== false;
            const hovered = this.hoveredId === feature.id;
            const editing = this.editingId === feature.id;

            const showPlane = editing || hovered;
            const showEntities = visible || hovered || editing;

            rec.plane.setVisible(showPlane);
            rec.entitiesGroup.visible = showEntities;

            const mode = editing ? 'edit' : (hovered ? 'hover' : 'default');
            this.applyPlaneStyle(rec.plane, mode);
            this.applyEntityStyle(rec, mode);
            this.applyLabelState(rec, mode, showPlane);
        },

        applyPlaneStyle(plane, mode) {
            const style = mode === 'edit'
                ? SKETCH_COLORS.planeEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.planeHover
                    : SKETCH_COLORS.planeDefault;
            plane.setColor(style.fill);
            plane.setOpacity(style.fillOpacity);
            plane.setOutlineColor(style.outline);
            plane.setOutlineOpacity(style.outlineOpacity);
        },

        applyEntityStyle(rec, mode) {
            const color = mode === 'edit'
                ? SKETCH_COLORS.linesEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.linesHover
                    : SKETCH_COLORS.linesGray;
            for (const line of rec.lines) {
                line.material.color.setHex(color);
            }
        },

        applyLabelState(rec, mode, showPlane) {
            const api = getApi();
            const overlay = api.overlay;
            if (!overlay) return;

            if (!showPlane) {
                this.removeLabel(rec);
                return;
            }

            const text = rec.feature?.name || 'Sketch';
            const color = mode === 'edit'
                ? SKETCH_COLORS.labelEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.labelHover
                    : SKETCH_COLORS.labelDefault;
            const pos3d = this.getPlaneLabelPosition(rec.plane);
            const id = rec.labelId;

            if (overlay.elements.has(id)) {
                overlay.update(id, { pos3d, text, color });
            } else {
                overlay.add(id, 'text', {
                    pos3d,
                    text,
                    color,
                    fontSize: 13,
                    anchor: 'start',
                    className: 'sketch-label'
                });
            }
        },

        removeLabel(rec) {
            const api = getApi();
            api.overlay?.remove(rec?.labelId);
        },

        getPlaneLabelPosition(plane) {
            return plane.getTopLeftCorner();
        },

        setHovered(featureId) {
            this.hoveredId = featureId || null;
            this.refreshStates();
        },

        setEditing(featureId) {
            this.editingId = featureId || null;
            this.refreshStates();
        },

        refreshStates() {
            for (const rec of this.sketches.values()) {
                this.applySketchState(rec);
            }
        }
    };
}

export { createSketchRuntimeApi };
