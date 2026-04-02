const { app, Tray, Menu, shell, nativeImage, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }

let tray = null;
let serverProcess = null;
let port = 8086;

// Don't show in dock (macOS)
if (app.dock) app.dock.hide();

app.whenReady().then(() => {
  // Create tray icon
  const iconPath = path.join(__dirname, 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch {
    // Fallback: create a simple icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Claude Journal');

  updateMenu('Starting...');
  startServer();
});

function startServer() {
  // In dev: ../server.js, in packaged app: resources/server.js
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server.js')
    : path.join(__dirname, '..', 'server.js');
  const modulesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'node_modules')
    : path.join(__dirname, '..', 'node_modules');
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, PORT: String(port), NODE_PATH: modulesPath },
    silent: true,
  });

  serverProcess.stdout?.on('data', (data) => {
    const msg = data.toString();
    // Detect actual port from server output
    const match = msg.match(/localhost:(\d+)/);
    if (match) {
      port = parseInt(match[1]);
      updateMenu('Running');
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('EADDRINUSE')) {
      port++;
      startServer();
    }
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      updateMenu('Stopped');
    }
  });
}

function updateMenu(status) {
  const url = `http://localhost:${port}`;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Claude Journal', enabled: false },
    { type: 'separator' },
    {
      label: `Open in Browser`,
      click: () => shell.openExternal(url),
      enabled: status === 'Running',
    },
    {
      label: `Port: ${port}`,
      enabled: false,
    },
    {
      label: `Change Port...`,
      click: async () => {
        const win = new BrowserWindow({ show: false });
        const result = await dialog.showMessageBox(win, {
          type: 'question',
          title: 'Change Port',
          message: `Current port: ${port}\nEnter new port:`,
          buttons: ['Cancel', 'OK'],
          defaultId: 1,
        });
        win.destroy();
        if (result.response === 1) {
          // Simple prompt fallback - use input dialog
          const { response } = await dialog.showMessageBox({
            type: 'question',
            message: 'Enter new port number (e.g. 9000):',
            buttons: ['8086', '9000', '3000', 'Cancel'],
          });
          const ports = [8086, 9000, 3000];
          if (response < 3) {
            port = ports[response];
            if (serverProcess) serverProcess.kill();
            startServer();
          }
        }
      },
    },
    { type: 'separator' },
    {
      label: status === 'Running' ? `Status: Running` : `Status: ${status}`,
      enabled: false,
    },
    {
      label: 'Restart Server',
      click: () => {
        if (serverProcess) serverProcess.kill();
        updateMenu('Restarting...');
        setTimeout(startServer, 500);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (serverProcess) serverProcess.kill();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon to open browser (macOS/Linux)
  tray.removeAllListeners('click');
  if (status === 'Running') {
    tray.on('click', () => shell.openExternal(`http://localhost:${port}`));
  }
}

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

// Keep app running
app.on('window-all-closed', (e) => e.preventDefault());
