/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// dep: kiri.api
// use: kiri.selection
// use: moto.space
gapp.register("kiri.do", [], (root, events) => {

const { kiri, moto } = root;
const { api } = kiri;
const { space } = moto;
const { event } = api;

let stack = [];
let stpos = 0;
let moved = { x: 0, y: 0 };
let msgid;

event.on("init-done", () => {
    $('undo').onclick = undo;
    $('redo').onclick = redo;
});

let undo = api.doit.undo = function() {
    if (stpos) {
        action(stack[--stpos].undo);
    } else {
        message('nothing to undo');
    }
};

let redo = api.doit.redo = function() {
    if (stpos < stack.length) {
        action(stack[stpos++].redo);
    } else {
        message('nothing to redo');
    }
};

let clear = api.doit.clear = function() {
    stack = [];
    stpos = 0;
    moved = {x:0, y:0};
    updateButtons();
};

function updateButtons() {
    let isArrange = api.view.get() === kiri.consts.VIEWS.ARRANGE;
    $('doit').style.display = isArrange && stack.length ? 'flex' : 'none';
    $('undo').disabled = stpos === 0;
    $('redo').disabled = stpos == stack.length;
}

function message(txt) {
    if (msgid) {
        api.hide.alert(msgid);
    }
    msgid = api.show.alert(txt);
}

function action(rec) {
    switch (rec.type) {
        case 'move':
            for (let w of rec.widgets) {
                w._move(rec.dist.x, rec.dist.y, 0);
            }
            break;
        case 'rotate':
            for (let w of rec.widgets) {
                w.rotate(rec.x, rec.y, rec.z);
            }
            break;
        case 'scale':
            for (let w of rec.widgets) {
                w._scale(rec.x, rec.y, rec.z);
            }
            api.selection.update_info();
            break;
    }
    space.update();
    updateButtons();
}

function pushActions(ur) {
    stack.length = stpos++;
    stack.push(ur);
    updateButtons();
}

event.on([
    'platform.layout',
    'widget.add',
    'widget.delete'
], (widget) => {
    clear();
});

event.on('view.set', mode => {
    updateButtons();
});

// selection event (store position)
event.on('selection.rotate', (rec) => {
    let type = "rotate";
    let widgets = api.selection.widgets(true);
    if (!widgets.length) {
        return;
    }
    let {x, y, z} = rec;
    if (!(x || y || z)) {
        return;
    }
    pushActions({
        redo: {
            type,
            widgets,
            x, y, z
        },
        undo: {
            type,
            widgets,
            x: -x, y: -y, z: -z
        }
    })
});

event.on('selection.scale', (rec) => {
    let [x, y, z] = rec;
    // ignore scale close to 1
    if (Math.abs(1 - (x * y * z)) < 0.0001) {
        return;
    }
    let widgets = api.selection.widgets(true);
    if (!widgets.length) {
        return;
    }
    let type = "scale";
    pushActions({
        redo: {
            type,
            widgets,
            x, y, z
        },
        undo: {
            type,
            widgets,
            x: 1/x, y: 1/y, z: 1/z
        }
    });
});

// selection moved (accumulator)
event.on('selection.drag', (delta) => {
    moved.x += delta.x;
    moved.y += delta.y;
});

// move complete (store updated position)
event.on('mouse.drag.done', () => {
    let widgets = api.selection.widgets(true);
    if (!widgets.length) {
        return;
    }
    let type = "move";
    pushActions({
        redo: {
            type,
            widgets,
            dist: moved
        },
        undo: {
            type,
            widgets,
            dist: {x: -moved.x, y: -moved.y}
        }
    });
    moved = {x:0, y:0};
});

});
