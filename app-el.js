const { app, BrowserWindow } = require('electron');
const path = require('path');
const server = require('@gridspace/app-server');

const basDir = __dirname;
const usrDir = app.getPath("userData");
const appDir = path.join(usrDir, 'gapp');
const cnfDir = path.join(appDir, 'conf');
const logDir = path.join(appDir, 'logs');
const datDir = path.join(appDir, 'data');
const debug = process.argv.slice(2).map(v => v.replaceAll('-','')).contains('debugg');
const devel = process.argv.slice(2).map(v => v.replaceAll('-','')).contains('devel');

// console.log({ appDir, usrDir, logDir, datDir, basDir });
// console.log({ argv: process.argv, debug, devel });
// console.log({
//     cwd: process.cwd(),
//     dir: require('fs').readdirSync('.'),
//     out: require('fs').readdirSync(appDir),
//     ___: require('fs').readdirSync(basDir)
// });

server({
    single: true,
    apps: basDir,
    data: datDir,
    conf: cnfDir,
    logs: logDir,
    cache: path.join(basDir,"data","cache"),
    debug
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
            // preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadURL('http://localhost:8080/kiri');

    if (devel) {
        console.log("opening developer tools");
        mainWindow.webContents.openDevTools();
    }
}

app.on('ready', createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
