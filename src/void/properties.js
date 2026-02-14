/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';

const DATUM_OPTIONS = [
    { id: 'datum-xy', name: 'Top', key: 'xy' },
    { id: 'datum-yz', name: 'Right', key: 'yz' },
    { id: 'datum-xz', name: 'Front', key: 'xz' }
];
const PROPS_PANEL_POS_KEY = 'props_panel_pos';
const PANEL_MIN_LEFT = 10;
const PANEL_MIN_TOP = 60;

function resolveExtrudeProfileRef(profile = {}) {
    const regionId = String(profile?.region_id || '');
    const match = regionId.match(/^profile:([^:]+):([^:]+)$/);
    if (!match) return { regionId: null, sketchId: null, profileId: null, key: null };
    const sketchId = match[1];
    const profileId = match[2];
    return { regionId, sketchId, profileId, key: regionId };
}

function resolveChamferEdgeRefKey(edge = {}) {
    const ref = String(edge?.boundary_segment_id || edge?.entity?.id || '');
    if (!ref) return null;
    return api.solids?.getEdgeKeyForBoundaryRef?.(ref) || null;
}

function resolveChamferEdgeIdentity(edge = {}) {
    const edgeKey = String(edge?.key || '').trim();
    if (edgeKey) return `key:${edgeKey}`;
    const mapped = String(resolveChamferEdgeRefKey(edge) || '').trim();
    if (mapped) return `mapped:${mapped}`;
    const ref = String(edge?.boundary_segment_id || edge?.entity?.id || '').trim();
    if (ref) return `ref:${ref}`;
    const solidId = String(edge?.solidId || '').trim();
    const edgeIndex = Number(edge?.edgeIndex);
    if (solidId && Number.isFinite(edgeIndex)) {
        return `idx:${solidId}:${edgeIndex}`;
    }
    return null;
}

