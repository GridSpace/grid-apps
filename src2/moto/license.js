const is_self = typeof(self) !== 'undefined';

const terms = {
    COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
    LICENSE: "See the license.md file included with the source distribution",
    VERSION: (is_self ? self : this).debug_version || "4.3.0"
};

export const beta = 1;
export const license = terms;
export const version = terms.VERSION;
