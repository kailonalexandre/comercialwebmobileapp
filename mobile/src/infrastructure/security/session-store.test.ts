import {
  accountIdFor, forgetTokens, offlineAllowed,
  clearSession, createAccount, describeAccount, getAccessToken, getActiveAccountId, loadAccounts, lockSession, openAccount, removeAccount, replaceSession,
  setAccountBiometric,
} from '@/infrastructure/security/session-store';

// jest.mock é içado acima dos imports; mockStore só é lido dentro das funções, após a inicialização.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockN}` }));

const session = (t: string) => ({ accessToken: t, refreshToken: `r-${t}`, expiresAt: '2026-01-01T00:00:00.000Z' });

beforeEach(() => {
  mockStore.clear();
  lockSession();
});

test('cada pareamento é uma conta; abrir uma troca os tokens em uso', async () => {
  const a = await createAccount(session('a'));
  await describeAccount('Ana', 'Loja');
  const b = await createAccount(session('b'));
  await describeAccount('Bia', 'Loja');
  expect((await loadAccounts()).map((x) => x.userName)).toEqual(['Ana', 'Bia']);

  lockSession();
  expect(await getAccessToken()).toBeNull();
  expect(await openAccount(a)).toMatchObject({ accessToken: 'a' });
  expect(getActiveAccountId()).toBe(a);
  expect(await openAccount(b)).toMatchObject({ accessToken: 'b' });
});

test('refresh grava na conta aberta e em nenhuma outra', async () => {
  const a = await createAccount(session('a'));
  const b = await createAccount(session('b'));
  await openAccount(a);
  await replaceSession(session('a2'));
  expect(await openAccount(b)).toMatchObject({ accessToken: 'b' });
  expect(await openAccount(a)).toMatchObject({ accessToken: 'a2' });
  lockSession();
  await replaceSession(session('lixo')); // bloqueado: não grava
  expect(await openAccount(a)).toMatchObject({ accessToken: 'a2' });
});

test('sair remove só a conta aberta', async () => {
  const a = await createAccount(session('a'));
  await describeAccount('Ana', 'Loja');
  await createAccount(session('b'));
  await describeAccount('Bia', 'Loja');
  await openAccount(a);
  const left = await clearSession();
  expect(left.map((x) => x.userName)).toEqual(['Bia']);
  expect(await getAccessToken()).toBeNull();
  expect(mockStore.has(`cw.session.${a}`)).toBe(false);
});

test('mesmo usuário lendo outro QR substitui a conta e mantém a biometria', async () => {
  const a = await createAccount(session('a'));
  await describeAccount('Ana', 'Loja');
  await setAccountBiometric(a, true);
  await createAccount(session('novo'));
  const accounts = await describeAccount('Ana', 'Loja');
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({ userName: 'Ana', biometric: true });
});

test('sessão da versão anterior vira a primeira conta', async () => {
  mockStore.set('cw.session', JSON.stringify(session('velha')));
  const [account] = await loadAccounts();
  expect(mockStore.has('cw.session')).toBe(false);
  expect(await openAccount(account!.id)).toMatchObject({ accessToken: 'velha' });
});

test('conteúdo corrompido descarta a conta', async () => {
  const a = await createAccount(session('a'));
  mockStore.set(`cw.session.${a}`, '{"accessToken":1}');
  lockSession();
  expect(await openAccount(a)).toBeNull();
  expect(await loadAccounts()).toEqual([]);
});

test('removeAccount da conta aberta bloqueia', async () => {
  const a = await createAccount(session('a'));
  await removeAccount(a);
  expect(getActiveAccountId()).toBeNull();
});

test('login no aparelho vinculado reaproveita a conta do mesmo funcionário (fila e biometria continuam dele)', async () => {
  const id = accountIdFor(10, 7);
  const policy = { mode: 'personal' as const, idleLockSeconds: 300, offlineHours: 72, biometric: true };
  expect(await createAccount(session('a'), { id, userName: 'Ana', businessName: 'Loja', terminalId: 't1', userId: 7, policy })).toBe(id);
  await setAccountBiometric(id, true);
  lockSession();

  expect(await createAccount(session('b'), { id, userName: 'Ana', businessName: 'Loja', terminalId: 't1', userId: 7, policy })).toBe(id);
  const accounts = await loadAccounts();
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({ id, biometric: true, policy });
  expect(await getAccessToken()).toBe('b');
});

test('janela offline: vale só até offlineHours desde a última resposta do servidor', async () => {
  const policy = { mode: 'shared' as const, idleLockSeconds: 120, offlineHours: 12, biometric: false };
  const now = Date.parse('2026-10-15T12:00:00Z');
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  expect(offlineAllowed({ id: 'x', userName: '', businessName: '', biometric: false, policy, lastOnlineAt: at(11) }, now)).toBe(true);
  expect(offlineAllowed({ id: 'x', userName: '', businessName: '', biometric: false, policy, lastOnlineAt: at(13) }, now)).toBe(false);
  // Conta do QR antigo (sem política): comportamento anterior.
  expect(offlineAllowed({ id: 'x', userName: '', businessName: '', biometric: false }, now)).toBe(true);
});

test('troca de operador apaga os tokens mas mantém a conta reconhecível para a fila dela', async () => {
  const id = await createAccount(session('a'), { id: 'b10-u7', userName: 'Ana' });
  await forgetTokens(id);
  expect(await getAccessToken()).toBeNull();
  expect(mockStore.has(`cw.session.${id}`)).toBe(false);
  expect((await loadAccounts()).map((a) => a.id)).toEqual([id]);
});
