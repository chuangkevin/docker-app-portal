import fs from 'fs';
import Docker from 'dockerode';

export interface DomainBinding {
  subdomain: string;
  port: number;
}

export class CaddyfileService {
  private caddyfilePath: string;
  private caddyContainerName: string;

  constructor(caddyfilePath: string, caddyContainerName: string) {
    this.caddyfilePath = caddyfilePath;
    this.caddyContainerName = caddyContainerName;
  }

  /**
   * Parse Caddyfile and return all domain bindings.
   * Looks for patterns like:
   *   @name host name.sisihome.org
   *   handle @name {
   *       reverse_proxy localhost:PORT
   *   }
   */
  parseBindings(): DomainBinding[] {
    const content = fs.readFileSync(this.caddyfilePath, 'utf-8');
    const bindings: DomainBinding[] = [];

    // Match HTTPS handler blocks: @name host name.sisihome.org ... reverse_proxy localhost:PORT
    const handlerRegex = /@(\w+)\s+host\s+(\w+)\.sisihome\.org/g;

    // Build a map of handler name -> port by finding handle blocks with brace counting
    // to support nested braces like: reverse_proxy localhost:8823 { flush_interval -1 }
    const portMap = new Map<string, number>();
    const handleStartRegex = /handle\s+@(\w+)\s*\{/g;
    let startMatch: RegExpExecArray | null;
    while ((startMatch = handleStartRegex.exec(content)) !== null) {
      const handlerName = startMatch[1];
      let depth = 1;
      let i = handleStartRegex.lastIndex;
      const blockStart = i;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
      }
      const blockContent = content.slice(blockStart, i - 1);
      const proxyMatch = blockContent.match(/reverse_proxy\s+localhost:(\d+)/);
      if (proxyMatch) {
        portMap.set(handlerName, parseInt(proxyMatch[1], 10));
      }
    }

    // Now match host declarations and pair with ports
    let match: RegExpExecArray | null;
    while ((match = handlerRegex.exec(content)) !== null) {
      const handlerName = match[1];
      const subdomain = match[2];
      const port = portMap.get(handlerName);
      if (port !== undefined) {
        bindings.push({ subdomain, port });
      }
    }

    return bindings;
  }

  /**
   * Add a new domain binding (both HTTPS handler block and HTTP fallback block).
   */
  addBinding(subdomain: string, port: number): void {
    let content = fs.readFileSync(this.caddyfilePath, 'utf-8');

    // Check if binding already exists
    const existing = this.parseBindings();
    if (existing.some((b) => b.subdomain === subdomain)) {
      throw new Error(`Binding for "${subdomain}" already exists`);
    }

    // Insert HTTPS handler block before the final "handle {" fallback block
    const httpsBlock = `    @${subdomain} host ${subdomain}.sisihome.org\n    handle @${subdomain} {\n        reverse_proxy localhost:${port}\n    }\n\n`;

    // Find the last "handle {" (the fallback) inside the *.sisihome.org block
    const fallbackIndex = content.lastIndexOf('    handle {');
    if (fallbackIndex === -1) {
      throw new Error('Cannot find fallback handle block in Caddyfile');
    }

    content = content.slice(0, fallbackIndex) + httpsBlock + content.slice(fallbackIndex);

    // Append HTTP fallback block at the end
    const httpBlock = `\nhttp://${subdomain}.sisihome {\n    reverse_proxy localhost:${port}\n}\n`;
    content = content.trimEnd() + '\n' + httpBlock;

    fs.writeFileSync(this.caddyfilePath, content, 'utf-8');
  }

  /**
   * Remove a domain binding (both HTTPS handler block and HTTP fallback block).
   */
  removeBinding(subdomain: string): void {
    let content = fs.readFileSync(this.caddyfilePath, 'utf-8');

    // Remove HTTPS handler block: @name host name.sisihome.org + handle @name { ... }
    // Match the @declaration line and the handle block
    const httpsPattern = new RegExp(
      `\\s*@${subdomain}\\s+host\\s+${subdomain}\\.sisihome\\.org\\s*\\n\\s*handle\\s+@${subdomain}\\s*\\{[^}]*\\}\\s*\\n?`,
      's',
    );
    content = content.replace(httpsPattern, '\n');

    // Remove HTTP fallback block
    const httpPattern = new RegExp(
      `\\nhttp://${subdomain}\\.sisihome\\s*\\{[^}]*\\}\\s*`,
      's',
    );
    content = content.replace(httpPattern, '\n');

    fs.writeFileSync(this.caddyfilePath, content, 'utf-8');
  }

  /**
   * Update the port for an existing domain binding.
   */
  updateBinding(subdomain: string, port: number): void {
    let content = fs.readFileSync(this.caddyfilePath, 'utf-8');

    // Update HTTPS block
    const httpsProxyPattern = new RegExp(
      `(handle\\s+@${subdomain}\\s*\\{[^}]*reverse_proxy\\s+localhost:)\\d+`,
      's',
    );
    if (!httpsProxyPattern.test(content)) {
      throw new Error(`Binding for "${subdomain}" not found`);
    }
    content = content.replace(httpsProxyPattern, `$1${port}`);

    // Update HTTP fallback block
    const httpProxyPattern = new RegExp(
      `(http://${subdomain}\\.sisihome\\s*\\{[^}]*reverse_proxy\\s+localhost:)\\d+`,
      's',
    );
    content = content.replace(httpProxyPattern, `$1${port}`);

    fs.writeFileSync(this.caddyfilePath, content, 'utf-8');
  }

  /**
   * Restart the Caddy container via Docker API.
   */
  async restartCaddy(): Promise<void> {
    const docker = new Docker({ socketPath: '/var/run/docker.sock' });
    const container = docker.getContainer(this.caddyContainerName);
    await container.restart();
  }

  /**
   * Get the domain URL for a given port, or null if no binding exists.
   */
  getDomainForPort(port: number): string | null {
    const bindings = this.parseBindings();
    const binding = bindings.find((b) => b.port === port);
    return binding ? `${binding.subdomain}.sisihome.org` : null;
  }
}
