// Renders resources/icon.svg to PNG app icons using Electron's Chromium (run: npm run icon).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'resources', 'icon.svg'), 'utf8');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 600, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const render = async (size) =>
    win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = ${size}; c.height = ${size};
          c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
      })`);
  const write = (file, dataUrl) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', path.relative(root, file));
  };
  write(path.join(root, 'resources', 'icon.png'), await render(512));
  write(path.join(root, 'build', 'icon.png'), await render(512));
  app.quit();
});
