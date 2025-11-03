const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const OpenWRTAPI = require('./openwrt-api');
const fs = require('fs/promises');

let mainWindow;
let openwrtAPI;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Exportar Configurações',
          click: async () => {
            if (!openwrtAPI) {
              dialog.showErrorBox('Erro', 'Não conectado ao roteador');
              return;
            }
            
            try {
              const result = await openwrtAPI.getUCIconfig();
              if (result.success) {
                const { filePath } = await dialog.showSaveDialog(mainWindow, {
                  title: 'Exportar Configurações UCI',
                  defaultPath: 'openwrt-config-export.json',
                  filters: [{ name: 'JSON', extensions: ['json'] }]
                });
                
                if (filePath) {
                  await fs.writeFile(filePath, result.config);
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Sucesso',
                    message: 'Configurações exportadas com sucesso!'
                  });
                }
              }
            } catch (error) {
              dialog.showErrorBox('Erro', `Falha ao exportar: ${error.message}`);
            }
          }
        },
        {
          label: 'Backup do Sistema',
          click: async () => {
            if (!openwrtAPI) {
              dialog.showErrorBox('Erro', 'Não conectado ao roteador');
              return;
            }
            
            try {
              const result = await openwrtAPI.backupConfig();
              if (result.success) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Backup Criado',
                  message: result.message
                });
              }
            } catch (error) {
              dialog.showErrorBox('Erro', `Falha no backup: ${error.message}`);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'forceReload', label: 'Recarregar Forçado' },
        { role: 'toggledevtools', label: 'Ferramentas do Desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom Normal' },
        { role: 'zoomIn', label: 'Aumentar Zoom' },
        { role: 'zoomOut', label: 'Diminuir Zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela Cheia' }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Documentação',
          click: async () => {
            await shell.openExternal('https://openwrt.org/docs/start');
          }
        },
        {
          label: 'Sobre',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre',
              message: 'OpenWRT Manager v1.0\n\nGerenciador completo para roteadores OpenWRT'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// === IPC HANDLERS ===

// Conexão
ipcMain.handle('connect-router', async (event, config) => {
  try {
    console.log('Tentando conectar com:', config);
    openwrtAPI = new OpenWRTAPI(config);
    const result = await openwrtAPI.checkConnection();
    console.log('Conexão bem sucedida:', result);
    return result;
  } catch (error) {
    console.error('Erro na conexão:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('disconnect-router', async () => {
  if (openwrtAPI) {
    try {
      await openwrtAPI.disconnect();
    } catch (error) {
      console.error('Erro ao desconectar:', error);
    }
    openwrtAPI = null;
  }
  return { success: true, message: 'Desconectado' };
});

// Sistema
ipcMain.handle('get-system-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getSystemInfo();
});

ipcMain.handle('get-system-stats', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getSystemStats();
});

// Rede
ipcMain.handle('get-network-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getNetworkInfo();
});

ipcMain.handle('get-interface-status', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getInterfaceStatus();
});

// Wireless
ipcMain.handle('get-wireless-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getWirelessInfo();
});

// DHCP
ipcMain.handle('get-dhcp-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getDHCPInfo();
});

// Firewall
ipcMain.handle('get-firewall-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getFirewallInfo();
});

ipcMain.handle('add-firewall-rule', async (event, rule) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.addFirewallRule(rule);
});

ipcMain.handle('delete-firewall-rule', async (event, chain, lineNumber) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.deleteFirewallRule(chain, lineNumber);
});

// Pacotes
ipcMain.handle('get-package-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getPackageInfo();
});

ipcMain.handle('update-packages', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.updatePackages();
});

ipcMain.handle('install-package', async (event, packageName) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.installPackage(packageName);
});

ipcMain.handle('remove-package', async (event, packageName) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.removePackage(packageName);
});

ipcMain.handle('upgrade-package', async (event, packageName) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.upgradePackage(packageName);
});

// Serviços
ipcMain.handle('get-services', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getServices();
});

ipcMain.handle('restart-service', async (event, service) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.restartService(service);
});

ipcMain.handle('start-service', async (event, service) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.startService(service);
});

ipcMain.handle('stop-service', async (event, service) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.stopService(service);
});

ipcMain.handle('enable-service', async (event, service) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.enableService(service);
});

ipcMain.handle('disable-service', async (event, service) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.disableService(service);
});

// Configuração UCI
ipcMain.handle('get-uci-config', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getUCIconfig();
});

ipcMain.handle('set-uci-config', async (event, section, option, value) => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.setUCIconfig(section, option, value);
});

// Sistema de arquivos
ipcMain.handle('get-filesystem-info', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getFilesystemInfo();
});

// Logs
ipcMain.handle('get-logs', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getLogs();
});

ipcMain.handle('clear-logs', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.clearLogs();
});

// Sistema
ipcMain.handle('reboot-router', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.reboot();
});

ipcMain.handle('backup-config', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.backupConfig();
});

// Processos
ipcMain.handle('get-processes', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getProcesses();
});

// Wireless Clients
ipcMain.handle('get-wireless-clients', async () => {
  if (!openwrtAPI) throw new Error('Não conectado');
  return await openwrtAPI.getWirelessClients();
});