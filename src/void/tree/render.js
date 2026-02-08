/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function createHeader(text) {
    const el = document.createElement('div');
    el.className = 'tree-header';
    el.textContent = text;
    return el;
}

function createDivider() {
    const el = document.createElement('div');
    el.className = 'tree-divider';
    return el;
}

function createRow({ label, depth = 0, expanded, onToggle, eyeVisible, onEye, onSelect, onHoverEnter, onHoverLeave, selected = false }) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    if (selected) {
        row.classList.add('active');
    }
    if (onEye && eyeVisible === false) {
        row.classList.add('is-off');
    }
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const left = document.createElement('div');
    left.className = 'tree-row-left';

    if (onToggle) {
        const twisty = document.createElement('button');
        twisty.className = 'tree-twisty';
        twisty.textContent = expanded ? '▾' : '▸';
        twisty.onclick = event => {
            event.stopPropagation();
            onToggle();
        };
        left.appendChild(twisty);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'tree-twisty-spacer';
        spacer.textContent = '';
        left.appendChild(spacer);
    }

    const text = document.createElement('div');
    text.className = 'tree-row-label';
    text.textContent = label;
    left.appendChild(text);

    row.appendChild(left);

    if (onEye) {
        const eye = document.createElement('button');
        eye.className = `tree-eye ${eyeVisible ? 'visible' : 'off'}`;
        eye.textContent = '👁';
        eye.title = eyeVisible ? 'Hide' : 'Show';
        eye.onclick = event => {
            event.stopPropagation();
            onEye();
        };
        row.appendChild(eye);
    }

    if (typeof onSelect === 'function') {
        row.onclick = () => onSelect();
    }
    if (typeof onHoverEnter === 'function') {
        row.onmouseenter = () => onHoverEnter();
    }
    if (typeof onHoverLeave === 'function') {
        row.onmouseleave = () => onHoverLeave();
    }

    return row;
}

function createTimelineMarkerRow({ active = false, onSelect, onDragStart, onDragEnd }) {
    const row = document.createElement('div');
    row.className = `tree-timeline-marker ${active ? 'active' : ''}`;
    row.onclick = () => onSelect?.();
    row.draggable = true;
    row.onmousedown = event => {
        if (event.button !== 0) return;
        createTimelineMarkerRow._dragActive = true;
        onSelect?.();
        event.preventDefault();
    };
    row.ondragstart = event => {
        createTimelineMarkerRow._dragActive = true;
        event.dataTransfer?.setData('text/x-void-timeline', '1');
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(event);
    };
    row.ondragend = event => {
        createTimelineMarkerRow._dragActive = false;
        onDragEnd?.(event);
    };
    row.onmouseenter = event => {
        if (!createTimelineMarkerRow._dragActive) return;
        if (!(event.buttons & 1)) return;
        onSelect?.();
    };
    row.title = 'Move history marker';

    const line = document.createElement('div');
    line.className = 'tree-timeline-line';
    row.appendChild(line);

    if (!createTimelineMarkerRow._boundMouseUp) {
        createTimelineMarkerRow._boundMouseUp = true;
        window.addEventListener('mouseup', () => {
            createTimelineMarkerRow._dragActive = false;
        });
    }
    return row;
}

