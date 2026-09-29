import { parsePairingLink } from '@/features/auth/pairing';
import { createEnvironment } from '@/infrastructure/config';

const code = 'a'.repeat(60);
const local = createEnvironment('local', false, undefined);
const vps = createEnvironment('vps', false, 'app.exemplo.com.br');
const link = (server: string, c = code) => `comercialweb://pair?code=${c}&server=${encodeURIComponent(server)}`;

test('QR válido devolve código e servidor normalizado (sem barra final)', () => {
  expect(parsePairingLink(link('https://app.exemplo.com.br/'), vps)).toEqual({
    ok: true,
    link: { code, server: 'https://app.exemplo.com.br' },
  });
  expect(parsePairingLink(`  ${link('https://app.exemplo.com.br')}  `, vps)).toMatchObject({ ok: true });
});

test('rejeita scheme errado, código fora do padrão e servidor ausente ou ilegível', () => {
  expect(parsePairingLink(`https://pair?code=${code}`, vps)).toMatchObject({ ok: false });
  expect(parsePairingLink(link('https://app.exemplo.com.br', 'curto'), vps)).toMatchObject({ ok: false });
  expect(parsePairingLink(link('https://app.exemplo.com.br', `${code}!`), vps)).toMatchObject({ ok: false });
  expect(parsePairingLink(`comercialweb://pair?code=${code}`, vps)).toMatchObject({ ok: false });
  expect(parsePairingLink(`comercialweb://pair?code=${code}&server=nao-e-url`, vps)).toMatchObject({ ok: false });
});

test('vps recusa http e host fora da lista com mensagem clara', () => {
  expect(parsePairingLink(link('http://app.exemplo.com.br'), vps)).toEqual({
    ok: false,
    message: 'Este aplicativo só aceita servidores com HTTPS.',
  });
  expect(parsePairingLink(link('https://invasor.com'), vps)).toMatchObject({
    ok: false,
    message: expect.stringContaining('não autorizado') as string,
  });
});

test('local aceita http de LAN com porta e recusa http público', () => {
  expect(parsePairingLink(link('http://192.168.0.10:8080'), local)).toEqual({
    ok: true,
    link: { code, server: 'http://192.168.0.10:8080' },
  });
  expect(parsePairingLink(link('http://exemplo.com'), local)).toMatchObject({ ok: false });
});
