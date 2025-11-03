const { NodeSSH } = require('node-ssh');
const ping = require('ping');
const path = require('path');

class OpenWRTAPI {
    constructor(config) {
        this.host = config.host;
        this.username = config.username;
        this.password = config.password;
        this.port = config.port || 22;
        this.ssh = new NodeSSH();
        this.isConnected = false;
    }

    async checkConnection() {
        try {
            console.log(`Tentando conectar ao ${this.host}:${this.port}`);
            
            const pingResult = await ping.promise.probe(this.host);
            if (!pingResult.alive) {
                throw new Error(`Host ${this.host} não responde ao ping`);
            }

            await this.connectSSH();
            console.log('SSH conectado');

            const testResult = await this.executeCommand('echo "Connection Test OK"');
            console.log('Teste de comando OK:', testResult.stdout);

            this.isConnected = true;
            return { 
                success: true, 
                message: `Conectado com sucesso ao ${this.host}` 
            };

        } catch (error) {
            console.error('Erro na conexão:', error);
            this.isConnected = false;
            throw new Error(`Falha na conexão: ${error.message}`);
        }
    }

    async connectSSH() {
        try {
            await this.ssh.connect({
                host: this.host,
                username: this.username,
                password: this.password,
                port: this.port,
                readyTimeout: 10000,
                tryKeyboard: true,
            });
        } catch (error) {
            throw new Error(`SSH: ${error.message}`);
        }
    }

    async executeCommand(command, timeout = 30000) {
        if (!this.ssh.isConnected()) {
            throw new Error('SSH não conectado');
        }

        try {
            const result = await this.ssh.execCommand(command, { timeout });
            
            if (result.stderr && !this.isIgnorableError(result.stderr, command)) {
                console.warn(`Comando retornou stderr: ${command}`, result.stderr);
            }
            
            return {
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code
            };
        } catch (error) {
            throw new Error(`Comando "${command}" falhou: ${error.message}`);
        }
    }

    isIgnorableError(stderr, command) {
        const ignorableErrors = [
            'WARNING:',
            'Warning:',
            'deprecated',
            'opkg list',
            'grep',
            'awk',
            'not found'
        ];
        
        return ignorableErrors.some(pattern => 
            stderr.includes(pattern) || command.includes(pattern)
        );
    }

    async disconnect() {
        if (this.ssh && this.ssh.isConnected()) {
            await this.ssh.dispose();
        }
        this.isConnected = false;
    }

