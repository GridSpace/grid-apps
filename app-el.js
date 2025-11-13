const { app, shell, session, BrowserWindow } = require('electron');
const path = require('path');
const server = require('@gridspace/app-server');

const pkgd = app.isPackaged;
const basDir = __dirname;
const usrDir = app.getPath("userData");
const appDir = path.join(usrDir, 'gapp');
const cnfDir = path.join(appDir, 'conf');
const logDir = path.join(appDir, 'logs');
const datDir = path.join(appDir, 'data');
const debug = process.argv.slice(2).map(v => v.replaceAll('-', '')).indexOf('debugg') >= 0;
const devel = process.argv.slice(2).map(v => v.replaceAll('-', '')).indexOf('devel') >= 0;

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

// console.log({ appDir, usrDir, logDir, datDir, basDir });
// console.log({ argv: process.argv, debug, devel });
// console.log({
//     cwd: process.cwd(),
//     dir: require('fs').readdirSync('.'),
//     out: require('fs').readdirSync(appDir),
//     ___: require('fs').readdirSync(basDir)
// });

server({
    port: 5309,
    apps: basDir,
    data: datDir,
    conf: cnfDir,
    logs: logDir,
    single: true,
    electron: true,
    pkgd,
    debug
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        webPreferences: {
            // contextIsolation: true,
            // nodeIntegration: false,
            // sandbox: true,
            // preload: undefined
            // nodeIntegration: true,
            // contextIsolation: false
            // preload: path.join(__dirname, 'preload.js')
        }
    });

    const { webContents } = mainWindow;

    mainWindow.loadURL('http://localhost:5309/kiri');

    // default normal url navigation or page opens to happen outside Electron
    webContents.setWindowOpenHandler((details) => {
        // console.log('EXTERNAL', details);
        shell.openExternal(details.url);
        return { action: 'deny' }
    });

    // prevent "other" urls from opening inside Electron (alerts are problematic)
    webContents.on('will-navigate', (event, url) => {
        // console.log('DIVERT', url);
        if (url.endsWith('/kiri') || url.endsWith('/kiri/')) {
            return;
        }
        if (url.endsWith('/mesh') || url.endsWith('/mesh/')) {
            return;
        }
        event.preventDefault();
        shell.openExternal(url);
    });

    webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`{ let x = document.getElementById('app-quit'); if (x) { x.onclick = () => window.close() } }; null;`);
    });

    if (devel) {
        console.log("opening developer tools");
        webContents.openDevTools();
    }
}

app.on('ready', () => {
    session.defaultSession.clearCache().then(createWindow);
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
