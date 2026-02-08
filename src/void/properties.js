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

const properties = {
    panel: null,
    header: null,
    body: null,
    currentFeatureId: null,
    _onChange: null,
    _drag: null,
    _savedPos: null,
    _loadingPos: false,

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

        const close = document.createElement('button');
        close.className = 'props-close';
        close.textContent = '×';
        close.title = 'Close';
        close.onclick = () => this.hide();

        header.appendChild(title);
        header.appendChild(close);
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

    showFeature(feature, opts = {}) {
        this.init();
        if (!feature || !this.panel || !this.body) return;
        this.currentFeatureId = feature.id;
        this._onChange = opts.onChange || null;
        api.sketchRuntime?.setEditing(feature.type === 'sketch' ? feature.id : null);
        if (feature.type !== 'sketch') {
            api.interact?.clearSketchSelection?.();
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
        window.dispatchEvent(new CustomEvent('void-state-change'));
    },

    hide() {
        if (!this.panel) return;
        this.panel.classList.add('hidden');
        api.sketchRuntime?.setEditing(null);
        api.interact?.clearSketchSelection?.();
        this.syncExtrudeProfileSelection(null);
        this.currentFeatureId = null;
        this._onChange = null;
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
        }
        this.syncExtrudeProfileSelection(feature);
    },

    renderSketchFields(feature) {
        const target = feature.target || {};

        const planeSelect = this.createSelectField(
            'Plane',
            this.getPlaneOptionId(feature),
            DATUM_OPTIONS.map(opt => ({ value: opt.id, label: opt.name })),
            value => {
                const updated = api.features.update(feature.id, item => {
                    const option = DATUM_OPTIONS.find(o => o.id === value);
                    if (!option) return;
                    const plane = api.datum.getPlane(option.key);
                    if (!plane) return;
                    item.target = item.target || {};
                    item.target.kind = 'plane';
                    item.target.id = option.id;
                    item.target.name = plane.name || option.name;
                    item.target.label = plane.label || option.name;
                    item.target.source = { type: 'plane', id: option.id };
                    item.plane = plane.getFrame();
                }, {
                    opType: 'feature.update',
                    payload: { field: 'plane', value }
                });
                if (updated) this.onChanged();
            }
        );
        this.body.appendChild(planeSelect);

        const offsetValue = Number(target.offset ?? 0);
        this.body.appendChild(this.createNumberField('Offset', offsetValue, value => {
            const updated = api.features.update(feature.id, item => {
                item.target = item.target || {};
                item.target.offset = value;
            }, {
                opType: 'feature.update',
                payload: { field: 'offset', value }
            });
            if (updated) this.onChanged();
        }));
    },

    renderExtrudeFields(feature) {
        const params = feature?.params || {};
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

        const wrap = document.createElement('div');
        wrap.className = 'props-field';
        const label = document.createElement('label');
        label.textContent = 'Profiles';
        wrap.appendChild(label);
        const list = document.createElement('div');
        list.className = 'props-extrude-profiles';
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        if (!profiles.length) {
            const empty = document.createElement('div');
            empty.className = 'props-extrude-profile-empty';
            empty.textContent = 'No profiles selected';
            list.appendChild(empty);
        } else {
            for (const profile of profiles) {
                const sketch = api.features.findById(profile?.sketchId);
                const row = document.createElement('div');
                row.className = 'props-extrude-profile-row';
                const text = document.createElement('div');
                text.className = 'props-extrude-profile-text';
                text.textContent = `${sketch?.name || profile?.sketchId || 'Sketch'} / ${profile?.profileId || 'region'}`;
                const remove = document.createElement('button');
                remove.className = 'props-extrude-profile-remove';
                remove.textContent = '×';
                remove.title = 'Remove profile';
                remove.onclick = () => {
                    const updated = api.features.update(feature.id, item => {
                        item.input = item.input || {};
                        const current = Array.isArray(item.input.profiles) ? item.input.profiles : [];
                        item.input.profiles = current.filter(p => {
                            return !(p?.sketchId === profile?.sketchId && p?.profileId === profile?.profileId);
                        });
                    }, {
                        opType: 'feature.update',
                        payload: { field: 'profiles.remove', profile }
                    });
                    if (updated) this.onChanged();
                };
                row.appendChild(text);
                row.appendChild(remove);
                list.appendChild(row);
            }
        }
        wrap.appendChild(list);
        this.body.appendChild(wrap);
    },

    syncExtrudeProfileSelection(feature) {
        const isExtrude = feature?.type === 'extrude' && this.currentFeatureId === feature?.id;
        if (!isExtrude) {
            api.interact.selectedSketchProfiles?.clear?.();
            api.interact.hoveredSketchProfileKey = null;
            api.sketchRuntime?.setSelectedProfiles?.([]);
            api.sketchRuntime?.setHoveredProfile?.(null);
            return;
        }
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        const keys = profiles
            .map(p => (p?.sketchId && p?.profileId) ? `${p.sketchId}:${p.profileId}` : null)
            .filter(Boolean);
        api.interact.selectedSketchProfiles = new Set(keys);
        api.sketchRuntime?.setSelectedProfiles?.(keys);
    },

    getPlaneOptionId(feature) {
        const sourceId = feature?.target?.source?.id;
        if (sourceId && DATUM_OPTIONS.some(o => o.id === sourceId)) {
            return sourceId;
        }
        const targetId = feature?.target?.id;
        if (targetId && DATUM_OPTIONS.some(o => o.id === targetId)) {
            return targetId;
        }
        return 'datum-xy';
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
