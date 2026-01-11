/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { base } from '../../geo/base.js';
import { space } from '../../moto/space.js';

const DOC = self.document;

/** Cached platform color before drag-over highlight */
let platformColor;

/**
 * Handle file drag-over event.
 * Changes platform color to green to indicate drop target.
 * Prevents drop when modal dialogs are open.
 * @param {DragEvent} evt - Browser drag event
 */
function dragOverHandler(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    // prevent drop actions when a dialog is open
    if (api.modal.visible()) {
        return;
    }

    evt.dataTransfer.dropEffect = 'copy';
    let oldcolor = space.platform.setColor(0x00ff00);
    if (oldcolor !== 0x00ff00) platformColor = oldcolor;
}

/**
 * Handle drag-leave event by restoring original platform color.
 */
function dragLeave() {
    space.platform.setColor(platformColor);
}

/**
 * Handle file drop event.
 * Restores platform color and loads dropped files.
 * Handles multi-file drops with optional grouping:
 * - Single file: loads immediately
 * - Multiple files: prompts user whether to group
 * - api.feature.drop_group can override behavior (true=always group, false=never group)
 * @param {DragEvent} evt - Browser drop event
 */
function dropHandler(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    // prevent drop actions when a dialog is open
    if (api.modal.visible()) {
        return;
    }

    space.platform.setColor(platformColor);

    let files = evt.dataTransfer.files;

    switch (api.feature.drop_group) {
        case true:
            return api.platform.load_files(files, []);
        case false:
            return api.platform.load_files(files, undefined);
    }

    if (files.length === 1) {
        api.platform.load_files(files);
    } else if (files.length > 1) {
        api.uc.confirm(`group ${files.length} files?`).then(yes => {
            api.platform.load_files(files, yes ? [] : undefined);
        });
    }
}

/**
 * Load a file from the catalog when clicked.
 * @param {Event} e - Click event from catalog item
 */
function loadCatalogFile(e) {
    api.widgets.load(e.target.getAttribute('load'), function(widget) {
        api.platform.add(widget);
        api.dialog.hide();
    });
}

/**
 * Update the catalog UI with current file list.
 * Builds interactive list with rename, load, and delete buttons for each file.
 * Sorts files alphabetically (case-insensitive).
 * @param {object} files - Dictionary of filename -> {vertices, updated} file metadata
 */
function updateCatalog(files) {
    let table = api.ui.catalog.list,
        list = [];
    table.innerHTML = '';
    for (let name in files) {
        list.push({n:name, ln:name.toLowerCase(), v:files[name].vertices, t:files[name].updated});
    }
    list.sort(function(a,b) {
        return a.ln < b.ln ? -1 : 1;
    });
    for (let i=0; i<list.length; i++) {
        let row = DOC.createElement('div'),
            renm = DOC.createElement('button'),
            load = DOC.createElement('button'),
            size = DOC.createElement('button'),
            del = DOC.createElement('button'),
            file = list[i],
            name = file.n,
            date = new Date(file.t),
            split = name.split('.'),
            short = split[0],
            ext = split[1] ? `.${split[1]}` : '';

        renm.setAttribute('class', 'rename');
        renm.setAttribute('title', 'rename file');
        renm.innerHTML = '<i class="far fa-edit"></i>';
        renm.onclick = () => {
            api.uc.prompt(`rename file`, short).then(newname => {
                if (newname && newname !== short) {
                    api.catalog.rename(name, `${newname}${ext}`, then => {
                        api.modal.show('files');
                    });
                }
            });
        };

        load.setAttribute('load', name);
        load.setAttribute('title', `file: ${name}\nvertices: ${file.v}\ndate: ${date}`);
        load.onclick = loadCatalogFile;
        load.appendChild(DOC.createTextNode(short));

        del.setAttribute('del', name);
        del.setAttribute('title', "remove '"+name+"'");
        del.onclick = () => { api.catalog.deleteFile(name) };
        del.innerHTML = '<i class="far fa-trash-alt"></i>';

        size.setAttribute("disabled", true);
        size.setAttribute("class", "label");
        size.appendChild(DOC.createTextNode(base.util.comma(file.v)));

        row.setAttribute("class", "f-row a-center");
        row.appendChild(renm);
        row.appendChild(load);
        row.appendChild(size);
        row.appendChild(del);
        table.appendChild(row);
    }
}

export const fileOps = {
    dragOverHandler,
    dragLeave,
    dropHandler,
    loadCatalogFile,
    updateCatalog
};
