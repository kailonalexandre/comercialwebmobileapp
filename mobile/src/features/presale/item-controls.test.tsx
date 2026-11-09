import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { DiscountField } from '@/features/presale/discount-field';
import type { Discount } from '@/features/presale/draft-model';
import { ItemPrice } from '@/features/presale/item-price';
import { QuantityStepper } from '@/features/presale/quantity-stepper';
import { ThemeProvider } from '@/shared/theme/theme-context';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/shared/components/icon', () => ({ Icon: () => null }));

// O primeiro render da suíte carrega tema, fontes e componentes (2–10 s no CI): 5 s padrão do Jest não bastam.
jest.setTimeout(30_000);

const wrap = (node: ReactNode) => <ThemeProvider>{node}</ThemeProvider>;

function Stepper({ start = 1, focusSignal }: { start?: number; focusSignal?: number }) {
  const [q, setQ] = useState(start);
  return <QuantityStepper name="Camiseta" value={q} onChange={setQ} integer disabled={false} focusSignal={focusSignal} />;
}

test('+ e − mudam a quantidade; − não passa de 1', async () => {
  await render(wrap(<Stepper />));
  const field = screen.getByLabelText('Quantidade de Camiseta');
  expect(field.props.value).toBe('1');
  await fireEvent.press(screen.getByLabelText('Diminuir quantidade de Camiseta'));
  expect(field.props.value).toBe('1');
  await fireEvent.press(screen.getByLabelText('Aumentar quantidade de Camiseta'));
  await fireEvent.press(screen.getByLabelText('Aumentar quantidade de Camiseta'));
  expect(screen.getByLabelText('Quantidade de Camiseta').props.value).toBe('3');
  await fireEvent.press(screen.getByLabelText('Diminuir quantidade de Camiseta'));
  expect(screen.getByLabelText('Quantidade de Camiseta').props.value).toBe('2');
});

test('digitação manual vale; inválido volta ao último valor bom ao sair do campo', async () => {
  await render(wrap(<Stepper />));
  const field = screen.getByLabelText('Quantidade de Camiseta');
  await fireEvent.changeText(field, '9');
  await fireEvent.press(screen.getByLabelText('Aumentar quantidade de Camiseta'));
  expect(screen.getByLabelText('Quantidade de Camiseta').props.value).toBe('10');
  await fireEvent.changeText(field, '2,5'); // PDV: só inteiro
  await fireEvent(field, 'blur');
  expect(screen.getByLabelText('Quantidade de Camiseta').props.value).toBe('10');
});

test('produto lançado: o campo de quantidade ganha o foco com o texto selecionado, pronto para digitar', async () => {
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  const focus = jest.spyOn(TextInput.prototype, 'focus');
  jest.useFakeTimers();
  try {
    await render(wrap(<Stepper focusSignal={1} />));
    expect(screen.getByLabelText('Quantidade de Camiseta').props.selectTextOnFocus).toBe(true);
    expect(focus).not.toHaveBeenCalled(); // espera a transição da tela de busca
    await act(async () => jest.advanceTimersByTime(300));
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
    focus.mockRestore();
  }
});

function Discounted({ onChange }: { onChange: (d: Discount | undefined) => void }) {
  const [d, setD] = useState<Discount | undefined>({ kind: 'percent', percent: 10 });
  return (
    <DiscountField
      label="Desconto"
      value={d}
      disabled={false}
      grossCents={9_980}
      onChange={(next) => {
        setD(next);
        onChange(next);
      }}
    />
  );
}

test('botão % ↔ R$ mostra a unidade e converte o valor digitado', async () => {
  const onChange = jest.fn();
  await render(wrap(<Discounted onChange={onChange} />));
  expect(screen.getByText('%')).toBeTruthy();
  expect(screen.getByLabelText('Desconto (%)').props.value).toBe('10');

  await fireEvent.press(screen.getByLabelText(/Alternar para reais/));
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'value', cents: 998 });
  expect(screen.getByText('R$')).toBeTruthy();
  expect(screen.getByLabelText('Desconto (R$)').props.value).toBe('9,98');

  await fireEvent.press(screen.getByLabelText(/Alternar para percentual/));
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'percent', percent: 10 });
});

const camiseta = { productId: 1, name: 'Camiseta', unitPriceCents: 4_990, quantity: 1 };

test('sem pdv.change-price o preço é só leitura', async () => {
  await render(wrap(<ItemPrice item={camiseta} editable={false} onChange={jest.fn()} />));
  expect(screen.queryByLabelText('Alterar valor unitário de Camiseta')).toBeNull();
});

test('com pdv.change-price altera o valor unitário e mostra o da tabela', async () => {
  const onChange = jest.fn();
  const view = await render(wrap(<ItemPrice item={camiseta} editable onChange={onChange} />));
  await fireEvent.press(screen.getByLabelText('Alterar valor unitário de Camiseta'));
  const field = screen.getByLabelText('Valor unitário de Camiseta');
  expect(field.props.value).toBe('49,90');
  await fireEvent.changeText(field, '39,90');
  await fireEvent(field, 'submitEditing');
  expect(onChange).toHaveBeenLastCalledWith(3_990);

  await view.rerender(wrap(<ItemPrice item={{ ...camiseta, customPriceCents: 3_990 }} editable onChange={onChange} />));
  expect(screen.getByText(/tabela R\$\s49,90/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Voltar ao preço da tabela de Camiseta'));
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});
