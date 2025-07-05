/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */
import { driver } from '../kiri-mode/laser/driver.js';


const DRIVERS = root.kiri.driver;
const { LASER } = DRIVERS;
const { TYPE } = LASER;
DRIVERS.DRAG = Object.assign({}, LASER, { name: "DragKnife", type: TYPE.DRAG });


export { DRIVERS };
