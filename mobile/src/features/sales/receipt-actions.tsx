import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { sendReceiptWhatsApp, shareReceiptPdf } from '@/features/sales/receipt-api';
import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { spacing } from '@/shared/theme/tokens';

type Notice = { tone: 'success' | 'danger' | 'textMuted'; text: string } | null;

// Comprovante da venda: envia pelo WhatsApp da empresa (template do ComercialWeb) ou compartilha o PDF por outro app.
export function ReceiptActions({ saleId }: { saleId: number }) {
  const { profile } = useSession();
  const [busy, setBusy] = useState<'whatsapp' | 'pdf' | null>(null);
  const [askPhone, setAskPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  async function whatsapp() {
    setBusy('whatsapp');
    setNotice(null);
    try {
      const result = await sendReceiptWhatsApp(saleId, askPhone ? phone.trim() : undefined);
      if (result.kind === 'queued') {
        setNotice({ tone: 'success', text: 'Comprovante enviado para a fila do WhatsApp.' });
        setAskPhone(false);
        setPhone('');
      } else if (result.kind === 'phone_needed') {
        setAskPhone(true);
        setNotice({ tone: 'danger', text: 'O cliente não tem telefone com WhatsApp. Informe um número para enviar.' });
      } else if (result.kind === 'not_connected') {
        setNotice({ tone: 'danger', text: 'A empresa não tem WhatsApp conectado. Conecte no ComercialWeb e tente de novo.' });
      } else {
        setNotice({ tone: 'danger', text: result.message });
      }
    } catch {
      setNotice({ tone: 'danger', text: 'Não foi possível enviar agora. Tente de novo em instantes.' });
    } finally {
      setBusy(null);
    }
  }

  async function pdf() {
    setBusy('pdf');
    setNotice(null);
    try {
      const shared = await shareReceiptPdf(saleId);
      if (!shared) setNotice({ tone: 'textMuted', text: 'Este aparelho não permite compartilhar arquivos.' });
    } catch {
      setNotice({ tone: 'danger', text: 'Não foi possível gerar o comprovante agora. Tente de novo em instantes.' });
    } finally {
      setBusy(null);
    }
  }

  // Mesmas permissões que a API aceita (sales.view, sales.access ou pdv.access; a lista do app traz as duas visíveis).
  const allowed = profile?.permissions.some((p) => p === 'sales.view' || p === 'pdv.access') ?? false;
  if (!allowed) return null;

  return (
    <View style={styles.box}>
      {askPhone && (
        <TextField
          label="WhatsApp do destinatário"
          icon="logo-whatsapp"
          placeholder="(11) 91234-5678"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={25}
        />
      )}
      <Button
        label="Enviar comprovante por WhatsApp"
        icon="logo-whatsapp"
        onPress={whatsapp}
        loading={busy === 'whatsapp'}
        disabled={busy !== null || (askPhone && phone.trim() === '')}
      />
      {!askPhone && (
        <Button label="Enviar para outro número" variant="outline" onPress={() => setAskPhone(true)} disabled={busy !== null} />
      )}
      <Button label="Compartilhar PDF" variant="outline" icon="share-outline" onPress={pdf} loading={busy === 'pdf'} disabled={busy !== null} />
      {notice && (
        <Text variant="caption" color={notice.tone} accessibilityLiveRegion="polite">
          {notice.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.md } });
