// Configuração por ambiente. EXPO_PUBLIC_* é embutido no bundle: nunca coloque segredo aqui.

export function resolveBaseUrl(raw: string | undefined, isDev: boolean): string | null {
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !isDev) {
    throw new Error(`${url.origin} deve usar HTTPS fora do desenvolvimento.`);
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}

export type AppEnvironment = 'local' | 'homologacao' | 'producao';

export function resolveEnvironment(raw: string | undefined, isDev: boolean): AppEnvironment {
  if (raw === 'local' || raw === 'homologacao' || raw === 'producao') return raw;
  return isDev ? 'local' : 'producao';
}

// EXPO_PUBLIC_ALLOW_HTTP=1 só em APK de teste em rede local (JS embutido, sem __DEV__). Build de produção nunca define.
const allowHttp = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_HTTP === '1';
export const apiBaseUrl = resolveBaseUrl(process.env.EXPO_PUBLIC_API_URL, allowHttp);
// Páginas web do ComercialWeb (cadastro, recuperação de senha), abertas no navegador do sistema.
export const webBaseUrl = resolveBaseUrl(process.env.EXPO_PUBLIC_WEB_URL, __DEV__);
export const appEnvironment = resolveEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