function createItemRow(label, feature, depth = 0, opts = {}) {
    const row = document.createElement('div');
    row.className = 'tree-item-row';
    if (opts.selected) {
        row.classList.add('active');
    }
    if (opts.eyeVisible === false) {
        row.classList.add('is-off');
    }
    if (opts.suppressed) {
        row.classList.add('is-suppressed');
    }
    if (opts.beyondTimeline) {
        row.classList.add('is-future');
    }
    row.style.paddingLeft = `${8 + depth * 16}px`;
    if (opts.draggable) {
        row.draggable = true;
    }

    const left = document.createElement('div');
    left.className = 'tree-row-left';

    const icon = document.createElement('span');
    icon.className = 'tree-item-icon';
    icon.textContent = this.getIcon(feature?.type);

    const text = document.createElement('div');
    text.className = 'tree-row-label';
    text.textContent = label;

    left.appendChild(icon);
    left.appendChild(text);
    row.appendChild(left);

    const actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (actions.length) {
        const actionWrap = document.createElement('div');
        actionWrap.className = 'tree-item-actions';
        for (const action of actions) {
            if (!action || typeof action.onClick !== 'function') continue;
            const btn = document.createElement('button');
            btn.className = 'tree-item-action';
            if (action.className) {
                btn.classList.add(action.className);
            }
            btn.textContent = action.label || '•';
            btn.title = action.title || '';
            btn.disabled = !!action.disabled;
            btn.onclick = event => {
                event.stopPropagation();
                action.onClick(feature);
            };
            actionWrap.appendChild(btn);
        }
        row.appendChild(actionWrap);
    }

    row.onclick = () => {
        if (typeof opts.onSelect === 'function') {
            opts.onSelect(feature);
        } else {
            console.log('Feature selected:', feature);
        }
    };
    row.ondblclick = () => {
        if (typeof opts.onEdit === 'function') {
            opts.onEdit(feature);
        }
    };
    if (typeof opts.onHoverEnter === 'function') {
        row.onmouseenter = () => opts.onHoverEnter(feature);
    }
    if (typeof opts.onHoverLeave === 'function') {
        row.onmouseleave = () => opts.onHoverLeave(feature);
    }

    if (typeof opts.onEye === 'function') {
        const eye = document.createElement('button');
        eye.className = `tree-eye ${opts.eyeVisible !== false ? 'visible' : 'off'}`;
        eye.textContent = '👁';
        eye.title = opts.eyeVisible !== false ? 'Hide' : 'Show';
        eye.onclick = event => {
            event.stopPropagation();
            opts.onEye(feature);
        };
        row.appendChild(eye);
    }

    if (opts.draggable && typeof opts.onDragStart === 'function') {
        row.ondragstart = event => {
            row.classList.add('is-dragging');
            event.dataTransfer?.setData('text/x-void-feature', String(feature?.id || ''));
            event.dataTransfer.effectAllowed = 'move';
            opts.onDragStart(feature, event);
        };
    }
    if (opts.draggable) {
        row.ondragend = () => {
            row.classList.remove('is-dragging');
            row.classList.remove('drag-over-before');
            row.classList.remove('drag-over-after');
            if (typeof opts.onDragEnd === 'function') {
                opts.onDragEnd(feature);
            }
        };
    }
    if (opts.draggable && typeof opts.onDragOver === 'function') {
        row.ondragover = event => {
            event.preventDefault();
            const timelineDrag = !!opts.isTimelineDragging?.();
            const before = (event.offsetY || 0) < (row.clientHeight / 2);
            row.classList.toggle('drag-over-before', before);
            row.classList.toggle('drag-over-after', !before);
            if (timelineDrag && typeof opts.onTimelineDragOver === 'function') {
                opts.onTimelineDragOver(feature, event, { before });
            } else {
                opts.onDragOver(feature, event, { before });
            }
        };
    }
    if (opts.draggable) {
        row.ondragleave = () => {
            row.classList.remove('drag-over-before');
            row.classList.remove('drag-over-after');
        };
    }
    if (opts.draggable && typeof opts.onDrop === 'function') {
        row.ondrop = event => {
            event.preventDefault();
            const timelineDrag = !!opts.isTimelineDragging?.();
            const before = (event.offsetY || 0) < (row.clientHeight / 2);
            row.classList.remove('drag-over-before');
            row.classList.remove('drag-over-after');
            if (timelineDrag && typeof opts.onTimelineDrop === 'function') {
                opts.onTimelineDrop(feature, event, { before });
            } else {
                opts.onDrop(feature, event, { before });
            }
        };
    }

    return row;
}

function createEmptyRow(label, depth = 0) {
    const row = document.createElement('div');
    row.className = 'tree-empty-row';
    row.style.paddingLeft = `${8 + depth * 16}px`;
    row.textContent = label;
    return row;
}

function getIcon(type) {
    const icons = {
        datum: '□',
        sketch: '✏',
        extrude: '⬆',
        revolve: '↻',
        boolean: '∪'
    };
    return icons[type] || '•';
}

export {
    createHeader,
    createDivider,
    createRow,
    createTimelineMarkerRow,
    createItemRow,
    createEmptyRow,
    getIcon
};
