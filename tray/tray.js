const { app, Tray, Menu, shell, nativeImage, dialog, Notification } = require('electron');
const path = require('path');
const { fork, execSync } = require('child_process');
const fs = require('fs');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); return; }

let tray = null;
let serverProcess = null;
let port = 8086;
let serverReady = false;

// Don't show in dock (macOS)
if (app.dock) app.dock.hide();

app.whenReady().then(() => {
  // Create tray icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#7c8cf5"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif" font-weight="bold">CJ</text></svg>`;
  let icon;
  try {
    icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Claude Journal — Starting...');
  updateMenu('Starting...');
  startServer();
});

function startServer() {
  const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const serverPath = path.join(baseDir, 'server.js');
  const modulesPath = path.join(baseDir, 'node_modules');

  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox('Claude Journal', `Server not found at:\n${serverPath}`);
    updateMenu('Error');
    return;
  }

  // Auto-install deps if missing
  if (!fs.existsSync(path.join(modulesPath, 'express'))) {
    updateMenu('Installing deps...');
    try {
      execSync('npm install --omit=dev', { cwd: baseDir, timeout: 120000 });
    } catch (e) {
      dialog.showErrorBox('Claude Journal', `Failed to install dependencies:\n${e.message}`);
      updateMenu('Error');
      return;
    }
  }

  serverProcess = fork(serverPath, [], {
    env: { ...process.env, PORT: String(port), NODE_PATH: modulesPath },
    cwd: baseDir,
    silent: true,
  });

  let output = '';

  serverProcess.stdout?.on('data', (data) => {
    output += data.toString();
    const match = output.match(/localhost:(\d+)/);
    if (match && !serverReady) {
      port = parseInt(match[1]);
      serverReady = true;
      tray?.setToolTip(`Claude Journal — http://localhost:${port}`);
      updateMenu('Running');
      new Notification({ title: 'Claude Journal', body: `Running at http://localhost:${port}` }).show();
      // Auto-open browser on first start
      shell.openExternal(`http://localhost:${port}`);
    }
  });

  serverProcess.stderr?.on('data', (data) => {
    const msg = data.toString();
    output += msg;
    if (msg.includes('EADDRINUSE')) {
      port++;
      serverReady = false;
      startServer();
    }
  });

  serverProcess.on('exit', (code) => {
    serverReady = false;
    if (code !== 0 && code !== null) {
      dialog.showErrorBox('Claude Journal', `Server exited with code ${code}\n\n${output.slice(-300)}`);
      updateMenu('Stopped');
    }
  });
}

function updateMenu(status) {
  const url = `http://localhost:${port}`;
  const contextMenu = Menu.buildFromTemplate([
    { label: `Claude Journal`, enabled: false },
    { label: status === 'Running' ? `Running on port ${port}` : status, enabled: false },
    { type: 'separator' },
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(url),
      enabled: status === 'Running',
    },
    { type: 'separator' },
    {
      label: 'Restart Server',
      click: () => {
        if (serverProcess) serverProcess.kill();
        serverReady = false;
        output = '';
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

  tray?.setContextMenu(contextMenu);

  // Click tray icon = open browser
  tray?.removeAllListeners('click');
  if (status === 'Running') {
    tray?.on('click', () => shell.openExternal(url));
  }
}

let output = '';

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', (e) => e.preventDefault());
