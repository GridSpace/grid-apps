/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// shared by client and worker contexts
export function getRangeParameters(process, index) {
    if (index === undefined || index === null || index < 0) {
        return process;
    }
    let ranges = process.ranges;
    if (!(ranges && ranges.length)) {
        return process;
    }
    let params = Object.clone(process);
    for (let range of ranges) {
        if (index >= range.lo && index <= range.hi) {
            for (let [key, value] of Object.entries(range.fields)) {
                params[key] = value;
                params._range = true;
            }
        }
    }
    return params;
}
