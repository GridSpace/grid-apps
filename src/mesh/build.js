/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register("mesh.build",[
    "moto.broker",  // dep: moto.broker
    "mesh.api",     // dep: mesh.api
]);

let mesh = self.mesh = self.mesh || {};
if (mesh.build) return;

let broker = gapp.broker;

broker.listeners({
    ui_build
});

let spin_timer;

// add modal dialog functions to api
let modal = mesh.api.modal = {
    show(title, contents) {
        h.bind($('modal'), contents);
        $('modal_title_text').innerText = title;
        $('modal_page').style.display = 'flex';
        $('modal_frame').style.display = 'flex';
        $('spinner').style.display = 'none';
        modal.info = { title, contents, showing: true };
        broker.publish('modal_show');
    },

    hide() {
        clearTimeout(spin_timer);
        $('modal_page').style.display = 'none';
        modal.info.showing = false;
        broker.publish('modal_hide');
    },

    info: {
        showing: false
    },

    get title() {
        return modal.info.title;
    },

    get showing() {
        return modal.info.showing;
    },

    spin(bool, delay) {
        if (bool) {
            if (delay) {
                spin_timer = setTimeout(() => {
                    modal.spin(true);
                }, delay);
                return;
            }
            $('modal_page').style.display = 'flex';
            $('modal_frame').style.display = 'none';
            $('spinner').style.display = 'block';
            broker.publish('modal_show', 'spinner');
        } else {
            modal.hide();
        }
    }
};

// transient logging window bottom/left
let log = mesh.api.log = {
    age: 10000, // age out lines more than 10 seconds old

    data: [],   // last n messages

    wait: 3000, // time before windows closes

    lines: 20,  // max log lines before forced-age out

    emit(msg) {
        let { age, data, lines, render } = log;
        let now = Date.now();
        data.push({
            text: `${dbug.since()} | ${msg}`,
            time: now
        });
        while (data.length && (data.length > lines || now - data[0].time > age)) {
            data.shift();
        }
        return render();
    },

    hide() {
        $('logger').style.display = 'none';
        return log;
    },

    pin() {
        return log.show(1 << 30);
    },

    unpin() {
        return log.show();
    },

    // show log window for `time` milliseconds or default
    show(time) {
        clearTimeout(log.timer);
        log.timer = setTimeout(log.hide, time || log.wait);
        return log;
    },

    // re-render and show current log messages
    render() {
        let area = $('logtext');
        h.bind(area, log.data.map(rec => h.div({ _: rec.text })));
        area.scrollTop = area.scrollHeight;
        $('logger').style.display = 'flex';
        return log.show();
    },
};

