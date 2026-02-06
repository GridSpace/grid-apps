/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';

const DATUM_OPTIONS = [
    { id: 'datum-xy', name: 'Top', key: 'xy' },
    { id: 'datum-yz', name: 'Right', key: 'yz' },
    { id: 'datum-xz', name: 'Front', key: 'xz' }
];

const properties = {
    panel: null,
    header: null,
    body: null,
    currentFeatureId: null,
    _onChange: null,
    _drag: null,

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

        this.bindDrag();
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
            this.panel.style.left = `${Math.max(10, x)}px`;
            this.panel.style.top = `${Math.max(60, y)}px`;
        });

        window.addEventListener('mouseup', () => {
            this._drag = null;
        });
    },

    showFeature(feature, opts = {}) {
        this.init();
        if (!feature || !this.panel || !this.body) return;
        this.currentFeatureId = feature.id;
        this._onChange = opts.onChange || null;
        api.sketchRuntime?.setEditing(feature.type === 'sketch' ? feature.id : null);
        this.panel.classList.remove('hidden');
        this.renderFeature(feature);
    },

    hide() {
        if (!this.panel) return;
        this.panel.classList.add('hidden');
        api.sketchRuntime?.setEditing(null);
        this.currentFeatureId = null;
        this._onChange = null;
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
        }
    },

    renderSketchFields(feature) {
        const target = feature.target || {};

        const attachLabel = document.createElement('div');
        attachLabel.className = 'props-field';
        attachLabel.innerHTML = `<label>Attachment</label><div class="props-readonly">${target.kind || 'plane'}</div>`;
        this.body.appendChild(attachLabel);

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
