import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PaymentSheet } from '@/features/pdv/payment-sheet';
import { createDraftStore, type DraftValue } from '@/features/presale/draft-context';
import { emptyDraft, type Draft } from '@/features/presale/draft-model';
import { ThemeProvider } from '@/shared/theme/theme-context';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'chave-1' }));
jest.mock('@/shared/components/icon', () => ({ Icon: () => null }));
jest.mock('@/features/auth/session-context', () => ({ useSession: () => ({ profile: { businessId: 1 } }) }));
const mockSubmit = jest.fn();
jest.mock('@/features/sales/sale-queue', () => ({ submitSale: (...args: unknown[]) => mockSubmit(...args) }));

const camiseta = { productId: 1, name: 'Camiseta', unitPriceCents: 5_000 };
const methods = [{ code: 'cash', name: 'Dinheiro' }, { code: 'pix_transfer', name: 'Pix' }];

function store(draft: Partial<Draft>, phase: DraftValue['phase'] = { name: 'editing' }): DraftValue & { setDraft: jest.Mock; send: jest.Mock } {
  return {
    draft: { ...emptyDraft, items: [{ ...camiseta, quantity: 2 }], ...draft }, phase,
    setDraft: jest.fn(), send: jest.fn(), reset: jest.fn(), load: jest.fn(), add: jest.fn(), lastAdded: null,
  };
}

const sheet = (s: DraftValue, onClose = jest.fn()) =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 760 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <PaymentSheet visible onClose={onClose} store={s} totalCents={10_000} offline={false} methods={methods} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

test('modal de cobrança: mostra o total, só confirma com o valor completo e fecha sem perder o recebido', async () => {
  const onClose = jest.fn();
  const s = store({ payments: [{ method: 'cash', label: 'Dinheiro', amountCents: 4_000 }] });
  await sheet(s, onClose);
  expect(screen.getByText('Recebimento')).toBeTruthy();
  expect(screen.getByText('Falta R$ 60,00'.replace(' ', ' '))).toBeTruthy();
  expect(screen.getByLabelText('Confirmar recebimento')).toBeDisabled();

  await fireEvent.press(screen.getByLabelText('Fechar'));
  expect(onClose).toHaveBeenCalled();
  // Fechar não mexe no rascunho: os valores recebidos continuam na venda.
  expect(s.setDraft).not.toHaveBeenCalled();
});

test('“Restante” completa na forma escolhida e libera a confirmação', async () => {
  const s = store({ payments: [] });
  await sheet(s);
  await fireEvent.press(screen.getByText('Pix'));
  await fireEvent.press(screen.getByLabelText(/^Restante/));
  const change = s.setDraft.mock.calls[0]![0] as (d: Draft) => Draft;
  expect(change(s.draft).payments).toEqual([{ method: 'pix_transfer', label: 'Pix', amountCents: 10_000 }]);
});

test('pago: confirmar envia; durante o envio não fecha nem envia de novo', async () => {
  const paid = store({ payments: [{ method: 'cash', label: 'Dinheiro', amountCents: 12_000 }] });
  await sheet(paid);
  expect(screen.getByText('Troco R$ 20,00'.replace(' ', ' '))).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Confirmar recebimento'));
  expect(paid.send).toHaveBeenCalledTimes(1);

  const onClose = jest.fn();
  await sheet(store(paid.draft, { name: 'sending' }), onClose);
  expect(screen.getAllByLabelText('Fechar').at(-1)).toBeDisabled();
});

test('dois toques em confirmar viram uma venda só', async () => {
  const { DraftProvider, useDraft } = createDraftStore('pdv');
  let resolve: (v: unknown) => void = () => undefined;
  mockSubmit.mockReturnValue(new Promise((r) => (resolve = r)));
  const wrapper = ({ children }: { children: ReactNode }) => <DraftProvider>{children}</DraftProvider>;
  const { result } = await renderHook(() => useDraft(), { wrapper });

  await act(async () => result.current.add(camiseta));
  expect(result.current.draft.items).toEqual([{ ...camiseta, quantity: 1 }]);
  expect(result.current.lastAdded).toEqual({ productId: 1, seq: 1 });

  await act(async () => {
    void result.current.send();
    void result.current.send();
  });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ kind: 'ok', sale: { saleId: 9, number: 'V9', status: 'finalizada', totalCents: 5_000, alreadyExisted: false } }));
  expect(result.current.phase.name).toBe('done');
});
