import { readStored } from '@/features/auth/session-context';

const mockStore = new Map<string, string>();
const mockGet = jest.fn(async (k: string) => mockStore.get(k) ?? null);
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: (k: string) => mockGet(k),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

jest.mock('@/features/push/register-push', () => ({ unregisterPush: jest.fn() }));

beforeEach(() => mockStore.clear());

// Reabrir o app: conta e aparelho vinculado voltam do Keychain/Keystore, mesmo se a primeira leitura falhar.
test('abertura do app tenta de novo quando o Keychain/Keystore falha de forma transitória', async () => {
  mockStore.set('cw.accounts', JSON.stringify([{ id: 'b1-u7', userName: 'Ana', businessName: 'Loja', biometric: true, terminalId: 't1' }]));
  mockStore.set('cw.terminal', JSON.stringify({ id: 't1', secret: 's', name: 'Caixa', mode: 'personal', businessName: 'Loja' }));
  mockGet.mockRejectedValueOnce(new Error('keystore'));
  const waits: number[] = [];
  const [accounts, , terminal] = await readStored(3, async (ms) => void waits.push(ms));
  expect(accounts.map((a) => a.id)).toEqual(['b1-u7']);
  expect(terminal).toMatchObject({ id: 't1', mode: 'personal' });
  expect(waits).toEqual([400]);
});

test('falha persistente chega a quem abriu o app depois das tentativas', async () => {
  mockGet.mockRejectedValue(new Error('keystore'));
  await expect(readStored(2, async () => undefined)).rejects.toThrow('keystore');
  mockGet.mockReset();
  mockGet.mockImplementation(async (k: string) => mockStore.get(k) ?? null);
});
