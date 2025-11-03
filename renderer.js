class OpenWRTManager {
    constructor() {
        this.isConnected = false;
        this.currentTab = 'dashboard';
        this.autoRefreshInterval = null;
        this.initializeEventListeners();
        this.loadSavedConnection();
    }

    initializeEventListeners() {
        const connectionForm = document.getElementById('connectionForm');
        if (connectionForm) {
            connectionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.isConnected) {
                    this.disconnectRouter();
                } else {
                    this.connectToRouter();
                }
            });
        }

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    this.handleFileSelect(e.dataTransfer.files[0]);
                }
            });
        }
    }

    loadSavedConnection() {
        try {
            const saved = localStorage.getItem('openwrt-connection');
            if (saved) {
                const config = JSON.parse(saved);
                document.getElementById('host').value = config.host || '';
                document.getElementById('username').value = config.username || 'root';
            }
        } catch (error) {
            console.warn('Erro ao carregar conexão salva:', error);
        }
    }

    saveConnection(config) {
        try {
            localStorage.setItem('openwrt-connection', JSON.stringify(config));
        } catch (error) {
            console.warn('Erro ao salvar conexão:', error);
        }
    }

    async connectToRouter() {
        const config = {
            host: document.getElementById('host').value.trim(),
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value
        };

        if (!config.host) {
            this.showMessage('Por favor, informe o endereço do roteador', 'error');
            return;
        }

        this.updateConnectButton(true);
        this.updateConnectionStatus('connecting', 'Conectando...');

        try {
            const result = await window.electronAPI.connectRouter(config);
            
            if (result.success) {
                this.isConnected = true;
                this.updateConnectionStatus('connected', `Conectado - ${config.host}`);
                this.saveConnection(config);
                this.showMessage('Conectado com sucesso!', 'success');
                this.startAutoRefresh();
                await this.loadCurrentTab();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            this.showMessage(`Falha na conexão: ${error.message}`, 'error');
            this.updateConnectionStatus('disconnected', 'Falha na conexão');
            this.isConnected = false;
        } finally {
            this.updateConnectButton(false);
        }
    }

    async disconnectRouter() {
        this.stopAutoRefresh();
        try {
            await window.electronAPI.disconnectRouter();
        } catch (error) {
            console.warn('Erro ao desconectar:', error);
        }
        
        this.isConnected = false;
        this.updateConnectionStatus('disconnected', 'Desconectado');
        this.updateConnectButton(false);
        this.showMessage('Desconectado do roteador', 'warning');
        this.clearAllData();
    }

    updateConnectButton(connecting) {
        const button = document.getElementById('connectButton');
        if (!button) return;
        
        if (connecting) {
            button.disabled = true;
            button.innerHTML = '<span class="loading"></span> Conectando...';
        } else if (this.isConnected) {
            button.disabled = false;
            button.textContent = 'Desconectar';
            button.classList.add('disconnect');
        } else {
            button.disabled = false;
            button.textContent = 'Conectar';
            button.classList.remove('disconnect');
        }
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;

        const statusDot = statusElement.querySelector('.status-dot');
        
        statusDot.className = 'status-dot';
        statusElement.innerHTML = '';

        switch (status) {
            case 'connected':
                statusDot.classList.add('connected');
                statusElement.innerHTML = `<span class="status-dot connected"></span> ${message}`;
                this.enableNavigation(true);
                break;
            case 'connecting':
                statusDot.classList.add('connecting');
                statusElement.innerHTML = `<span class="status-dot connecting"></span> ${message}`;
                this.enableNavigation(false);
                break;
            case 'disconnected':
                statusDot.classList.add('disconnected');
                statusElement.innerHTML = `<span class="status-dot disconnected"></span> ${message}`;
                this.enableNavigation(false);
                break;
        }
    }

    enableNavigation(enabled) {
        document.querySelectorAll('.nav-btn:not(:first-child)').forEach(btn => {
            btn.disabled = !enabled;
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.getElementById(tabName);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        this.currentTab = tabName;
        
        if (this.isConnected) {
            this.loadCurrentTab();
        }
    }

    async loadCurrentTab() {
        if (!this.isConnected) return;

        try {
            switch (this.currentTab) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'network':
                    await this.loadNetworkInfo();
                    break;
                case 'wireless':
                    await this.loadWirelessInfo();
                    break;
                case 'dhcp':
                    await this.loadDHCPInfo();
                    break;
                case 'firewall':
                    await this.loadFirewallInfo();
                    break;
                case 'packages':
                    await this.loadPackagesInfo();
                    break;
                case 'services':
                    await this.loadServicesInfo();
                    break;
                case 'system':
                    await this.loadSystemInfo();
                    break;
                case 'logs':
                    await this.loadLogsInfo();
                    break;
            }
        } catch (error) {
            console.error(`Erro ao carregar ${this.currentTab}:`, error);
            this.showMessage(`Erro ao carregar ${this.currentTab}: ${error.message}`, 'error');
        }
    }

    async loadDashboard() {
        try {
            const [systemInfo, networkInfo, dhcpInfo] = await Promise.all([
                window.electronAPI.getSystemInfo().catch(e => ({ error: e.message })),
                window.electronAPI.getNetworkInfo().catch(e => ({ error: e.message })),
                window.electronAPI.getDHCPInfo().catch(e => ({ error: e.message }))
            ]);

            this.updateDashboard(systemInfo, networkInfo, dhcpInfo);
        } catch (error) {
            this.showMessage(`Erro no dashboard: ${error.message}`, 'error');
        }
    }

    updateDashboard(systemInfo, networkInfo, dhcpInfo) {
        this.updateSystemStats(systemInfo);
        this.updateNetworkInterfaces(networkInfo);
        this.updateConnectedDevices(dhcpInfo);
    }

    updateSystemStats(systemInfo) {
        const statsGrid = document.getElementById('systemStats');
        if (!statsGrid) return;

        if (systemInfo.error) {
            statsGrid.innerHTML = `<div class="message error">Erro: ${systemInfo.error}</div>`;
            return;
        }

        const hostname = systemInfo.hostname || 'OpenWRT';
        const version = systemInfo.release ? systemInfo.release.split('\n')[0] : 'Unknown';
        const uptime = systemInfo.uptime || 'N/A';
        const load = systemInfo.load ? systemInfo.load.split(' ')[0] : '0.00';

        statsGrid.innerHTML = `
            <div class="stat-card system">
                <h3>Sistema</h3>
                <div class="value">${hostname}</div>
                <div class="subtext">${version}</div>
            </div>
            <div class="stat-card cpu">
                <h3>CPU Load</h3>
                <div class="value">${load}</div>
                <div class="subtext">Uptime: ${uptime}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, (parseFloat(load) || 0) * 33)}%"></div>
                </div>
            </div>
            <div class="stat-card memory">
                <h3>Status</h3>
                <div class="value">Online</div>
                <div class="subtext">Conectado</div>
            </div>
            <div class="stat-card network">
                <h3>Rede</h3>
                <div class="value">Ativa</div>
                <div class="subtext">Operacional</div>
            </div>
        `;
    }

    updateNetworkInterfaces(networkInfo) {
        const interfacesGrid = document.getElementById('interfacesGrid');
        if (!interfacesGrid) return;
        
        if (networkInfo.error) {
            interfacesGrid.innerHTML = `<div class="message error">Erro: ${networkInfo.error}</div>`;
            return;
        }

        let interfacesHTML = '';
        
        if (networkInfo.interfaces) {
            const interfaces = this.parseNetworkInterfaces(networkInfo.interfaces);
            interfaces.forEach(intf => {
                const type = intf.name.includes('wan') ? 'wan' : 
                            intf.name.includes('lan') ? 'lan' : 
                            intf.name.includes('wlan') ? 'wifi' : 'lan';
                
                interfacesHTML += `
                    <div class="interface-card ${type}">
                        <div class="interface-header">
                            <div class="interface-name">${intf.name.toUpperCase()}</div>
                            <div class="interface-status ${intf.status.toLowerCase()}">${intf.status}</div>
                        </div>
                        <div class="interface-details">
                            <div class="detail-item">
                                <label>IP</label>
                                <div class="value">${intf.ip}</div>
                            </div>
                            <div class="detail-item">
                                <label>Máscara</label>
                                <div class="value">${intf.mask}</div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        interfacesGrid.innerHTML = interfacesHTML || '<div class="message warning">Nenhuma interface encontrada</div>';
        
        const statusElement = document.getElementById('interfacesStatus');
        if (statusElement) {
            const interfaces = this.parseNetworkInterfaces(networkInfo.interfaces);
            const upCount = interfaces.filter(i => i.status === 'UP').length;
            statusElement.textContent = `${upCount}/${interfaces.length} Ativas`;
        }
    }

    updateConnectedDevices(dhcpInfo) {
        const devicesGrid = document.getElementById('devicesGrid');
        if (!devicesGrid) return;
        
        if (dhcpInfo.error) {
            devicesGrid.innerHTML = `<div class="message error">Erro: ${dhcpInfo.error}</div>`;
            return;
        }

        let devicesHTML = '';
        
        if (dhcpInfo.leases) {
            const leases = this.parseDHCPLeases(dhcpInfo.leases);
            leases.forEach(lease => {
                devicesHTML += `
                    <div class="device-card">
                        <div class="device-name">${lease.hostname || 'Dispositivo'}</div>
                        <div class="device-info">
                            <span class="device-ip">${lease.ip}</span>
                        </div>
                        <div class="device-info">
                            MAC: <code>${lease.mac}</code>
                        </div>
                    </div>
                `;
            });
        }

        devicesGrid.innerHTML = devicesHTML || '<div class="message warning">Nenhum dispositivo conectado</div>';
        
        const countElement = document.getElementById('devicesCount');
        if (countElement && dhcpInfo.leases) {
            const leases = this.parseDHCPLeases(dhcpInfo.leases);
            countElement.textContent = `${leases.length} Dispositivos`;
        }
    }

    parseNetworkInterfaces(interfacesOutput) {
        const interfaces = [];
        if (!interfacesOutput) return interfaces;

        const lines = interfacesOutput.split('\n');
        let currentInterface = null;

        lines.forEach(line => {
            const interfaceMatch = line.match(/^(\d+):\s+(\w+):/);
            if (interfaceMatch) {
                if (currentInterface) interfaces.push(currentInterface);
                currentInterface = {
                    name: interfaceMatch[2],
                    type: 'Ethernet',
                    ip: 'N/A',
                    mask: 'N/A',
                    status: 'UP'
                };
            }
            
            if (currentInterface) {
                if (line.includes('inet ')) {
                    const ipMatch = line.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
                    if (ipMatch) {
                        currentInterface.ip = ipMatch[1];
                        currentInterface.mask = this.cidrToMask(parseInt(ipMatch[2]));
                    }
                }
            }
        });

        if (currentInterface) interfaces.push(currentInterface);
        return interfaces;
    }

    parseDHCPLeases(leasesOutput) {
        const leases = [];
        if (!leasesOutput) return leases;

        const lines = leasesOutput.split('\n');
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
                leases.push({
                    leaseTime: parts[0],
                    mac: parts[1],
                    ip: parts[2],
                    hostname: parts[3] || 'Unknown'
                });
            }
        });

        return leases;
    }

    cidrToMask(cidr) {
        if (!cidr) return '255.255.255.0';
        const mask = [];
        for (let i = 0; i < 4; i++) {
            const bits = Math.min(8, Math.max(0, cidr - i * 8));
            mask.push(256 - Math.pow(2, 8 - bits));
        }
        return mask.join('.');
    }

    async loadNetworkInfo() {
        try {
            const networkInfo = await window.electronAPI.getNetworkInfo();
            this.updateNetworkTab(networkInfo);
        } catch (error) {
            this.showMessage(`Erro na rede: ${error.message}`, 'error');
        }
    }

    updateNetworkTab(networkInfo) {
        const tableBody = document.getElementById('networkTableBody');
        if (!tableBody) return;
        
        if (networkInfo.error) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar dados de rede</td></tr>';
            return;
        }

        let rows = '';
        
        if (networkInfo.interfaces) {
            const interfaces = this.parseNetworkInterfaces(networkInfo.interfaces);
            interfaces.forEach(intf => {
                rows += `
                    <tr>
                        <td><strong>${intf.name}</strong></td>
                        <td>${intf.type}</td>
                        <td class="device-ip">${intf.ip}</td>
                        <td>${intf.mask}</td>
                        <td>N/A</td>
                        <td><span class="status ${intf.status.toLowerCase()}">${intf.status}</span></td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center">Nenhuma interface de rede encontrada</td></tr>';
    }

    async loadWirelessInfo() {
        try {
            const wirelessInfo = await window.electronAPI.getWirelessInfo();
            this.updateWirelessTab(wirelessInfo);
        } catch (error) {
            this.showMessage(`Erro no wireless: ${error.message}`, 'error');
        }
    }

    updateWirelessTab(wirelessInfo) {
        const tableBody = document.getElementById('wirelessTableBody');
        if (!tableBody) return;
        
        if (wirelessInfo.error) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar dados wireless</td></tr>';
            return;
        }

        let rows = '';
        
        if (wirelessInfo.status) {
            const networks = this.parseWirelessNetworks(wirelessInfo.status);
            networks.forEach(net => {
                rows += `
                    <tr>
                        <td><strong>${net.interface}</strong></td>
                        <td>${net.ssid}</td>
                        <td>${net.mode}</td>
                        <td>${net.channel}</td>
                        <td>${net.frequency}</td>
                        <td><span class="device-ip">${net.clients}</span></td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center">Nenhuma interface wireless encontrada</td></tr>';
    }

    parseWirelessNetworks(iwinfoOutput) {
        const networks = [];
        if (!iwinfoOutput) return networks;

        const lines = iwinfoOutput.split('\n');
        let currentNet = null;

        lines.forEach(line => {
            const interfaceMatch = line.match(/^(\w+)\s+ESSID:/);
            if (interfaceMatch) {
                if (currentNet) networks.push(currentNet);
                currentNet = {
                    interface: interfaceMatch[1],
                    ssid: line.split('ESSID:')[1]?.replace(/"/g, '').trim() || 'N/A',
                    mode: 'AP',
                    channel: 'N/A',
                    frequency: 'N/A',
                    clients: '0'
                };
            }
        });

        if (currentNet) networks.push(currentNet);
        return networks;
    }

    async loadDHCPInfo() {
        try {
            const dhcpInfo = await window.electronAPI.getDHCPInfo();
            this.updateDHCPTab(dhcpInfo);
        } catch (error) {
            this.showMessage(`Erro no DHCP: ${error.message}`, 'error');
        }
    }

    updateDHCPTab(dhcpInfo) {
        const tableBody = document.getElementById('dhcpTableBody');
        if (!tableBody) return;
        
        if (dhcpInfo.error) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Erro ao carregar dados DHCP</td></tr>';
            return;
        }

        let rows = '';
        
        if (dhcpInfo.leases) {
            const leases = this.parseDHCPLeases(dhcpInfo.leases);
            leases.forEach(lease => {
                rows += `
                    <tr>
                        <td>${lease.hostname || 'Unknown'}</td>
                        <td class="device-ip">${lease.ip}</td>
                        <td><code>${lease.mac}</code></td>
                        <td>${this.formatLeaseTime(lease.leaseTime)}</td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = rows || '<tr><td colspan="4" class="text-center">Nenhum cliente DHCP encontrado</td></tr>';
    }

    formatLeaseTime(timestamp) {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(parseInt(timestamp) * 1000);
            return date.toLocaleString('pt-BR');
        } catch {
            return timestamp;
        }
    }

    // === FIREWALL IMPLEMENTAÇÃO REAL ===
    async loadFirewallInfo() {
        try {
            const firewallInfo = await window.electronAPI.getFirewallInfo();
            this.updateFirewallTab(firewallInfo);
        } catch (error) {
            this.showMessage(`Erro no firewall: ${error.message}`, 'error');
        }
    }

    updateFirewallTab(firewallInfo) {
        const tableBody = document.getElementById('firewallTableBody');
        const statusElement = document.getElementById('firewallStatus');
        if (!tableBody || !statusElement) return;
        
        if (firewallInfo.error) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Erro ao carregar firewall</td></tr>';
            return;
        }

        let rows = '';
        
        if (firewallInfo.status) {
            const rules = this.parseFirewallRules(firewallInfo.status);
            rules.forEach(rule => {
                rows += `
                    <tr>
                        <td><strong>${rule.chain}</strong></td>
                        <td>${rule.policy}</td>
                        <td>${rule.protocol}</td>
                        <td>${rule.source}</td>
                        <td>${rule.destination}</td>
                        <td>
                            <span class="status ${rule.target.toLowerCase()}">${rule.target}</span>
                            <button class="btn btn-remove" onclick="deleteFirewallRule('${rule.chain}', ${rule.num})" style="margin-left: 5px;">🗑️</button>
                        </td>
                    </tr>
                `;
            });
        }

        tableBody.innerHTML = rows || '<tr><td colspan="6" class="text-center">Nenhuma regra de firewall encontrada</td></tr>';
        statusElement.textContent = firewallInfo.status ? 'Ativo' : 'Inativo';
    }

    parseFirewallRules(iptablesOutput) {
        const rules = [];
        if (!iptablesOutput) return rules;

        const lines = iptablesOutput.split('\n');
        let currentChain = '';
        
        lines.forEach(line => {
            line = line.trim();
            
            const chainMatch = line.match(/^Chain (\w+) \(policy (\w+)/);
            if (chainMatch) {
                currentChain = chainMatch[1];
                return;
            }
            
            const ruleMatch = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)/);
            if (ruleMatch && currentChain) {
                rules.push({
                    num: parseInt(ruleMatch[1]),
                    chain: currentChain,
                    policy: ruleMatch[2],
                    target: ruleMatch[5],
                    protocol: ruleMatch[6],
                    source: ruleMatch[8],
                    destination: ruleMatch[9]
                });
            }
        });

        return rules;
    }

    // === PACOTES IMPLEMENTAÇÃO REAL ===
    async loadPackagesInfo() {
        try {
            const packageInfo = await window.electronAPI.getPackageInfo();
            this.updatePackagesTab(packageInfo);
        } catch (error) {
            this.showMessage(`Erro nos pacotes: ${error.message}`, 'error');
        }
    }

    updatePackagesTab(packageInfo) {
        const packageList = document.getElementById('packageList');
        const packageStats = document.getElementById('packageStats');
        if (!packageList || !packageStats) return;
        
        if (packageInfo.error) {
            packageList.innerHTML = '<div class="message error">Erro ao carregar pacotes</div>';
            return;
        }

        let installedCount = 0;
        let upgradableCount = 0;
        
        if (packageInfo.installed) {
            installedCount = packageInfo.installed.split('\n').filter(p => p.trim()).length;
        }
        
        if (packageInfo.upgradable) {
            upgradableCount = packageInfo.upgradable.split('\n').filter(p => p.trim()).length;
        }

        packageStats.innerHTML = `
            <div class="stat-card system">
                <h3>Pacotes Instalados</h3>
                <div class="value">${installedCount}</div>
                <div class="subtext">Total</div>
            </div>
            <div class="stat-card cpu">
                <h3>Atualizáveis</h3>
                <div class="value">${upgradableCount}</div>
                <div class="subtext">Disponíveis</div>
            </div>
        `;

        let packagesHTML = '';
        
        if (packageInfo.installed) {
            const packages = this.parsePackages(packageInfo.installed, packageInfo.upgradable);
            packages.slice(0, 20).forEach(pkg => {
                packagesHTML += `
                    <div class="package-item">
                        <div class="package-info">
                            <div class="package-name">${pkg.name}</div>
                            <div class="package-version">
                                <span class="current-version">${pkg.currentVersion}</span>
                                ${pkg.newVersion ? `<span class="new-version">→ ${pkg.newVersion}</span>` : ''}
                            </div>
                        </div>
                        <div class="package-actions">
                            ${pkg.newVersion ? 
                                `<button class="btn btn-update" onclick="upgradePackage('${pkg.name}')">Atualizar</button>` : 
                                ''
                            }
                            <button class="btn btn-remove" onclick="removePackage('${pkg.name}')">Remover</button>
                        </div>
                    </div>
                `;
            });
        }

        packageList.innerHTML = packagesHTML || '<div class="package-item"><div class="package-info">Nenhum pacote encontrado</div></div>';
    }

    parsePackages(installedOutput, upgradableOutput) {
        const packages = [];
        if (!installedOutput) return packages;

        const installedLines = installedOutput.split('\n');
        const upgradableMap = {};
        
        if (upgradableOutput) {
            upgradableOutput.split('\n').forEach(line => {
                const parts = line.split(' - ');
                if (parts.length >= 2) {
                    upgradableMap[parts[0].trim()] = parts[1].trim();
                }
            });
        }

        installedLines.forEach(line => {
            const parts = line.split(' - ');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const version = parts[1].trim();
                
                packages.push({
                    name: name,
                    currentVersion: version,
                    newVersion: upgradableMap[name]
                });
            }
        });

        return packages;
    }

    // === SERVIÇOS IMPLEMENTAÇÃO REAL ===
    async loadServicesInfo() {
        try {
            const services = await window.electronAPI.getServices();
            this.updateServicesTab(services);
        } catch (error) {
            this.showMessage(`Erro nos serviços: ${error.message}`, 'error');
        }
    }

    updateServicesTab(services) {
        const tableBody = document.getElementById('servicesTableBody');
        const servicesCount = document.getElementById('servicesCount');
        if (!tableBody || !servicesCount) return;
        
        if (services.error) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Erro ao carregar serviços</td></tr>';
            return;
        }

        let rows = '';
        let runningCount = 0;
        
        Object.entries(services).forEach(([service, status]) => {
            if (status === 'running') runningCount++;
            
            const statusClass = status === 'running' ? 'up' : 
                              status === 'stopped' ? 'down' : 'unknown';
            
            rows += `
                <tr>
                    <td><strong>${service}</strong></td>
                    <td><span class="status ${statusClass}">${status}</span></td>
                    <td>Auto</td>
                    <td>
                        <div class="service-actions">
                            ${status === 'running' ? 
                                `<button class="btn btn-remove" onclick="stopService('${service}')">Parar</button>` :
                                `<button class="btn btn-update" onclick="startService('${service}')">Iniciar</button>`
                            }
                            <button class="btn btn-update" onclick="restartService('${service}')">Reiniciar</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = rows || '<tr><td colspan="4" class="text-center">Nenhum serviço encontrado</td></tr>';
        servicesCount.textContent = `${runningCount}/${Object.keys(services).length} Executando`;
    }

    // === SISTEMA IMPLEMENTAÇÃO REAL ===
    async loadSystemInfo() {
        try {
            const [systemInfo, systemStats] = await Promise.all([
                window.electronAPI.getSystemInfo(),
                window.electronAPI.getSystemStats()
            ]);
            this.updateSystemTab(systemInfo, systemStats);
        } catch (error) {
            this.showMessage(`Erro no sistema: ${error.message}`, 'error');
        }
    }

    updateSystemTab(systemInfo, systemStats) {
        const detailedSystemInfo = document.getElementById('detailedSystemInfo');
        if (!detailedSystemInfo) return;

        let infoHTML = `
            <div class="system-details">
                <h4>Informações do Sistema</h4>
                <div class="info-grid">
        `;

        if (systemInfo.release) {
            const releaseLines = systemInfo.release.split('\n');
            releaseLines.forEach(line => {
                if (line.includes('=')) {
                    const [key, value] = line.split('=');
                    infoHTML += `
                        <div class="info-item">
                            <label>${key.replace('DISTRIB_', '').replace(/"/g, '')}:</label>
                            <span>${value.replace(/"/g, '')}</span>
                        </div>
                    `;
                }
            });
        }

        infoHTML += `
                </div>
                
                <h4 style="margin-top: 2rem;">Estatísticas</h4>
                <div class="info-grid">
        `;

        if (systemStats.memory) {
            const memLines = systemStats.memory.split('\n');
            if (memLines.length > 1) {
                const memInfo = memLines[1].split(/\s+/).filter(Boolean);
                infoHTML += `
                    <div class="info-item">
                        <label>Memória Total:</label>
                        <span>${memInfo[1]} MB</span>
                    </div>
                    <div class="info-item">
                        <label>Memória Usada:</label>
                        <span>${memInfo[2]} MB</span>
                    </div>
                `;
            }
        }

        if (systemStats.load) {
            const load = systemStats.load.split(' ');
            infoHTML += `
                <div class="info-item">
                    <label>Load Average:</label>
                    <span>${load[0]}, ${load[1]}, ${load[2]}</span>
                </div>
            `;
        }

        infoHTML += `
                </div>
            </div>
        `;

        detailedSystemInfo.innerHTML = infoHTML;
    }

    // === LOGS IMPLEMENTAÇÃO REAL ===
    async loadLogsInfo() {
        try {
            const logs = await window.electronAPI.getLogs();
            this.updateLogsTab(logs);
        } catch (error) {
            this.showMessage(`Erro nos logs: ${error.message}`, 'error');
        }
    }

    updateLogsTab(logs) {
        const systemLogs = document.getElementById('systemLogs');
        if (!systemLogs) return;

        let logsHTML = '';
        
        if (logs.system) {
            const logLines = logs.system.split('\n');
            logLines.forEach(line => {
                if (line.trim()) {
                    let logClass = 'log-info';
                    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
                        logClass = 'log-error';
                    } else if (line.toLowerCase().includes('warning')) {
                        logClass = 'log-warning';
                    }
                    
                    logsHTML += `<div class="log-entry ${logClass}">${line}</div>`;
                }
            });
        } else {
            logsHTML = '<div class="log-entry log-info">Nenhum log disponível</div>';
        }

        systemLogs.innerHTML = logsHTML;
        systemLogs.scrollTop = systemLogs.scrollHeight;
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.autoRefreshInterval = setInterval(() => {
            if (this.isConnected && this.currentTab === 'dashboard') {
                this.loadDashboard();
            }
        }, 15000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    clearAllData() {
        const clearElements = [
            'systemStats', 'interfacesGrid', 'devicesGrid',
            'networkTableBody', 'wirelessTableBody', 'dhcpTableBody'
        ];
        
        clearElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '<div class="text-center">Desconectado</div>';
            }
        });

        const statusElements = ['interfacesStatus', 'devicesCount'];
        statusElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = 'Desconectado';
        });
    }

    showMessage(message, type = 'info') {
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => {
            if (msg.parentNode) {
                msg.parentNode.removeChild(msg);
            }
        });

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent && mainContent.firstChild) {
            mainContent.insertBefore(messageDiv, mainContent.firstChild);
        }

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }

    handleFileSelect(file) {
        console.log('File selected:', file);
        this.showMessage(`Arquivo selecionado: ${file.name}`, 'info');
    }

    async rebootRouter() {
        if (confirm('Tem certeza que deseja reiniciar o roteador? Esta ação desconectará o aplicativo.')) {
            try {
                await window.electronAPI.rebootRouter();
                this.showMessage('Roteador reiniciando...', 'success');
                setTimeout(() => {
                    this.disconnectRouter();
                }, 2000);
            } catch (error) {
                this.showMessage(`Erro ao reiniciar: ${error.message}`, 'error');
            }
        }
    }

    async restartService(service) {
        try {
            await window.electronAPI.restartService(service);
            this.showMessage(`Serviço ${service} reiniciado`, 'success');
        } catch (error) {
            this.showMessage(`Erro ao reiniciar ${service}: ${error.message}`, 'error');
        }
    }
}

// Global functions
let appManager;

document.addEventListener('DOMContentLoaded', () => {
    appManager = new OpenWRTManager();
});

function showTab(tabName) {
    if (appManager) appManager.switchTab(tabName);
}

function restartService(service) {
    if (appManager) appManager.restartService(service);
}

function rebootRouter() {
    if (appManager) appManager.rebootRouter();
}

function refreshDashboard() {
    if (appManager) appManager.loadDashboard();
}

function refreshLogs() {
    if (appManager) appManager.loadLogsInfo();
}

function clearLogs() {
    if (appManager) {
        window.electronAPI.clearLogs().then(result => {
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                appManager.loadLogsInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        });
    }
}

function refreshPackages() {
    if (appManager) appManager.loadPackagesInfo();
}

async function upgradePackage(packageName) {
    if (appManager) {
        try {
            appManager.showMessage(`Atualizando ${packageName}...`, 'info');
            const result = await window.electronAPI.upgradePackage(packageName);
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                appManager.loadPackagesInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function removePackage(packageName) {
    if (appManager && confirm(`Tem certeza que deseja remover o pacote ${packageName}?`)) {
        try {
            appManager.showMessage(`Removendo ${packageName}...`, 'info');
            const result = await window.electronAPI.removePackage(packageName);
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                appManager.loadPackagesInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function startService(service) {
    if (appManager) {
        try {
            appManager.showMessage(`Iniciando ${service}...`, 'info');
            const result = await window.electronAPI.startService(service);
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                setTimeout(() => appManager.loadServicesInfo(), 2000);
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function stopService(service) {
    if (appManager) {
        try {
            appManager.showMessage(`Parando ${service}...`, 'info');
            const result = await window.electronAPI.stopService(service);
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                setTimeout(() => appManager.loadServicesInfo(), 2000);
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function deleteFirewallRule(chain, lineNumber) {
    if (appManager && confirm(`Tem certeza que deseja remover a regra ${lineNumber} da cadeia ${chain}?`)) {
        try {
            appManager.showMessage(`Removendo regra...`, 'info');
            const result = await window.electronAPI.deleteFirewallRule(chain, lineNumber);
            if (result.success) {
                appManager.showMessage(result.message, 'success');
                appManager.loadFirewallInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function updateAllPackages() {
    if (appManager) {
        try {
            appManager.showMessage('Atualizando todos os pacotes...', 'info');
            const result = await window.electronAPI.updatePackages();
            if (result.success) {
                appManager.showMessage('Pacotes atualizados com sucesso!', 'success');
                appManager.loadPackagesInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

async function checkForUpdates() {
    if (appManager) {
        try {
            appManager.showMessage('Verificando atualizações...', 'info');
            const result = await window.electronAPI.updatePackages();
            if (result.success) {
                if (result.upgradable && result.upgradable.trim()) {
                    const updateCount = result.upgradable.split('\n').filter(p => p.trim()).length;
                    appManager.showMessage(`${updateCount} pacotes podem ser atualizados`, 'warning');
                } else {
                    appManager.showMessage('Todos os pacotes estão atualizados', 'success');
                }
                appManager.loadPackagesInfo();
            } else {
                appManager.showMessage(`Erro: ${result.error}`, 'error');
            }
        } catch (error) {
            appManager.showMessage(`Erro: ${error.message}`, 'error');
        }
    }
}

function startFirmwareUpdate() {
    if (appManager) appManager.showMessage('Atualização de firmware em desenvolvimento', 'info');
}

function closeModal() {
    const modal = document.getElementById('confirmationModal');
    if (modal) modal.classList.remove('active');
}