// create html elements
function ui_build() {
    // set app version
    $h('app-name', "Mesh:Tool");
    $h('app-vers', gapp.version);

    // create top level app areas
    let bound = h.bind($('app-body'), [
        // modal dialog and page blocker
        h.div({ id: 'modal_page' }, [
            h.div({ id: 'modal_frame' }, [
                h.div({ id: 'modal_title'}, [
                    h.div({ id: 'modal_title_text', _: 'title' }),
                    h.div({ class: 'pad' }),
                    h.div({ id: 'modal_title_close', onclick: modal.hide }, [
                        h.i({ class: "far fa-window-close" })
                    ])
                ]),
                h.div({ id: 'modal' }, [
                    h.div({ _: 'this is a modal test' })
                ])
            ]),
            h.div({ id: 'spinner', class: 'spin' })
        ]),
        // display and action areas
        h.div({ id: 'actions' }),
        h.div({ id: 'grouplist'}),
        h.div({ id: 'selectlist'}),
        h.div({ id: 'logger', onmouseover() { log.show() } })
    ]);

    let { actions, grouplist, selectlist, logger } = bound;
    let { api, util } = mesh;

    // create slid in/out logging window
    h.bind(logger, [ h.div({ id: 'logtext' }) ]);

    // create hotkey/action menu (top/left)
    h.bind(actions, [
        h.div([
            // create and bind file loading elements
            h.button({ _: 'import', onclick: api.file.import }, [
                h.input({
                    id: "import", type: "file", class: ["hide"], multiple: true,
                    onchange(evt) { broker.send.load_files(evt.target.files) }
                })
            ]),
            h.button({ _: 'export', onclick: api.file.export, disabled: true }),
            h.div({ class: "vsep" }),
            h.button({ _: 'analyze', disabled: true }),
            h.button({ _: 'repair', onclick: api.tool.repair }),
            h.div({ class: "vsep" }),
            h.button({ _: 'wireframe', onclick() { api.wireframe() } }),
        ]),
    ]);

    // for group/model/box/area/mesh dashboard grids
    function grid(v1, v2, side = [ "pos", "rot"], top = [ "X", "Y", "Z" ]) {
        return h.div({ class: "grid"}, [
            h.div({ _: "" }),
            h.div({ _: top[0], class: "top" }),
            h.div({ _: top[1], class: "top" }),
            h.div({ _: top[2], class: "top" }),
            h.div({ _: side[0], class: "side" }),
            h.label({ _: v1[0] }),
            h.label({ _: v1[1] }),
            h.label({ _: v1[2] }),
            h.div({ _: side[1], class: "side" }),
            h.label({ _: v2[0] }),
            h.label({ _: v2[1] }),
            h.label({ _: v2[2] }),
        ]);
    }

    function update_all() {
        update_selector();
        update_selection();
    }

    // update model selector list (top/right)
    function update_selector() {
        let selHas = api.selection.contains;
        // map groups to divs
        let groups = api.group.list()
            .map(g => h.div([
                h.button({ _: `group`, title: g.id,
                    class: [ "group", selHas(g) ? 'selected' : undefined ],
                    onclick() { api.selection.toggle(g) }
                }),
                h.div({ class: "vsep" }),
                h.div({ class: "models"},
                    // map models to buttons
                    g.models.map(m => h.button({ _: m.file || m.id,
                        class: selHas(m) ? [ 'selected' ] : [],
                        onclick(e) {
                            let sel = api.selection.list();
                            e.shiftKey || (sel.length === 1 && m === sel[0]) ?
                                api.selection.toggle(m) :
                                api.selection.set([m])
                        }
                    }))
                )
            ]));
        h.bind(grouplist, groups);
    }

    // update model information dashboard (bottom)
    function update_selection() {
        let map = { fixed: 2 };
        let s_grp = api.selection.groups();
        let s_mdl = api.selection.models();
        if (s_mdl.length === 0) {
            return h.bind(selectlist, []);
        }
        // map selection to divs
        let g_pos = util.average(s_grp.map(g => g.object.position));
        let g_rot = util.average(s_grp.map(g => g.object.rotation));
        let g_id = s_grp.map(g => g.id).join(' ');
        let h_grp = [h.div([
                h.button({ _: `group`, title: g_id }),
                grid(
                    util.extract(g_pos, map),
                    util.extract(g_rot, map) )
            ])];
        let m_pos = util.average(s_mdl.map(m => m.object.position));
        let m_rot = util.average(s_mdl.map(m => m.object.rotation));
        let m_id = s_mdl.map(m => m.id).join(' ');
        let h_mdl = [h.div([
                h.button({ _: `model`, title: m_id }),
                grid(
                    util.extract(m_pos, map),
                    util.extract(m_rot, map) )
            ])];
        let bounds = util.bounds(s_mdl);
        let h_bnd = [h.div([
                h.button({ _: `box`, title: m_id }),
                grid(
                    util.extract(bounds.min, map),
                    util.extract(bounds.max, map),
                    [ "min", "max" ]
                )
            ])];
        let h_ara = [h.div([
                h.button({ _: `span`, title: m_id }),
                grid(
                    util.extract(bounds.center, map),
                    util.extract(bounds.size, map),
                    [ "center", "size" ]
                )
            ])];
        let t_vert = s_mdl.map(m => m.vertices).reduce((a,v) => a+v);
        let t_face = s_mdl.map(m => m.faces).reduce((a,v) => a+v);
        let h_msh = [h.div([
            h.button({ _: `mesh` }),
            h.div({ class: ["grid","grid2"]}, [
                h.div({ _: "" }),
                h.div({ _: "count", class: "top" }),
                h.div({ _: "vertex", class: "side" }),
                h.label({ _: t_vert }),
                h.div({ _: "face", class: "side" }),
                h.label({ _: t_face }),
            ])
        ])];
        h.bind(selectlist, [...h_grp, ...h_mdl, ...h_bnd, ...h_ara, ...h_msh]);
    }

    // listen for api calls
    // create a deferred wrapper to merge multiple rapid events
    let defer_all = mesh.util.deferWrap(update_all);
    let defer_selector = mesh.util.deferWrap(update_selector);
    let defer_selection = mesh.util.deferWrap(update_selection);

    broker.listeners({
        model_add: defer_all,
        group_add: defer_all,
        model_remove: defer_all,
        group_remove: defer_all,
        selection_update: defer_all,
        selection_move: defer_selection,
        selection_scale: defer_selection,
        selection_rotate: defer_selection,
        selection_qrotate: defer_selection,
    })
}

})();
