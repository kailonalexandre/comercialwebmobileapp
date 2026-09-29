import { useEffect, useState } from 'react';

import { fetchQuote, type Quote } from '@/features/pdv/pdv-api';
import { toRequest, type Draft } from '@/features/presale/draft-model';
import { ApiError } from '@/infrastructure/api/client';
import { userMessage } from '@/shared/utils/error-message';

const DEBOUNCE_MS = 400;

export type QuoteState = { status: 'idle' | 'loading' | 'ready' | 'error'; quote: Quote | null; error: string | null; registerClosed: boolean };

/**
 * Cotação do servidor para o carrinho atual: é dela o total que o operador vê e contra o qual o
 * recebimento é conferido. Refaz sozinha quando itens, quantidades ou cliente mudam.
 */
export function usePdvQuote(draft: Draft, enabled: boolean): QuoteState {
  const [state, setState] = useState<QuoteState>({ status: 'idle', quote: null, error: null, registerClosed: false });
  const request = draft.items.length > 0 ? JSON.stringify(toRequest(draft)) : null;

  useEffect(() => {
    if (!enabled || request === null) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchQuote(JSON.parse(request) as ReturnType<typeof toRequest>)
        .then((quote) => active && setState({ status: 'ready', quote, error: null, registerClosed: false }))
        .catch((e: unknown) => {
          if (!active) return;
          const refusal = e instanceof ApiError ? e.refusal : undefined;
          setState({
            status: 'error',
            quote: null,
            error: refusal?.message ?? userMessage(e) ?? 'Não foi possível calcular o total.',
            registerClosed: refusal?.code === 'cash_register_closed',
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [request, enabled]);

  // Sem itens não há o que cotar: o estado antigo não vale.
  return request === null ? { status: 'idle', quote: null, error: null, registerClosed: false } : state;
}
