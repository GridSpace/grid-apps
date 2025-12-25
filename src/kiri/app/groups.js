/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { selection } from './select.js';
import { Widget } from '../core/widget.js';

function groupMerge() {
    Widget.Groups.merge(selection.widgets(true));
}

function groupSplit() {
    Widget.Groups.split(selection.widgets(false));
}

export const group = {
    merge: groupMerge,
    split: groupSplit,
};
