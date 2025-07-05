/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */
import { driver } from '../kiri-mode/laser/driver.js';


const DRIVERS = root.kiri.driver;
const { LASER } = DRIVERS;
const { TYPE } = LASER;
DRIVERS.WJET = Object.assign({}, LASER, { name: 'WaterJet', type: TYPE.WJET });


export { DRIVERS };
