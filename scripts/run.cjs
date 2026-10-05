// Launches electron-vite with a clean environment.
// Terminals spawned by VS Code extensions can inherit ELECTRON_RUN_AS_NODE=1, which makes
// Electron start as plain Node (and crash on `app.whenReady`). Clearing it here avoids that.
const { spawn } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('npx', ['electron-vite', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
