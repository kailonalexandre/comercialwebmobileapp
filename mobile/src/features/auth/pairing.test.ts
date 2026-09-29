import { parsePairingLink } from '@/features/auth/pairing';

const code = 'a'.repeat(60);

test('lê o código do QR e ignora o servidor', () => {
  expect(parsePairingLink(`comercialweb://pair?code=${code}&server=https%3A%2F%2Fcliente.exemplo.com.br`)).toEqual({ code });
  expect(parsePairingLink(`  comercialweb://pair?code=${code}  `)).toEqual({ code });
});

test('rejeita esquema e código inválidos', () => {
  expect(parsePairingLink(`https://pair?code=${code}`)).toBeNull();
  expect(parsePairingLink('comercialweb://pair?code=curto')).toBeNull();
  expect(parsePairingLink(`comercialweb://pair?code=${code}!`)).toBeNull();
  expect(parsePairingLink('comercialweb://pair?server=https://x.com')).toBeNull();
});
