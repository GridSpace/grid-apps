/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { selection } from './selected.js';
import { Widget } from '../core/widget.js';

/**
 * Merge selected widgets into a group.
 * Grouped widgets move together as a unit.
 */
function groupMerge() {
    Widget.Groups.merge(selection.widgets(true));
}

/**
 * Split grouped widgets back into individual widgets.
 */
function groupSplit() {
    Widget.Groups.split(selection.widgets(false));
}

export const group = {
    merge: groupMerge,
    split: groupSplit,
};
