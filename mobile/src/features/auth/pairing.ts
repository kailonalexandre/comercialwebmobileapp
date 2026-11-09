import { serverRefusal, type AppEnvironment } from '@/infrastructure/config';

// pair = QR antigo (sessão de quem gerou, só na transição); bind = vínculo do aparelho; invite = convite do funcionário.
export type LinkKind = 'pair' | 'bind' | 'invite';
export type PairingLink = { kind: LinkKind; code: string; server: string };
export type PairingResult = { ok: true; link: PairingLink } | { ok: false; message: string };

const CODE = /^[A-Za-z0-9]{60}$/;
const SCHEME = /^comercialweb:\/\/(pair|bind|invite)\?/;

const fail = (message: string): PairingResult => ({ ok: false, message });

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

/**
 * Valida `comercialweb://<pair|bind|invite>?code=<60>&server=<url>` conforme as regras do ambiente, sem tocar na rede.
 * O `server` só é validado (e normalizado, sem barra final): o app fala apenas com a API .NET; quem conversa com
 * o ComercialWeb é ela, no endereço configurado no servidor. Assim um QR forjado não redireciona nada (SSRF).
 */
export function parsePairingLink(raw: string, env: AppEnvironment): PairingResult {
  const text = raw.trim();
  const kind = SCHEME.exec(text)?.[1] as LinkKind | undefined;
  if (!kind) return fail('Este não é um QR Code do ComercialWeb.');

  const params = new Map<string, string>();
  for (const pair of text.slice(text.indexOf('?') + 1).split('&')) {
    const [key = '', value = ''] = pair.split('=');
    params.set(key, decode(value));
  }

  const code = params.get('code') ?? '';
  if (!CODE.test(code)) return fail('QR Code inválido. Gere um novo no ComercialWeb.');

  let url: URL;
  try {
    url = new URL(params.get('server') ?? '');
  } catch {
    return fail('QR Code inválido: endereço do servidor ausente ou incorreto.');
  }
  const refusal = serverRefusal(env, url);
  if (refusal) return fail(refusal);

  return { ok: true, link: { kind, code, server: url.origin + url.pathname.replace(/\/+$/, '') } };
}