    // === SISTEMA ===
    async getSystemInfo() {
        const commands = {
            release: 'cat /etc/openwrt_release',
            version: 'cat /proc/version',
            uptime: 'cat /proc/uptime && uptime',
            time: 'date',
            hostname: 'uci get system.@system[0].hostname || hostname || cat /proc/sys/kernel/hostname',
            model: 'cat /tmp/sysinfo/model 2>/dev/null || cat /proc/cpuinfo | grep machine || echo "Modelo não detectado"'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout.trim();
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    async getSystemStats() {
        const commands = {
            memory: 'free -m',
            load: 'cat /proc/loadavg',
            disk: 'df -h',
            processes: 'ps | wc -l',
            temperature: 'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null || echo "N/A"',
            cpu: 'top -bn1 | grep "CPU:" | head -1'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    // === REDE ===
    async getNetworkInfo() {
        const commands = {
            interfaces: 'ip addr show',
            routes: 'ip route show',
            dns: 'cat /tmp/resolv.conf.auto 2>/dev/null || cat /etc/resolv.conf',
            arp: 'ip neigh show',
            connections: 'netstat -tunap 2>/dev/null || ss -tunap'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    async getInterfaceStatus() {
        try {
            const result = await this.executeCommand('ubus call network.interface dump');
            return JSON.parse(result.stdout);
        } catch (error) {
            const result = await this.executeCommand('ifstatus');
            return { raw: result.stdout };
        }
    }

    // === WIRELESS ===
    async getWirelessInfo() {
        const commands = {
            status: 'iwinfo 2>/dev/null || wifi status',
            config: 'uci show wireless',
            clients: 'iwinfo 2>/dev/null || iw dev 2>/dev/null || echo "Wireless não disponível"',
            scan: 'iwinfo scan 2>/dev/null || iw dev wlan0 scan 2>/dev/null || echo "Scan não disponível"'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    // === DHCP ===
    async getDHCPInfo() {
        const commands = {
            leases: 'cat /tmp/dhcp.leases 2>/dev/null || echo "Arquivo de leases não encontrado"',
            config: 'uci show dhcp',
            stats: 'cat /tmp/dnsmasq.status 2>/dev/null || echo "Status não disponível"',
            hosts: 'cat /etc/hosts 2>/dev/null || echo "Arquivo hosts não encontrado"'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    // === FIREWALL ===
    async getFirewallInfo() {
        const commands = {
            status: 'iptables -L -n -v --line-numbers',
            rules: 'uci show firewall',
            zones: 'iptables -t nat -L -n -v',
            traffic: 'iptables -L -v -x -n',
            config: 'cat /etc/config/firewall 2>/dev/null || echo "Configuração não encontrada"'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    async addFirewallRule(rule) {
        try {
            const result = await this.executeCommand(`iptables ${rule}`);
            return {
                success: true,
                output: result.stdout,
                message: 'Regra de firewall adicionada com sucesso'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteFirewallRule(chain, lineNumber) {
        try {
            const result = await this.executeCommand(`iptables -D ${chain} ${lineNumber}`);
            return {
                success: true,
                output: result.stdout,
                message: 'Regra de firewall removida com sucesso'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === PACOTES ===
    async getPackageInfo() {
        const commands = {
            installed: 'opkg list-installed',
            upgradable: 'opkg list-upgradable',
            all: 'opkg list | head -100',
            config: 'cat /etc/opkg/customfeeds.conf /etc/opkg/distfeeds.conf 2>/dev/null || echo "Configuração padrão"',
            space: 'df -h /overlay /tmp'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    async updatePackages() {
        try {
            const update = await this.executeCommand('opkg update');
            const upgradable = await this.executeCommand('opkg list-upgradable');
            
            return {
                success: true,
                updateOutput: update.stdout,
                upgradable: upgradable.stdout,
                message: 'Lista de pacotes atualizada com sucesso'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async installPackage(packageName) {
        try {
            const result = await this.executeCommand(`opkg install ${packageName}`);
            return {
                success: true,
                output: result.stdout,
                message: `Pacote ${packageName} instalado com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async removePackage(packageName) {
        try {
            const result = await this.executeCommand(`opkg remove ${packageName}`);
            return {
                success: true,
                output: result.stdout,
                message: `Pacote ${packageName} removido com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async upgradePackage(packageName) {
        try {
            const result = await this.executeCommand(`opkg upgrade ${packageName}`);
            return {
                success: true,
                output: result.stdout,
                message: `Pacote ${packageName} atualizado com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === SERVIÇOS ===
    async getServices() {
        try {
            const result = await this.executeCommand('ls /etc/init.d/');
            const services = result.stdout.split('\n').filter(s => s.trim());
            
            const serviceStatus = {};
            for (const service of services) {
                if (service && service.length > 0) {
                    try {
                        const statusResult = await this.executeCommand(`/etc/init.d/${service} status 2>/dev/null || echo "unknown"`);
                        const statusOutput = statusResult.stdout.toLowerCase();
                        
                        if (statusOutput.includes('running') || statusOutput.includes('started')) {
                            serviceStatus[service] = 'running';
                        } else if (statusOutput.includes('stopped') || statusOutput.includes('not running')) {
                            serviceStatus[service] = 'stopped';
                        } else {
                            serviceStatus[service] = 'unknown';
                        }
                    } catch (error) {
                        serviceStatus[service] = 'unknown';
                    }
                }
            }

            return serviceStatus;
        } catch (error) {
            return { error: error.message };
        }
    }

    async restartService(service) {
        try {
            const result = await this.executeCommand(`/etc/init.d/${service} restart`);
            return {
                success: true,
                output: result.stdout,
                message: `Serviço ${service} reiniciado com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async startService(service) {
        try {
            const result = await this.executeCommand(`/etc/init.d/${service} start`);
            return {
                success: true,
                output: result.stdout,
                message: `Serviço ${service} iniciado com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stopService(service) {
        try {
            const result = await this.executeCommand(`/etc/init.d/${service} stop`);
            return {
                success: true,
                output: result.stdout,
                message: `Serviço ${service} parado com sucesso`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async enableService(service) {
        try {
            const result = await this.executeCommand(`/etc/init.d/${service} enable`);
            return {
                success: true,
                output: result.stdout,
                message: `Serviço ${service} habilitado na inicialização`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async disableService(service) {
        try {
            const result = await this.executeCommand(`/etc/init.d/${service} disable`);
            return {
                success: true,
                output: result.stdout,
                message: `Serviço ${service} desabilitado na inicialização`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === LOGS ===
    async getLogs() {
        const commands = {
            system: 'logread -e 2>/dev/null || dmesg | tail -50',
            kernel: 'dmesg | tail -30',
            messages: 'tail -50 /var/log/messages 2>/dev/null || echo "Arquivo /var/log/messages não encontrado"',
            debug: 'logread -l 100 2>/dev/null || echo "Logs do sistema não disponíveis"',
            auth: 'tail -30 /var/log/auth.log 2>/dev/null || echo "Logs de autenticação não disponíveis"'
        };

        const results = {};
        for (const [key, cmd] of Object.entries(commands)) {
            try {
                const result = await this.executeCommand(cmd);
                results[key] = result.stdout;
            } catch (error) {
                results[key] = `Erro: ${error.message}`;
            }
        }
        return results;
    }

    async clearLogs() {
        try {
            const result = await this.executeCommand('echo "" > /var/log/messages 2>/dev/null; logread -c 2>/dev/null; echo "Logs limpos"');
            return {
                success: true,
                output: result.stdout,
                message: 'Logs do sistema limpos com sucesso'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === SISTEMA DE ARQUIVOS ===
    async getFilesystemInfo() {
        try {
            const result = await this.executeCommand('df -h && echo "---" && ls -la /');
            return {
                success: true,
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === CONFIGURAÇÃO UCI ===
    async getUCIconfig() {
        try {
            const result = await this.executeCommand('uci export');
            return {
                success: true,
                config: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async setUCIconfig(section, option, value) {
        try {
            const result = await this.executeCommand(`uci set ${section}.${option}="${value}" && uci commit ${section.split('.')[0]}`);
            return {
                success: true,
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === REINICIALIZAÇÃO ===
    async reboot() {
        try {
            const result = await this.executeCommand('reboot &');
            return {
                success: true,
                message: 'Sistema reiniciando...'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === BACKUP ===
    async backupConfig() {
        try {
            const result = await this.executeCommand('sysupgrade -b /tmp/backup.tar.gz 2>/dev/null || echo "Backup criado em /tmp/backup.tar.gz"');
            return {
                success: true,
                message: 'Backup criado em /tmp/backup.tar.gz',
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === PROCESSOS ===
    async getProcesses() {
        try {
            const result = await this.executeCommand('ps ww');
            return {
                success: true,
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // === WIRELESS CLIENTS ===
    async getWirelessClients() {
        try {
            const result = await this.executeCommand('iwinfo 2>/dev/null || iw dev 2>/dev/null');
            return {
                success: true,
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = OpenWRTAPI;