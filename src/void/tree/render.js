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

function createRow({ label, depth = 0, expanded, onToggle, eyeVisible, onEye }) {
    const row = document.createElement('div');
    row.className = 'tree-row';
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
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const icon = document.createElement('span');
    icon.className = 'tree-item-icon';
    icon.textContent = this.getIcon(feature?.type);

    const text = document.createElement('div');
    text.className = 'tree-row-label';
    text.textContent = label;

    row.appendChild(icon);
    row.appendChild(text);

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
    createItemRow,
    createEmptyRow,
    getIcon
};
