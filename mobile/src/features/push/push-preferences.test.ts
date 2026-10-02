import { setReceiving } from '@/features/push/push-preferences';

describe('setReceiving', () => {
  it('silencia sem duplicar e volta a receber', () => {
    expect(setReceiving([], 'venda', false)).toEqual(['venda']);
    expect(setReceiving(['venda'], 'venda', false)).toEqual(['venda']);
    expect(setReceiving(['venda', 'estoque'], 'venda', true)).toEqual(['estoque']);
  });
});
