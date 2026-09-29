// Configuração por ambiente, fixada no build (EXPO_PUBLIC_* é embutido no bundle: nunca coloque segredo aqui).
// Todo o app consulta `appEnv`; nenhum outro lugar decide por nome de ambiente.

export type AppEnvironment = {
  name: 'local' | 'vps';
  allowHttp: boolean;
  // Só vps: hosts aceitos no QR. `*.dominio.com` cobre subdomínios (não o domínio puro).
  allowedHosts: string[];
  verboseLogs: boolean;
  allowManualPairing: boolean;
};

export function createEnvironment(name: string | undefined, isDev: boolean, hosts: string | undefined): AppEnvironment {
  // Sem valor válido: dev cai em local, qualquer outro build cai no padrão seguro (vps).
  const local = name === 'local' || (name !== 'vps' && isDev);
  return {
    name: local ? 'local' : 'vps',
    allowHttp: local,
    allowedHosts: local ? [] : (hosts ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    verboseLogs: local,
    allowManualPairing: local,
  };
}

const PRIVATE_HOST = /^(localhost|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;

function hostAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((rule) => (rule.startsWith('*.') ? host.endsWith(rule.slice(1)) : host === rule));
}

/** Mensagem de recusa (pt-BR) se o servidor do QR não é aceito neste ambiente; null se aceito. */
export function serverRefusal(env: AppEnvironment, url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:') {
    if (!env.allowHttp) return 'Este aplicativo só aceita servidores com HTTPS.';
    return PRIVATE_HOST.test(host) ? null : 'No ambiente local, HTTP só é aceito para endereços de rede privada.';
  }
  if (url.protocol !== 'https:') return 'Endereço de servidor inválido no QR Code.';
  if (!env.allowHttp && !hostAllowed(host, env.allowedHosts)) {
    return 'Este QR Code é de um servidor não autorizado para este aplicativo.';
  }
  return null;
}

export function resolveBaseUrl(raw: string | undefined, allowHttp: boolean): string | null {
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !allowHttp) {
    throw new Error(`${url.origin} deve usar HTTPS neste ambiente.`);
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}

export const appEnv = createEnvironment(
  process.env.EXPO_PUBLIC_APP_ENV,
  __DEV__,
  process.env.EXPO_PUBLIC_ALLOWED_SERVER_HOSTS,
);
export const apiBaseUrl = resolveBaseUrl(process.env.EXPO_PUBLIC_API_URL, appEnv.allowHttp);
// Páginas web do ComercialWeb (cadastro, recuperação de senha), abertas no navegador do sistema.
export const webBaseUrl = resolveBaseUrl(process.env.EXPO_PUBLIC_WEB_URL, appEnv.allowHttp);
