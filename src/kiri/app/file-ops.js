/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { base } from '../../geo/base.js';
import { space } from '../../moto/space.js';

const DOC = self.document;
let platformColor;

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

function dragLeave() {
    space.platform.setColor(platformColor);
}

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

function loadCatalogFile(e) {
    api.widgets.load(e.target.getAttribute('load'), function(widget) {
        api.platform.add(widget);
        api.dialog.hide();
    });
}

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
