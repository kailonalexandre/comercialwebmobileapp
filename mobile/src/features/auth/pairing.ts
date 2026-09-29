export type PairingLink = { code: string };

const CODE = /^[A-Za-z0-9]{60}$/;
const PREFIX = 'comercialweb://pair?';

/**
 * Lê `comercialweb://pair?code=<60>&server=<host>` e devolve só o código.
 * O `server` do QR é ignorado de propósito: o app fala apenas com a API .NET; quem conversa com o
 * ComercialWeb é ela, no endereço configurado no servidor.
 */
export function parsePairingLink(raw: string): PairingLink | null {
  const text = raw.trim();
  if (!text.startsWith(PREFIX)) return null;
  for (const pair of text.slice(PREFIX.length).split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key === 'code') return CODE.test(value) ? { code: value } : null;
  }
  return null;
}
