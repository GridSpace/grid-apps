const { BoxGeometry, Matrix4, MeshPhongMaterial, Quaternion, Vector3 } = THREE;
const boxes = [];

export function delbox(name) {
    const old = boxes[name];
    if (old) {
        old.groupTo.remove(old);
    }
}

export function addbox(point, color, name, dim = {x:1,y:1,z:1,rz:0}, opt = {}) {
    delbox(name);

    const box = boxes[name] = new Mesh(
        new BoxGeometry(dim.x, dim.y, dim.z),
        new MeshPhongMaterial({
            transparent: true,
            opacity: opt.opacity || 0.5,
            color
        })
    );

    box.position.x = point.x;
    box.position.y = point.y;
    box.position.z = point.z;

    lastBox = { point, dim };

    const group = opt.group || space.scene
    group.add(box);
    box.groupTo = group;

    if (dim.rz) {
        opt.rotate = new Quaternion().setFromAxisAngle(new Vector3(0,0,1), dim.rz);
    }
    if (opt.rotate) {
        opt.matrix = new Matrix4().makeRotationFromQuaternion(opt.rotate);
    }
    if (opt.matrix) {
        box.geometry.applyMatrix4(opt.matrix);
    }

    return box;
}
