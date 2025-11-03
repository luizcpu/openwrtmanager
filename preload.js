const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Conexão
  connectRouter: (config) => ipcRenderer.invoke('connect-router', config),
  disconnectRouter: () => ipcRenderer.invoke('disconnect-router'),
  
  // Sistema
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  rebootRouter: () => ipcRenderer.invoke('reboot-router'),
  backupConfig: () => ipcRenderer.invoke('backup-config'),
  
  // Rede
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  getInterfaceStatus: () => ipcRenderer.invoke('get-interface-status'),
  
  // Wireless
  getWirelessInfo: () => ipcRenderer.invoke('get-wireless-info'),
  getWirelessClients: () => ipcRenderer.invoke('get-wireless-clients'),
  
  // DHCP
  getDHCPInfo: () => ipcRenderer.invoke('get-dhcp-info'),
  
  // Firewall
  getFirewallInfo: () => ipcRenderer.invoke('get-firewall-info'),
  addFirewallRule: (rule) => ipcRenderer.invoke('add-firewall-rule', rule),
  deleteFirewallRule: (chain, lineNumber) => ipcRenderer.invoke('delete-firewall-rule', chain, lineNumber),
  
  // Pacotes
  getPackageInfo: () => ipcRenderer.invoke('get-package-info'),
  updatePackages: () => ipcRenderer.invoke('update-packages'),
  installPackage: (packageName) => ipcRenderer.invoke('install-package', packageName),
  removePackage: (packageName) => ipcRenderer.invoke('remove-package', packageName),
  upgradePackage: (packageName) => ipcRenderer.invoke('upgrade-package', packageName),
  
  // Serviços
  getServices: () => ipcRenderer.invoke('get-services'),
  restartService: (service) => ipcRenderer.invoke('restart-service', service),
  startService: (service) => ipcRenderer.invoke('start-service', service),
  stopService: (service) => ipcRenderer.invoke('stop-service', service),
  enableService: (service) => ipcRenderer.invoke('enable-service', service),
  disableService: (service) => ipcRenderer.invoke('disable-service', service),
  
  // Configuração UCI
  getUCIconfig: () => ipcRenderer.invoke('get-uci-config'),
  setUCIconfig: (section, option, value) => ipcRenderer.invoke('set-uci-config', section, option, value),
  
  // Sistema de arquivos
  getFilesystemInfo: () => ipcRenderer.invoke('get-filesystem-info'),
  
  // Logs
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  
  // Processos
  getProcesses: () => ipcRenderer.invoke('get-processes')
});