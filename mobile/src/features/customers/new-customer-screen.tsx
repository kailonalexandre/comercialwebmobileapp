import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { findDuplicates, lookupCompany, lookupPostalCode, type DuplicateMatch } from '@/features/customers/customers-api';
import {
  digits, emptyInput, isIncomplete, maskDocument, maskPhone, maskZip, validateQuick, type PersonKind, type QuickCustomerInput, type QuickErrors,
} from '@/features/customers/quick-customer-model';
import { enqueueQuickCustomer, syncQuickCustomers } from '@/features/customers/quick-customer-queue';
import { DetailFrame } from '@/features/shell/detail-frame';
import { Button } from '@/shared/components/button';
import { Icon } from '@/shared/components/icon';
import { Segmented } from '@/shared/components/segmented';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { radius, spacing } from '@/shared/theme/tokens';

const noop = () => undefined;

const KINDS: { key: PersonKind; label: string }[] = [
  { key: 'individual', label: 'Pessoa física' },
  { key: 'company', label: 'Pessoa jurídica' },
];

const REASON: Record<string, string> = { document: 'mesmo CPF/CNPJ', phone: 'mesmo telefone', email: 'mesmo e-mail' };

// Cadastro rápido: nome e telefone bastam. O resto é opcional e o ComercialWeb conclui depois.
export function NewCustomerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [input, setInput] = useState<QuickCustomerInput>(emptyInput);
  const [errors, setErrors] = useState<QuickErrors>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  const saving = useRef(false); // toque repetido em "Salvar" nunca cria dois cadastros

  const set = <K extends keyof QuickCustomerInput>(key: K, value: QuickCustomerInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setMatches(null);
  };

  // CEP completo preenche o endereço (só campos ainda vazios).
  const zip = digits(input.zip);
  useEffect(() => {
    if (zip.length !== 8) return;
    let active = true;
    void lookupPostalCode(zip).then((a) => {
      if (!active || !a) return;
      setInput((p) => ({ ...p, street: p.street || a.street || '', district: p.district || a.district || '', city: p.city || a.city || '', state: p.state || a.state || '' }));
    });
    return () => {
      active = false;
    };
  }, [zip]);

  // CNPJ completo traz razão social, fantasia, telefone e e-mail (só campos ainda vazios).
  const doc = digits(input.document);
  useEffect(() => {
    if (input.personKind !== 'company' || doc.length !== 14) return;
    let active = true;
    void lookupCompany(doc).then((c) => {
      if (!active || !c) return;
      setInput((p) => ({ ...p, name: p.name || c.name || '', tradeName: p.tradeName || c.trade_name || '', phone: p.phone || (c.phone ? maskPhone(c.phone) : ''), email: p.email || c.email || '' }));
    });
    return () => {
      active = false;
    };
  }, [doc, input.personKind]);

  const save = async () => {
    if (saving.current) return;
    const found = validateQuick(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    saving.current = true;
    setBusy(true);
    try {
      const similar = await findDuplicates({ document: doc || undefined, phone: digits(input.phone), email: input.email.trim() || undefined });
      if (similar.length > 0) {
        setMatches(similar);
        return;
      }
      await enqueueAndLeave();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  async function enqueueAndLeave() {
    await enqueueQuickCustomer(input);
    void syncQuickCustomers(); // segue em segundo plano; a lista de Clientes mostra o andamento
    router.back();
  }

  const sameDocument = matches?.some((m) => m.reasons.includes('document')) ?? false;

  return (
    <DetailFrame title="Novo cliente" loading={false} failure={null} error={null} notFoundMessage="" onRetry={noop}>
      <Segmented options={KINDS} selected={input.personKind} onSelect={(k) => set('personKind', k)} />
      <TextField label={input.personKind === 'company' ? 'Razão social' : 'Nome'} value={input.name} onChangeText={(v) => set('name', v)} error={errors.name} autoCapitalize="words" autoFocus returnKeyType="next" />
      {input.personKind === 'company' && <TextField label="Nome fantasia" value={input.tradeName} onChangeText={(v) => set('tradeName', v)} autoCapitalize="words" />}
      <TextField label="Telefone / WhatsApp" value={input.phone} onChangeText={(v) => set('phone', maskPhone(v))} error={errors.phone} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="(00) 00000-0000" />
      <TextField label={input.personKind === 'company' ? 'CNPJ (opcional)' : 'CPF (opcional)'} value={input.document} onChangeText={(v) => set('document', maskDocument(v, input.personKind))} error={errors.document} keyboardType="number-pad" />
      <TextField label="E-mail (opcional)" value={input.email} onChangeText={(v) => set('email', v)} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
      {isIncomplete(input) && (
        <Text variant="caption" color="textMuted">
          Sem CPF/CNPJ o cliente é salvo como cadastro incompleto e você conclui depois pelo sistema.
        </Text>
      )}

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore((v) => !v)} style={styles.moreToggle}>
        <Text variant="label" color="primary">
          {more ? 'Menos detalhes' : 'Mais detalhes (endereço, contato, observações)'}
        </Text>
        <Icon name={more ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
      </Pressable>
      {more && (
        <View style={styles.more}>
          <TextField label="CEP" value={input.zip} onChangeText={(v) => set('zip', maskZip(v))} keyboardType="number-pad" />
          <TextField label="Endereço" value={input.street} onChangeText={(v) => set('street', v)} autoCapitalize="words" />
          <View style={styles.pair}>
            <View style={styles.small}><TextField label="Número" value={input.number} onChangeText={(v) => set('number', v)} /></View>
            <View style={styles.grow}><TextField label="Complemento" value={input.complement} onChangeText={(v) => set('complement', v)} /></View>
          </View>
          <TextField label="Bairro" value={input.district} onChangeText={(v) => set('district', v)} autoCapitalize="words" />
          <View style={styles.pair}>
            <View style={styles.grow}><TextField label="Cidade" value={input.city} onChangeText={(v) => set('city', v)} autoCapitalize="words" /></View>
            <View style={styles.small}><TextField label="UF" value={input.state} onChangeText={(v) => set('state', v.slice(0, 2).toUpperCase())} autoCapitalize="characters" maxLength={2} /></View>
          </View>
          <TextField label="Contato responsável" value={input.contactName} onChangeText={(v) => set('contactName', v)} autoCapitalize="words" />
          <TextField label="Observações" value={input.notes} onChangeText={(v) => set('notes', v)} multiline />
        </View>
      )}

      {matches && (
        <View style={styles.similar} accessibilityLiveRegion="polite">
          <Text variant="label">Encontramos um cliente parecido.</Text>
          {matches.map((m) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/cliente/[id]', params: { id: String(m.id) } })} style={styles.match}>
              <View style={styles.grow}>
                <Text variant="label" numberOfLines={1}>{m.name}</Text>
                <Text variant="caption" color="textMuted">{m.reasons.map((r) => REASON[r] ?? r).join(' · ')}</Text>
              </View>
              <Text variant="label" color="primary">Ver cliente</Text>
            </Pressable>
          ))}
          {sameDocument ? (
            <Text variant="caption" color="textMuted">Esse CPF/CNPJ já está cadastrado. Abra o cliente acima ou apague o documento para salvar como novo.</Text>
          ) : (
            <Button label="Salvar mesmo assim" variant="outline" loading={busy} onPress={() => { saving.current = true; setBusy(true); void enqueueAndLeave().finally(() => { saving.current = false; setBusy(false); }); }} />
          )}
        </View>
      )}

      <Button label="Salvar" icon="checkmark" loading={busy} onPress={() => void save()} />
    </DetailFrame>
  );
}

const useStyles = makeStyles((colors) => ({
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  more: { gap: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.md },
  small: { width: 110 },
  grow: { flex: 1 },
  similar: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  match: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
}));
