const is_self = typeof(self) !== 'undefined';

const terms = {
    COPYRIGHT: "Copyright (C) Stewart Allen <sa@grid.space> - All Rights Reserved",
    LICENSE: "See the license.md file included with the source distribution",
    VERSION: (is_self ? self : this).debug_version || "4.1.9"
};

export const license = terms;