const properties = {
    panel: null,
    header: null,
    body: null,
    currentFeatureId: null,
    _onChange: null,
    _drag: null,
    _savedPos: null,
    _loadingPos: false,
    _booleanPickRole: 'targets',
    _extrudePickRole: 'profiles',
    _sessionStartRev: null,
    _sessionFeatureId: null,
    _sessionFeatureType: null,

    init() {
        if (this.panel) return;

        const panel = document.createElement('div');
        panel.className = 'props-panel hidden';
        panel.style.left = '300px';
        panel.style.top = '90px';

        const header = document.createElement('div');
        header.className = 'props-header';

        const title = document.createElement('div');
        title.className = 'props-title';
        title.textContent = 'Properties';

        const actions = document.createElement('div');
        actions.className = 'props-header-actions';

        const accept = document.createElement('button');
        accept.className = 'props-close';
        accept.textContent = '✓';
        accept.title = 'Accept';
        accept.onclick = () => this.hide('accept');

        const close = document.createElement('button');
        close.className = 'props-close';
        close.textContent = 'x';
        close.title = 'Cancel';
        close.onclick = () => this.hide('cancel');

        actions.appendChild(accept);
        actions.appendChild(close);
        header.appendChild(title);
        header.appendChild(actions);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'props-body';
        panel.appendChild(body);

        document.body.appendChild(panel);

        this.panel = panel;
        this.header = header;
        this.body = body;

        this.restorePosition();
        this.bindDrag();
    },

    setPanelPosition(x, y) {
        if (!this.panel) return;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
        this.panel.style.left = `${Math.max(PANEL_MIN_LEFT, x)}px`;
        this.panel.style.top = `${Math.max(PANEL_MIN_TOP, y)}px`;
    },

    applyPlacement(pos) {
        if (!this.panel || !pos) return;
        const anchor = String(pos.anchor || 'tl');
        const x = Number(pos.x);
        const y = Number(pos.y);
        if (!['tl', 'tr', 'bl', 'br'].includes(anchor)) return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        this.panel.style.left = 'auto';
        this.panel.style.right = 'auto';
        this.panel.style.top = 'auto';
        this.panel.style.bottom = 'auto';

        if (anchor[1] === 'r') {
            this.panel.style.right = `${Math.max(PANEL_MIN_LEFT, x)}px`;
        } else {
            this.panel.style.left = `${Math.max(PANEL_MIN_LEFT, x)}px`;
        }
        if (anchor[0] === 'b') {
            this.panel.style.bottom = `${Math.max(PANEL_MIN_LEFT, y)}px`;
        } else {
            this.panel.style.top = `${Math.max(PANEL_MIN_TOP, y)}px`;
        }
    },

    restorePosition() {
        if (this._loadingPos) return;
        this._loadingPos = true;
        const admin = api.db?.admin;
        if (!admin) {
            this._loadingPos = false;
            return;
        }
        admin.get(PROPS_PANEL_POS_KEY).then(pos => {
            if (!pos || !this.panel) return;
            // Backward compatible with legacy format { x, y }.
            if (!pos.anchor) {
                const x = Number(pos.x);
                const y = Number(pos.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                this._savedPos = { x, y };
                this.setPanelPosition(x, y);
                return;
            }
            const anchor = String(pos.anchor);
            const x = Number(pos.x);
            const y = Number(pos.y);
            if (!['tl', 'tr', 'bl', 'br'].includes(anchor)) return;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            this._savedPos = { anchor, x, y };
            this.applyPlacement(this._savedPos);
        }).catch(() => {
            // ignore persistence read errors
        }).finally(() => {
            this._loadingPos = false;
        });
    },

    persistPosition() {
        const admin = api.db?.admin;
        if (!admin || !this.panel) return;
        const rect = this.panel.getBoundingClientRect();
        const midX = window.innerWidth / 2;
        const midY = window.innerHeight / 2;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const horizontal = centerX >= midX ? 'r' : 'l';
        const vertical = centerY >= midY ? 'b' : 't';
        const pos = { anchor: `${vertical}${horizontal}` };
        if (horizontal === 'r') {
            pos.x = Math.round(window.innerWidth - rect.right);
        } else {
            pos.x = Math.round(rect.left);
        }
        if (vertical === 'b') {
            pos.y = Math.round(window.innerHeight - rect.bottom);
        } else {
            pos.y = Math.round(rect.top);
        }
        this._savedPos = pos;
        admin.put(PROPS_PANEL_POS_KEY, pos).catch(() => {
            // ignore persistence write errors
        });
    },

    bindDrag() {
        if (!this.header || !this.panel) return;
        this.header.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            const rect = this.panel.getBoundingClientRect();
            this._drag = {
                dx: event.clientX - rect.left,
                dy: event.clientY - rect.top
            };
            event.preventDefault();
        });

        window.addEventListener('mousemove', event => {
            if (!this._drag || !this.panel) return;
            const x = event.clientX - this._drag.dx;
            const y = event.clientY - this._drag.dy;
            this.setPanelPosition(x, y);
        });

        window.addEventListener('mouseup', () => {
            if (this._drag) {
                this.persistPosition();
            }
            this._drag = null;
        });

        window.addEventListener('resize', () => {
            if (!this.panel || this.panel.classList.contains('hidden') || !this._savedPos) return;
            if (this._savedPos.anchor) {
                this.applyPlacement(this._savedPos);
            } else {
                this.setPanelPosition(this._savedPos.x, this._savedPos.y);
            }
        });
    },

    async showFeature(feature, opts = {}) {
        this.init();
        if (!feature || !this.panel || !this.body) return;
        this.currentFeatureId = feature.id;
        this._sessionFeatureId = feature.id;
        this._sessionFeatureType = feature.type || null;
        this._sessionStartRev = api.document.current?.head_rev || null;
        api.document.beginAtomicEdit({
            feature_id: this._sessionFeatureId,
            feature_type: this._sessionFeatureType
        });
        this._onChange = opts.onChange || null;
        api.sketchRuntime?.setEditing(feature.type === 'sketch' ? feature.id : null);
        if (feature.type !== 'sketch') {
            api.interact?.clearSketchSelection?.();
        }
        if (feature.type === 'chamfer') {
            await api.solids?.beginChamferEdgeSnapshot?.(feature.id);
        } else {
            api.solids?.endChamferEdgeSnapshot?.();
        }
        if (this._savedPos) {
            if (this._savedPos.anchor) {
                this.applyPlacement(this._savedPos);
            } else {
                this.setPanelPosition(this._savedPos.x, this._savedPos.y);
            }
        } else {
            this.restorePosition();
        }
        this.panel.classList.remove('hidden');
        this.renderFeature(feature);
        this.syncExtrudeProfileSelection(feature);
        api.sketchRuntime?.sync?.();
        if (feature.type !== 'chamfer') {
            api.solids?.scheduleRebuild?.('feature.edit.enter');
        }
        window.dispatchEvent(new CustomEvent('void-state-change'));
    },

    async hide(mode = 'accept') {
        if (!this.panel) return;
        const editedFeatureId = this._sessionFeatureId || null;
        if (mode === 'cancel') {
            const startRev = this._sessionStartRev || null;
            const currentRev = api.document.current?.head_rev || null;
            if (startRev && currentRev && startRev !== currentRev) {
                const revision = await api.document.getRevision(startRev);
                if (revision) {
                    await api.document.applyRevision(revision);
                    if (typeof this._onChange === 'function') {
                        this._onChange();
                    }
                }
            }
            await api.document.endAtomicEdit({ commit: false });
        } else {
            await api.document.endAtomicEdit({
                commit: true,
                opType: 'feature.atomic.edit',
                payload: {
                    feature_id: this._sessionFeatureId,
                    feature_type: this._sessionFeatureType
                }
            });
            if (typeof this._onChange === 'function') {
                this._onChange();
            }
        }
        this.panel.classList.add('hidden');
        api.solids?.endChamferEdgeSnapshot?.();
        api.interact?.clearSketchSelection?.();
        api.sketchRuntime?.setEditing(null);
        if (editedFeatureId) {
            api.sketchRuntime?.clearEntityInteraction?.(editedFeatureId);
        }
        api.sketchRuntime?.setSelectedProfiles?.([]);
        api.sketchRuntime?.setHoveredProfile?.(null);
        this.syncExtrudeProfileSelection(null);
        this.syncExtrudeTargetSelection(null);
        this.syncBooleanSolidSelection(null);
        this.syncChamferEdgeSelection(null);
        this.currentFeatureId = null;
        this._sessionFeatureId = null;
        this._sessionFeatureType = null;
        this._sessionStartRev = null;
        this._onChange = null;
        api.sketchRuntime?.sync?.();
        if (editedFeatureId) {
            await api.solids?.rebuildDownstreamFrom?.(editedFeatureId, 'feature.edit.exit');
        } else {
            await api.solids?.rebuild?.('feature.edit.exit');
        }
        window.dispatchEvent(new CustomEvent('void-state-change'));
    },

    renderFeature(feature) {
        this.body.innerHTML = '';

        const kind = document.createElement('div');
        kind.className = 'props-meta';
        kind.textContent = feature?.type ? feature.type.toUpperCase() : 'FEATURE';
        this.body.appendChild(kind);

        this.body.appendChild(this.createTextField('Name', feature.name || '', value => {
            const updated = api.features.rename(feature.id, value);
            if (updated) this.onChanged();
        }));

        if (feature.type === 'sketch') {
            this.renderSketchFields(feature);
        } else if (feature.type === 'extrude') {
            this.renderExtrudeFields(feature);
        } else if (feature.type === 'chamfer') {
            this.renderChamferFields(feature);
        } else if (feature.type === 'boolean') {
            this.renderBooleanFields(feature);
        }
        this.syncExtrudeProfileSelection(feature);
        this.syncExtrudeTargetSelection(feature);
        this.syncBooleanSolidSelection(feature);
        this.syncChamferEdgeSelection(feature);
    },

    renderSketchFields(feature) {
        const target = feature.target || {};
        const targetArea = this.createSolidPickerArea({
            title: 'Sketch Plane',
            active: true,
            emptyText: 'No sketch plane selected'
        });
        const currentText = this.getSketchTargetDisplay(feature);
        if (currentText) {
            const row = document.createElement('div');
            row.className = 'props-extrude-profile-row';
            const text = document.createElement('div');
            text.className = 'props-extrude-profile-text';
            text.textContent = currentText;
            const clear = document.createElement('button');
            clear.className = 'props-extrude-profile-remove';
            clear.textContent = '×';
            clear.title = 'Clear sketch plane target';
            clear.onclick = () => {
                const updated = api.features.update(feature.id, item => {
                    item.target = item.target || {};
                    item.target.kind = null;
                    item.target.id = null;
                    item.target.name = null;
                    item.target.label = null;
                    item.target.source = null;
                }, {
                    opType: 'feature.update',
                    payload: { field: 'target.clear' }
                });
                if (updated) this.onChanged();
            };
            row.appendChild(text);
            row.appendChild(clear);
            targetArea.list.appendChild(row);
        } else {
            targetArea.showEmpty();
        }
        this.body.appendChild(targetArea.wrap);

        const offsetValue = Number(target.offset ?? 0);
        this.body.appendChild(this.createNumberField('Offset', offsetValue, value => {
            const updated = api.features.update(feature.id, item => {
                item.target = item.target || {};
                item.target.offset = value;
                const sourceType = item?.target?.source?.type || null;
                if (sourceType === 'solid-face') {
                    const source = item.target.source;
                    const sourceSolidId = String(source?.solid_id || '');
                    const sourceFaceId = Number(source?.face_id);
                    let frame = null;
                    let nextSolidId = sourceSolidId;
                    let nextFaceId = sourceFaceId;

                    // Offset edits should stay attached to the same face when possible.
                    if (sourceSolidId && Number.isFinite(sourceFaceId)) {
                        const direct = api.solids?.getSketchTargetForFaceKey?.(`${sourceSolidId}:${sourceFaceId}`) || null;
                        if (direct?.frame) {
                            frame = direct.frame;
                        }
                    }
                    // Fallback only when the original face can no longer be resolved.
                    if (!frame) {
                        const resolved = api.solids?.resolveSketchFrameForSource?.(source, item.plane || null);
                        if (resolved?.frame) {
                            frame = resolved.frame;
                            nextSolidId = String(resolved.solidId || sourceSolidId);
                            nextFaceId = Number(resolved.faceId);
                        }
                    }
                    if (frame) {
                        item.target.source.solid_id = nextSolidId;
                        item.target.source.face_id = nextFaceId;
                        item.target.id = `${nextSolidId}:f${nextFaceId}`;
                        item.plane = api.solids?.applyOffsetToFrame?.(frame, value) || frame;
                    }
                } else if (sourceType === 'plane' && item.target?.source?.id) {
                    const option = DATUM_OPTIONS.find(o => o.id === item.target.source.id);
                    const plane = option ? api.datum.getPlane(option.key) : null;
                    if (plane?.getFrame) {
                        item.plane = api.solids?.applyOffsetToFrame?.(plane.getFrame(), value) || plane.getFrame();
                    }
                }
            }, {
                opType: 'feature.update',
                payload: { field: 'offset', value }
            });
            if (updated) this.onChanged();
        }));
    },

    applySketchTargetToFeature(item, target) {
        if (!item || !target?.frame) return;
        const offset = Number(item?.target?.offset || 0);
        item.target = item.target || {};
        item.target.kind = target.kind || 'plane';
        item.target.id = target.id || null;
        item.target.name = target.name || null;
        item.target.label = target.label || null;
        item.target.source = target.source || null;
        item.target.offset = offset;
        item.plane = api.solids?.applyOffsetToFrame?.(target.frame, offset) || target.frame;
    },

    getSketchTargetDisplay(feature) {
        const target = feature?.target || {};
        const source = target?.source || {};
        if (source.type === 'solid-face') {
            const solidId = String(source.solid_id || '');
            const faceId = Number(source.face_id);
            const solidName = this.getSolidDisplayName(solidId);
            const faceText = Number.isFinite(faceId) ? `Face ${faceId + 1}` : 'Face';
            return `${solidName} / ${faceText}`;
        }
        const planeId = source.id || target.id || null;
        const datum = DATUM_OPTIONS.find(opt => opt.id === planeId);
        if (datum) return datum.name;
        return target.name || target.label || null;
    },

    renderExtrudeFields(feature) {
        this.setExtrudeProfileHover(null);
        const params = feature?.params || {};
        const operation = ['new', 'add', 'subtract'].includes(String(params.operation || 'new'))
            ? String(params.operation || 'new')
            : 'new';
        if (operation === 'new') {
            this._extrudePickRole = 'profiles';
        } else if (this._extrudePickRole !== 'profiles' && this._extrudePickRole !== 'targets') {
            this._extrudePickRole = 'targets';
        }

        this.body.appendChild(this.createSelectField('Mode', operation, [
            { value: 'new', label: 'New' },
            { value: 'add', label: 'Add' },
            { value: 'subtract', label: 'Subtract' }
        ], value => {
            const next = ['new', 'add', 'subtract'].includes(value) ? value : 'new';
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.operation = next;
                item.input = item.input || {};
                if (!Array.isArray(item.input.targets)) {
                    item.input.targets = [];
                }
            }, {
                opType: 'feature.update',
                payload: { field: 'operation', value: next }
            });
            if (updated) {
                this._extrudePickRole = next === 'new' ? 'profiles' : 'targets';
                this.onChanged();
            }
        }));

        const depthValue = Number(params.depth ?? params.distance ?? 10);
        this.body.appendChild(this.createNumberField('Depth', depthValue, value => {
            const next = Math.max(0.0001, Math.abs(value));
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.depth = next;
                item.params.distance = next;
            }, {
                opType: 'feature.update',
                payload: { field: 'depth', value: next }
            });
            if (updated) this.onChanged();
        }));

        const direction = String(params.direction || 'normal');
        this.body.appendChild(this.createSelectField('Direction', direction, [
            { value: 'normal', label: 'Normal' },
            { value: 'reverse', label: 'Reverse' }
        ], value => {
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.direction = value === 'reverse' ? 'reverse' : 'normal';
            }, {
                opType: 'feature.update',
                payload: { field: 'direction', value }
            });
            if (updated) this.onChanged();
        }));

        const symmetric = params.symmetric === true;
        this.body.appendChild(this.createCheckboxField('Symmetric', symmetric, checked => {
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.symmetric = !!checked;
            }, {
                opType: 'feature.update',
                payload: { field: 'symmetric', value: !!checked }
            });
            if (updated) this.onChanged();
        }));

        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        const profilesArea = this.createSolidPickerArea({
            title: 'Profiles',
            active: this._extrudePickRole === 'profiles',
            onActivate: () => {
                this._extrudePickRole = 'profiles';
                this.onChanged();
            },
            emptyText: 'No profiles selected'
        });
        if (profiles.length) {
            for (const profile of profiles) {
                const ref = resolveExtrudeProfileRef(profile);
                const sketch = ref?.sketchId ? api.features.findById(ref.sketchId) : null;
                const row = document.createElement('div');
                row.className = 'props-extrude-profile-row';
                row.onmouseenter = () => this.setExtrudeProfileHover(profile);
                row.onmouseleave = () => this.setExtrudeProfileHover(null);
                const text = document.createElement('div');
                text.className = 'props-extrude-profile-text';
                text.textContent = `${sketch?.name || ref?.sketchId || 'Sketch'} / ${ref?.profileId || 'region'}`;
                const remove = document.createElement('button');
                remove.className = 'props-extrude-profile-remove';
                remove.textContent = '×';
                remove.title = 'Remove profile';
                remove.onclick = () => {
                    const updated = api.features.update(feature.id, item => {
                        item.input = item.input || {};
                        const current = Array.isArray(item.input.profiles) ? item.input.profiles : [];
                        const removeKey = String(ref?.key || '');
                        item.input.profiles = current.filter(p => {
                            const pRef = resolveExtrudeProfileRef(p);
                            const pKey = String(pRef?.key || '');
                            if (removeKey && pKey) {
                                return pKey !== removeKey;
                            }
                            return !(pRef?.sketchId === ref?.sketchId && pRef?.profileId === ref?.profileId);
                        });
                    }, {
                        opType: 'feature.update',
                        payload: { field: 'profiles.remove', profile }
                    });
                    if (updated) this.onChanged();
                };
                row.appendChild(text);
                row.appendChild(remove);
                profilesArea.list.appendChild(row);
            }
        } else {
            profilesArea.showEmpty();
        }
        this.body.appendChild(profilesArea.wrap);

        if (operation !== 'new') {
            const solids = api.solids?.list?.() || [];
            const targetIds = Array.isArray(feature?.input?.targets) ? feature.input.targets.filter(Boolean) : [];
            const targetsArea = this.createSolidPickerArea({
                title: 'Targets',
                active: this._extrudePickRole === 'targets',
                onActivate: () => {
                    this._extrudePickRole = 'targets';
                    this.onChanged();
                },
                emptyText: 'No targets selected'
            });
            if (targetIds.length) {
                for (const solidId of targetIds) {
                    const solid = solids.find(item => item?.id === solidId);
                    const row = document.createElement('div');
                    row.className = 'props-extrude-profile-row';
                    const text = document.createElement('div');
                    text.className = 'props-extrude-profile-text';
                    text.textContent = this.getSolidDisplayName(solidId, solid);
                    const remove = document.createElement('button');
                    remove.className = 'props-extrude-profile-remove';
                    remove.textContent = '×';
                    remove.title = 'Remove target';
                    remove.onclick = () => {
                        const updated = api.features.update(feature.id, item => {
                            item.input = item.input || {};
                            const current = Array.isArray(item.input.targets) ? item.input.targets : [];
                            item.input.targets = current.filter(id => id !== solidId);
                        }, {
                            opType: 'feature.update',
                            payload: { field: 'targets.remove', solidId }
                        });
                        if (updated) this.onChanged();
                    };
                    row.appendChild(text);
                    row.appendChild(remove);
                    targetsArea.list.appendChild(row);
                }
            } else {
                targetsArea.showEmpty();
            }
            this.body.appendChild(targetsArea.wrap);
        }
    },

    renderBooleanFields(feature) {
        const input = this.getBooleanInput(feature);
        const mode = String(feature?.params?.mode || 'add');
        this.body.appendChild(this.createSelectField('Mode', mode, [
            { value: 'add', label: 'Add' },
            { value: 'subtract', label: 'Subtract' },
            { value: 'intersect', label: 'Intersect' }
        ], value => {
            const next = ['add', 'subtract', 'intersect'].includes(value) ? value : 'add';
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.mode = next;
                item.input = item.input || {};
                if (!Array.isArray(item.input.targets)) {
                    item.input.targets = [];
                }
                if (!Array.isArray(item.input.tools)) {
                    item.input.tools = [];
                }
            }, {
                opType: 'feature.update',
                payload: { field: 'mode', value: next }
            });
            if (updated) this.onChanged();
        }));

        if (mode === 'subtract') {
            if (this._booleanPickRole !== 'tools' && this._booleanPickRole !== 'targets') {
                this._booleanPickRole = 'targets';
            }
        } else {
            this._booleanPickRole = 'targets';
        }

        const solids = api.solids?.list?.() || [];
        const targets = Array.isArray(input.targets) ? input.targets.filter(Boolean) : [];
        const tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];

        const buildSection = (sectionKey, title, ids, emptyText) => {
            const active = mode === 'subtract' ? this._booleanPickRole === sectionKey : true;
            const area = this.createSolidPickerArea({
                title,
                active,
                onActivate: () => {
                    if (mode === 'subtract') {
                        this._booleanPickRole = sectionKey;
                        this.onChanged();
                    }
                },
                emptyText
            });
            if (ids.length) {
                for (const solidId of ids) {
                    const solid = solids.find(item => item?.id === solidId);
                    const row = document.createElement('div');
                    row.className = 'props-extrude-profile-row';
                    const text = document.createElement('div');
                    text.className = 'props-extrude-profile-text';
                    text.textContent = this.getSolidDisplayName(solidId, solid);
                    const remove = document.createElement('button');
                    remove.className = 'props-extrude-profile-remove';
                    remove.textContent = '×';
                    remove.title = `Remove ${sectionKey === 'tools' ? 'tool' : 'target'}`;
                    remove.onclick = () => {
                        const updated = api.features.update(feature.id, item => {
                            item.input = item.input || {};
                            const currentTargets = Array.isArray(item.input.targets) ? item.input.targets : [];
                            const currentTools = Array.isArray(item.input.tools) ? item.input.tools : [];
                            item.input.targets = currentTargets.filter(id => id && !(sectionKey === 'targets' && id === solidId));
                            item.input.tools = currentTools.filter(id => id && !(sectionKey === 'tools' && id === solidId));
                        }, {
                            opType: 'feature.update',
                            payload: { field: `${sectionKey}.remove`, solidId }
                        });
                        if (updated) this.onChanged();
                    };
                    row.appendChild(text);
                    row.appendChild(remove);
                    area.list.appendChild(row);
                }
            } else {
                area.showEmpty();
            }
            this.body.appendChild(area.wrap);
        };

        buildSection('targets', 'Targets', targets, 'No targets selected');
        if (mode === 'subtract') {
            buildSection('tools', 'Tools', tools, 'No tools selected');
        }
    },

    renderChamferFields(feature) {
        const params = feature?.params || {};
        const distance = Math.max(0.0001, Math.abs(Number(params.distance ?? 1)));
        this.body.appendChild(this.createNumberField('Distance', distance, value => {
            const next = Math.max(0.0001, Math.abs(Number(value) || 0));
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.distance = next;
            }, {
                opType: 'feature.update',
                payload: { field: 'distance', value: next }
            });
            if (updated) this.onChanged();
        }));
        this.body.appendChild(this.createCheckboxField('Show cutters', params.showCutters === true, checked => {
            const updated = api.features.update(feature.id, item => {
                item.params = item.params || {};
                item.params.showCutters = checked === true;
            }, {
                opType: 'feature.update',
                payload: { field: 'showCutters', value: checked === true }
            });
            if (updated) this.onChanged();
        }));

        const edges = Array.isArray(feature?.input?.edges) ? feature.input.edges : [];
        const edgeArea = this.createSolidPickerArea({
            title: 'Edges',
            active: true,
            emptyText: 'No edges selected'
        });
        if (edges.length) {
            for (const edge of edges) {
                const row = document.createElement('div');
                row.className = 'props-extrude-profile-row';
                const text = document.createElement('div');
                text.className = 'props-extrude-profile-text';
                const solidName = this.getSolidDisplayName(edge?.solidId || '');
                const edgeIndex = Number(edge?.edgeIndex);
                text.textContent = `${solidName} / Edge ${Number.isFinite(edgeIndex) ? edgeIndex + 1 : '?'}`;
                const remove = document.createElement('button');
                remove.className = 'props-extrude-profile-remove';
                remove.textContent = '×';
                remove.title = 'Remove edge';
                remove.onclick = () => {
                    const removeId = resolveChamferEdgeIdentity(edge);
                    const updated = api.features.update(feature.id, item => {
                        item.input = item.input || {};
                        const current = Array.isArray(item.input.edges) ? item.input.edges : [];
                        item.input.edges = current.filter(e => {
                            const id = resolveChamferEdgeIdentity(e);
                            if (removeId && id) return id !== removeId;
                            if (removeId && !id) return true;
                            if (!removeId && id) return true;
                            return e !== edge;
                        });
                    }, {
                        opType: 'feature.update',
                        payload: { field: 'edges.remove', key: removeId || resolveChamferEdgeRefKey(edge) || null }
                    });
                    if (updated) this.onChanged();
                };
                row.appendChild(text);
                row.appendChild(remove);
                edgeArea.list.appendChild(row);
            }
        } else {
            edgeArea.showEmpty();
        }
        this.body.appendChild(edgeArea.wrap);
    },

    createSolidPickerArea({ title, active = false, onActivate = null, emptyText = 'Nothing selected' }) {
        const wrap = document.createElement('div');
        wrap.className = `props-field props-picker-area${active ? ' active' : ''}`;
        const label = document.createElement('label');
        label.textContent = title;
        wrap.appendChild(label);
        const list = document.createElement('div');
        list.className = 'props-extrude-profiles';
        wrap.appendChild(list);
        if (typeof onActivate === 'function') {
            wrap.onclick = event => {
                if (event?.target?.closest?.('.props-extrude-profile-remove')) {
                    return;
                }
                onActivate();
            };
        }
        return {
            wrap,
            list,
            showEmpty() {
                const empty = document.createElement('div');
                empty.className = 'props-extrude-profile-empty';
                empty.textContent = emptyText;
                list.appendChild(empty);
            }
        };
    },

    getExtrudePickRole() {
        return this._extrudePickRole === 'targets' ? 'targets' : 'profiles';
    },

    syncExtrudeProfileSelection(feature) {
        const isExtrude = feature?.type === 'extrude' && this.currentFeatureId === feature?.id;
        if (!isExtrude) {
            api.interact.selectedSketchProfiles?.clear?.();
            api.interact.hoveredSketchProfileKey = null;
            api.sketchRuntime?.setSelectedProfiles?.([]);
            api.sketchRuntime?.setHoveredProfile?.(null);
            api.sketchRuntime?.setForcedVisible?.([]);
            return;
        }
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        const keys = profiles
            .map(p => {
                const ref = resolveExtrudeProfileRef(p);
                return (ref?.sketchId && ref?.profileId) ? `${ref.sketchId}:${ref.profileId}` : null;
            })
            .filter(Boolean);
        const sketchIds = Array.from(new Set(profiles.map(p => resolveExtrudeProfileRef(p)?.sketchId).filter(Boolean)));
        api.interact.selectedSketchProfiles = new Set(keys);
        api.sketchRuntime?.setSelectedProfiles?.(keys);
        api.sketchRuntime?.setForcedVisible?.(sketchIds);
    },

    setExtrudeProfileHover(profile) {
        const ref = resolveExtrudeProfileRef(profile);
        const key = (ref?.sketchId && ref?.profileId)
            ? `${ref.sketchId}:${ref.profileId}`
            : null;
        const currentFeature = this.currentFeatureId ? api.features.findById(this.currentFeatureId) : null;
        const currentFeatureId = currentFeature?.type === 'extrude' ? currentFeature.id : null;
        const hoveredSolidIds = [];
        if (ref?.sketchId && ref?.profileId) {
            const sketchId = String(ref.sketchId);
            const profileId = String(ref.profileId);
            const profileKey = `${sketchId}:${profileId}`;
            const solids = api.solids?.list?.() || [];
            const scoped = currentFeatureId
                ? solids.filter(solid => String(solid?.source?.feature_id || '') === String(currentFeatureId))
                : solids;
            const hasProfileKeyMap = scoped.some(solid => Array.isArray(solid?.source?.profile_keys) && solid.source.profile_keys.length);
            for (const solid of solids) {
                if (currentFeatureId && String(solid?.source?.feature_id || '') !== String(currentFeatureId)) {
                    continue;
                }
                const srcProfile = solid?.source?.profile || null;
                const srcProfileKeys = Array.isArray(solid?.source?.profile_keys) ? solid.source.profile_keys : [];
                const provProfile = solid?.provenance?.source?.profile || null;
                const provFaces = Array.isArray(solid?.provenance?.faces) ? solid.provenance.faces : [];
                const matchProfile = p => (
                    String(p?.sketchId || '') === sketchId &&
                    String(p?.profileId || '') === profileId
                );
                const matchFace = provFaces.some(face => matchProfile(face?.source || null));
                const matchKeys = srcProfileKeys.some(k => String(k || '') === profileKey);
                const match = hasProfileKeyMap
                    ? matchKeys
                    : (matchKeys || matchProfile(srcProfile) || matchProfile(provProfile) || matchFace);
                if (match) {
                    if (solid?.id) hoveredSolidIds.push(solid.id);
                }
            }
        }
        api.solids?.setHovered?.(hoveredSolidIds);
        api.interact.hoveredSketchProfileKey = key;
        api.sketchRuntime?.setHoveredProfile?.(key);
        window.dispatchEvent(new CustomEvent('void-state-change'));
    },

    syncExtrudeTargetSelection(feature) {
        const isExtrude = feature?.type === 'extrude' && this.currentFeatureId === feature?.id;
        if (!isExtrude) {
            return;
        }
        const operation = String(feature?.params?.operation || 'new');
        const targets = Array.isArray(feature?.input?.targets) ? feature.input.targets.filter(Boolean) : [];
        if (operation === 'add' || operation === 'subtract') {
            api.solids?.setSelected?.(targets);
        } else {
            api.solids?.setSelected?.([]);
        }
    },

    syncBooleanSolidSelection(feature) {
        const isBoolean = feature?.type === 'boolean' && this.currentFeatureId === feature?.id;
        if (!isBoolean) {
            return;
        }
        const input = this.getBooleanInput(feature);
        const mode = String(feature?.params?.mode || 'add');
        const targets = Array.isArray(input.targets) ? input.targets.filter(Boolean) : [];
        const tools = Array.isArray(input.tools) ? input.tools.filter(Boolean) : [];
        const selected = mode === 'subtract' ? Array.from(new Set([...targets, ...tools])) : targets;
        api.solids?.setSelected?.(selected);
    },

    syncChamferEdgeSelection(feature) {
        const isChamfer = feature?.type === 'chamfer' && this.currentFeatureId === feature?.id;
        if (!isChamfer) {
            api.interact.selectedSolidEdgeKeys?.clear?.();
            api.interact.hoveredSolidEdgeKey = null;
            api.solids?.setSelectedEdges?.([]);
            api.solids?.setHoveredEdge?.(null);
            return;
        }
        const keys = (Array.isArray(feature?.input?.edges) ? feature.input.edges : [])
            .map(edge => {
                const resolved = api.solids?.resolveChamferRefToEdgeKey?.(edge) || null;
                if (!resolved) return null;
                return String(resolved).startsWith('segment:')
                    ? String(resolved).substring('segment:'.length)
                    : String(resolved);
            })
            .filter(Boolean);
        api.interact.selectedSolidEdgeKeys = new Set(keys);
        api.solids?.setSelectedEdges?.(keys);
    },

    getBooleanInput(feature) {
        const input = feature?.input || {};
        const targets = Array.isArray(input.targets) ? input.targets : [];
        const tools = Array.isArray(input.tools) ? input.tools : [];
        return {
            targets: targets.filter(Boolean),
            tools: tools.filter(Boolean)
        };
    },

    getSolidDisplayName(solidId, solid = null) {
        const sid = String(solidId || '').trim();
        if (!sid) return 'Solid';
        if (solid?.name && !solid.name.includes(':body:')) {
            return solid.name;
        }
        const match = sid.match(/^(.+):body:(\d+)$/);
        if (match) {
            const featureId = match[1];
            const bodyIndex = Number(match[2]);
            const feature = api.features.findById(featureId);
            const base = feature?.name || feature?.type || 'Solid';
            if (Number.isFinite(bodyIndex)) {
                return `${base} / Body ${bodyIndex + 1}`;
            }
            return base;
        }
        return sid;
    },

    getBooleanPickRole() {
        return this._booleanPickRole === 'tools' ? 'tools' : 'targets';
    },

    createTextField(label, value, onCommit) {
        const wrap = document.createElement('div');
        wrap.className = 'props-field';
        const l = document.createElement('label');
        l.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.onkeydown = event => {
            if (event.key === 'Enter') {
                input.blur();
            }
        };
        input.onblur = () => onCommit(input.value);
        wrap.appendChild(l);
        wrap.appendChild(input);
        return wrap;
    },

    createNumberField(label, value, onCommit) {
        const wrap = document.createElement('div');
        wrap.className = 'props-field';
        const l = document.createElement('label');
        l.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.value = String(value);
        input.onchange = () => {
            const next = Number(input.value);
            if (Number.isFinite(next)) {
                onCommit(next);
            }
        };
        wrap.appendChild(l);
        wrap.appendChild(input);
        return wrap;
    },

    createSelectField(label, value, options, onChange) {
        const wrap = document.createElement('div');
        wrap.className = 'props-field';
        const l = document.createElement('label');
        l.textContent = label;
        const select = document.createElement('select');
        for (const option of options) {
            const el = document.createElement('option');
            el.value = option.value;
            el.textContent = option.label;
            select.appendChild(el);
        }
        select.value = value;
        select.onchange = () => onChange(select.value);
        wrap.appendChild(l);
        wrap.appendChild(select);
        return wrap;
    },

    createCheckboxField(label, checked, onChange) {
        const wrap = document.createElement('div');
        wrap.className = 'props-field';
        const l = document.createElement('label');
        l.textContent = label;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!checked;
        input.onchange = () => onChange(!!input.checked);
        wrap.appendChild(l);
        wrap.appendChild(input);
        return wrap;
    },

    onChanged() {
        const feature = api.features.findById(this.currentFeatureId);
        if (feature) {
            this.renderFeature(feature);
        }
        if (typeof this._onChange === 'function') {
            this._onChange();
        }
    }
};

export { properties };
