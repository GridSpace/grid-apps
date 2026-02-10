const root = await navigator.storage?.getDirectory();

function resolvePath(path) {
    if (!path) {
        return [];
    } else if (typeof path === 'string') {
        path = path.trim();
        while (path.charAt(0) === '/') {
            path = path.substring(1);
        }
        return path.length ? path.split('/') : [];
    } else if (Array.isArray(path)) {
        return path;
    } else {
        throw "invalid path value";
    }
}

export async function dirHandle(path, options = { create: true }) {
    path = resolvePath(path);
    if (path.length === 0) {
        return root;
    }
    let dir = root;
    for (let tok of path) {
        try {
            dir = await dir.getDirectoryHandle(tok, options);
        } catch (error) {
            if (options.report) {
                console.log({ path, error });
            }
            return undefined;
        }
    }
    return dir;
}

export async function fileHandle(path, options = { create: false }) {
    path = resolvePath(path);
    if (path.length === 0) {
        return undefined;
    }
    let target = path.pop();
    let dir = await dirHandle(path);
    return dir.getFileHandle(target, options);
}

export async function clear() {
    for await (let name of root.keys()) {
        await root.removeEntry(name, { recursive: true });
    }
}

export async function remove(path) {
    path = resolvePath(path);
    if (path.length === 0) {
        return clear();
    }
    let target = path.pop();
    let dir = await dirHandle(path);
    console.log({ dir, target });
    await dir.removeEntry(target, { recursive: true });
}

export async function entries(path) {
    return (await dirHandle(path)).entries();
}

export async function values(path) {
    return (await dirHandle(path)).values();
}

export async function keys(path) {
    return (await dirHandle(path)).keys();
}

export async function tree(path) {
    path = resolvePath(path);
    let dir = await dirHandle(path);
    return treeFrom(dir, path, []);
}

async function treeFrom(dir, path, list) {
    let entries = await dir.entries()
    for await (let [ name, handle ] of entries) {
        path.push(name);
        if (handle.kind === 'directory') {
            await treeFrom(handle, path, list);
        } else {
            list.push(path.join('/'));
        }
        path.pop();
    }
    return list;
}

export async function getText(path) {
    let handle = await fileHandle(path);
    let file = await handle.getFile();
    return file.text();
}

export async function putText(path, text) {
    let handle = await fileHandle(path, { create: true });
    let stream = await handle.createWritable();
    await stream.write(text);
    return stream.close();
}

export const OPFS = {
    dirHandle,
    fileHandle,
    entries,
    keys,
    values,
    tree,
    clear,
    remove,
    getText,
    putText
};
