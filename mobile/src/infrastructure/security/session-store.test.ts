import { clearSession, getAccessToken, loadSession, saveSession } from '@/infrastructure/security/session-store';

// jest.mock é içado acima dos imports; mockStore só é lido dentro das funções, após a inicialização.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const session = { accessToken: 'a', refreshToken: 'r', expiresAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => mockStore.clear());

test('salva, carrega e limpa sessão', async () => {
  await saveSession(session);
  expect(await loadSession()).toEqual(session);
  expect(await getAccessToken()).toBe('a');
  await clearSession();
  expect(await getAccessToken()).toBeNull();
  expect(mockStore.size).toBe(0);
});

test('conteúdo corrompido é descartado', async () => {
  mockStore.set('cw.session', '{"accessToken":1}');
  expect(await loadSession()).toBeNull();
  expect(mockStore.size).toBe(0);
});

test('sem "lembrar de mim" a sessão não vai para o armazenamento', async () => {
  mockStore.set('cw.session', JSON.stringify(session));
  await saveSession(session, false);
  expect(await getAccessToken()).toBe('a');
  expect(mockStore.size).toBe(0);
});
