import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { api } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';

// O ComercialWeb gera o PDF e envia pelo WhatsApp da empresa com o template configurado lá; o app só pede.
export type WhatsAppResult =
  | { kind: 'queued' }
  | { kind: 'phone_needed' } // cliente sem telefone válido: peça um número e reenvie
  | { kind: 'not_connected' } // empresa sem WhatsApp conectado: conectar no ComercialWeb
  | { kind: 'failed'; message: string };

export async function sendReceiptWhatsApp(saleId: number, phone?: string): Promise<WhatsAppResult> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { kind: 'queued' };
  }
  try {
    await api.request(`/v1/sales/${saleId}/receipt/whatsapp`, { method: 'POST', body: phone ? { phone } : {} });
    return { kind: 'queued' };
  } catch (e) {
    if (e instanceof ApiError) {
      // 422 traz `reason` no corpo (ver client.readRefusal); só o que sabemos tratar vira ação.
      if (e.refusal?.reason === 'customer_phone_missing') return { kind: 'phone_needed' };
      if (e.refusal?.reason === 'connection_missing') return { kind: 'not_connected' };
      if (e.kind === 'validation') return { kind: 'failed', message: e.refusal?.code === 'validation' ? 'Número de WhatsApp inválido. Use o DDD e o número.' : (e.serverMessage ?? 'Não foi possível enviar o comprovante.') };
      if (e.kind === 'forbidden') return { kind: 'failed', message: 'Você não tem permissão para enviar este comprovante.' };
      if (e.kind === 'not_found') return { kind: 'failed', message: 'Venda não encontrada.' };
    }
    return { kind: 'failed', message: 'Não foi possível enviar agora. Tente de novo em instantes.' };
  }
}

// Melhor esforço: falha ao listar ou apagar não impede o novo compartilhamento.
function clearOldReceipts() {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && /comprovante-\d+\.pdf$/.test(item.uri)) item.delete();
    }
  } catch {
    // sem cache legível: segue
  }
}

/** Baixa o PDF do comprovante e abre a folha de compartilhar do sistema. Devolve false se o aparelho não compartilha. */
export async function shareReceiptPdf(saleId: number): Promise<boolean> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return false;
  }
  const bytes = await api.request<Uint8Array>(`/v1/sales/${saleId}/receipt/pdf`, { method: 'POST', body: {}, binary: true });
  // O comprovante tem dados do cliente. Não é apagado logo após abrir a folha de compartilhar (o app de destino ainda
  // pode estar lendo o arquivo): as cópias anteriores saem antes de gravar a nova, e a última some com o cache do sistema.
  clearOldReceipts();
  const file = new File(Paths.cache, `comprovante-${saleId}.pdf`);
  try {
    file.create({ overwrite: true });
    file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) {
      file.delete();
      return false;
    }
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Compartilhar comprovante', UTI: 'com.adobe.pdf' });
    return true;
  } catch (e) {
    try {
      file.delete(); // gravação parcial não fica no cache
    } catch {
      // nada a apagar
    }
    throw e;
  }
}
