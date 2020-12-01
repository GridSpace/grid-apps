/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        stacks = {},
        freeMem = true,
        tallest = 0,
        min = 0,
        max = 0,
        labels, API, UC, UI, DYN;

    function init() {
        labels = $("layers");
        API = KIRI.api,
        UC = API.uc,
        UI = API.ui;
    }

    function setFreeMem(bool) {
        freeMem = bool;
        return this;
    }

    function clear() {
        if (!API) {
            init();
        }
        // remove stacks from their views
        for (const [stack, data] of Object.entries(stacks)) {
            data.clear();
        }
        min = max = tallest = 0;
        stacks = {};
        DYN = UI.dyn = {};

        // clear labels
        UC.setGroup(labels);
        labels.innerHTML = '';
    }

    function getStack(name) {
        return stacks[name];
    }

    function create(name, view) {
        if (stacks[name]) {
            return stacks[name];
        }
        const stack = stacks[name] = {
            layers: [ ],
            obj: new KIRI.Stack(view),
            add: function(layers) {
                let map = stack.obj.addLayers(layers);
                for (const [label, mats] of Object.entries(map)) {
                    if (!DYN[label]) {
                        DYN[label] = {
                            group: [],
                            toggle: UC.newBoolean(label, (abc) => {
                                ctrl.group.forEach(mat => {
                                    mat.visible = ctrl.toggle.checked;
                                });
                            })
                        };
                    }
                    const ctrl = DYN[label];
                    ctrl.group.appendAll(mats);
                    ctrl.toggle.checked = mats.state;
                }
                tallest = Math.max(tallest, stack.obj.size());
            },
            remove: function() {
                view.remove(stack.obj.view);
            },
            clear: function() {
                view.remove(stack.obj.view);
            },
            button: function(label, action) {
                UC.newRow([ UC.newButton(label, action) ]);
            }
        };
        return stack;
    }

    function remove(name) {
        const stack = stacks[name];
        if (stack) {
            stack.remove();
            delete stacks[name];
        }
    }

    function getRange() {
        return {min, max, tallest};
    }

    function setRange(newMin, newMax) {
        Object.values(stacks).forEach(stack => {
            stack.obj.setVisible(newMin,newMax);
        });
        min = newMin;
        max = newMax;
    }

    KIRI.stacks = {
        clear,
        create,
        remove,
        getStack,
        getRange,
        setRange,
        setFreeMem
    };

})();
