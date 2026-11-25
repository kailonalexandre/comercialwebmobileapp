import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { findDuplicates, lookupCompany, lookupPostalCode, type DuplicateMatch } from '@/features/customers/customers-api';
import {
  digits, emptyInput, maskDocument, maskPhone, maskZip, toRequest, validateQuick, type PersonKind, type QuickCustomerInput, type QuickErrors,
} from '@/features/customers/quick-customer-model';
import { enqueueQuickCustomer, syncQuickCustomers } from '@/features/customers/quick-customer-queue';
import { useTargetDraft } from '@/features/presale/target-draft';
import { OFFLINE_EXPIRED } from '@/features/sales/sale-queue';
import { offlineAllowed } from '@/infrastructure/security/session-store';
import { Button } from '@/shared/components/button';
import { OrderFooter, OrderHeader } from '@/shared/components/order-ui';
import { Segmented } from '@/shared/components/segmented';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { makeStyles } from '@/shared/theme/theme-context';
import { layout, radius, spacing } from '@/shared/theme/tokens';

const KINDS: { key: PersonKind; label: string }[] = [
  { key: 'company', label: 'Pessoa jurídica' },
  { key: 'individual', label: 'Pessoa física' },
];

const REASON: Record<string, string> = { document: 'mesmo CPF/CNPJ', phone: 'mesmo telefone', email: 'mesmo e-mail' };

// O cadastro pela pré-venda pede documento e CEP. A lista de clientes ainda aceita o cadastro rápido.
export function NewCustomerScreen() {
  const styles = useStyles();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const target = useTargetDraft(mode);
  const inOrder = mode === 'presale' || mode === 'pdv' || mode === 'conditional';
  const fullForm = mode === 'presale';
  const [input, setInput] = useState<QuickCustomerInput>(() => ({ ...emptyInput(), personKind: 'company' }));
  const company = input.personKind === 'company';
  const scroller = useRef<ScrollView>(null);
  const addressTop = useRef(0);
  const [lookingUp, setLookingUp] = useState(false);
  const currentDocument = useRef('');
  const [errors, setErrors] = useState<QuickErrors>({});
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  const saving = useRef(false); // toque repetido em "Salvar" nunca cria dois cadastros

  const set = <K extends keyof QuickCustomerInput>(key: K, value: QuickCustomerInput[K]) => {
    if (key === 'document' || key === 'personKind') currentDocument.current = key === 'document' ? digits(String(value)) : '';
    setInput((prev) => ({ ...prev, [key]: value, ...(key === 'personKind' ? { document: '' } : {}) }));
    setErrors((prev) => ({ ...prev, [key]: undefined, ...(key === 'personKind' ? { document: undefined } : {}) }));
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

  const doc = digits(input.document);

  async function fillCompany() {
    if (doc.length !== 14) {
      setErrors((prev) => ({ ...prev, document: 'Informe o CNPJ com 14 dígitos.' }));
      return;
    }
    Keyboard.dismiss();
    setLookingUp(true);
    try {
      const c = await lookupCompany(doc);
      if (currentDocument.current !== doc) return;
      if (!c) {
        setErrors((prev) => ({ ...prev, document: 'Consulta indisponível. Você pode preencher os dados manualmente.' }));
        return;
      }
      setInput((p) => ({ ...p, name: p.name || c.name || '', tradeName: p.tradeName || c.trade_name || '', phone: p.phone || (c.phone ? maskPhone(c.phone) : ''), email: p.email || c.email || '' }));
      setErrors((prev) => ({ ...prev, document: undefined }));
      setMatches(null);
    } finally {
      setLookingUp(false);
    }
  }

  const save = async () => {
    if (saving.current) return;
    const found = validateQuick(input);
    if (fullForm && !doc) found.document = company ? 'Informe o CNPJ.' : 'Informe o CPF.';
    if (fullForm && zip.length !== 8) found.zip = 'Informe o CEP com 8 dígitos.';
    if ((toRequest(input).notes?.length ?? 0) > 4000) found.notes = 'Reduza a observação e tente novamente.';
    setErrors(found);
    if (Object.keys(found).length > 0) {
      Keyboard.dismiss();
      if (found.notes) scroller.current?.scrollToEnd();
      else if (found.zip && Object.keys(found).length === 1) scroller.current?.scrollTo({ y: addressTop.current });
      else scroller.current?.scrollTo({ y: 0 });
      return;
    }
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
    if (!offlineAllowed()) return Alert.alert('Sem conexão', OFFLINE_EXPIRED);
    const entry = await enqueueQuickCustomer(input);
    if (inOrder) {
      target.setDraft((d) => ({ ...d, customer: { id: 0, name: input.name.trim(), pendingId: entry.id } }));
      router.dismissTo(mode === 'pdv' ? '/pdv' : mode === 'conditional' ? '/novo-condicional' : '/nova-venda');
    } else {
      router.back();
    }
    void syncQuickCustomers();
  }

  const sameDocument = matches?.some((m) => m.reasons.includes('document')) ?? false;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <OrderHeader title="Novo cliente" onBack={() => router.back()} />
      <ScrollView ref={scroller} style={styles.grow} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        onContentSizeChange={() => { if (matches) scroller.current?.scrollToEnd(); }}>
        <Text color="textMuted">Campos com * são obrigatórios.</Text>
        <Segmented options={KINDS} selected={input.personKind} onSelect={(kind) => { if (input.personKind !== kind) set('personKind', kind); }} />
        <View style={styles.card}>
          <Text variant="heading">Dados</Text>
          <TextField label={`${company ? 'CNPJ' : 'CPF'}${fullForm ? ' *' : ''}`}
            placeholder={company ? '00.000.000/0000-00' : '000.000.000-00'}
            value={input.document} onChangeText={(v) => set('document', maskDocument(v, input.personKind))} error={errors.document} keyboardType="number-pad" />
          {company && <Button label="Preencher pelo CNPJ" icon="search-outline" variant="secondary" loading={lookingUp} onPress={() => void fillCompany()} />}
          <TextField label={company ? 'Razão social *' : 'Nome *'} value={input.name} onChangeText={(v) => set('name', v)} error={errors.name} autoCapitalize="words" maxLength={200} />
          {company && (
            <>
              <TextField label="Nome fantasia" value={input.tradeName} onChangeText={(v) => set('tradeName', v)} autoCapitalize="words" maxLength={200} />
              <TextField label="Inscrição estadual" value={input.stateRegistration ?? ''} onChangeText={(v) => set('stateRegistration', v)}
                placeholder="Opcional" autoCapitalize="characters" maxLength={32} />
            </>
          )}
          <TextField label="Telefone / WhatsApp *" value={input.phone} onChangeText={(v) => set('phone', maskPhone(v))} error={errors.phone} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="(00) 00000-0000" />
          <TextField label="Contato (com quem falar)" value={input.contactName} onChangeText={(v) => set('contactName', v)} autoCapitalize="words" maxLength={150} />
          <TextField label="E-mail" value={input.email} onChangeText={(v) => set('email', v)} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" maxLength={255} />
        </View>

        <View style={styles.card} onLayout={(e) => { addressTop.current = e.nativeEvent.layout.y; }}>
          <Text variant="heading">Endereço</Text>
          <TextField label={fullForm ? 'CEP *' : 'CEP'} placeholder="00000-000" value={input.zip} onChangeText={(v) => set('zip', maskZip(v))} error={errors.zip} keyboardType="number-pad" />
          <TextField label="Logradouro" value={input.street} onChangeText={(v) => set('street', v)} autoCapitalize="words" maxLength={200} />
          <View style={styles.pair}>
            <View style={styles.small}><TextField label="Número" value={input.number} onChangeText={(v) => set('number', v)} maxLength={200} /></View>
            <View style={styles.grow}><TextField label="Complemento" value={input.complement} onChangeText={(v) => set('complement', v)} maxLength={200} /></View>
          </View>
          <TextField label="Bairro" value={input.district} onChangeText={(v) => set('district', v)} autoCapitalize="words" maxLength={200} />
          <View style={styles.pair}>
            <View style={styles.grow}><TextField label="Cidade" value={input.city} onChangeText={(v) => set('city', v)} autoCapitalize="words" maxLength={200} /></View>
            <View style={styles.small}><TextField label="UF" value={input.state} onChangeText={(v) => set('state', v.slice(0, 2).toUpperCase())} autoCapitalize="characters" maxLength={2} /></View>
          </View>
        </View>
        <TextField label="Observações" value={input.notes} onChangeText={(v) => set('notes', v)} error={errors.notes} maxLength={4000} multiline />

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
              <Text variant="caption" color="textMuted">Esse CPF/CNPJ já está cadastrado. {fullForm ? 'Volte para escolher o cliente existente.' : 'Abra o cliente acima para verificar os dados.'}</Text>
            ) : (
              <Button label="Salvar mesmo assim" variant="outline" loading={busy} onPress={() => { saving.current = true; setBusy(true); void enqueueAndLeave().finally(() => { saving.current = false; setBusy(false); }); }} />
            )}
          </View>
        )}

      </ScrollView>
      <OrderFooter>
        <View style={styles.grow}>
          <Button label={inOrder ? 'Salvar e usar no pedido' : 'Salvar cliente'} icon="checkmark" loading={busy} disabled={lookingUp} onPress={() => void save()} />
        </View>
      </OrderFooter>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.page },
  content: { ...layout.content, padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  small: { width: 110 },
  grow: { flex: 1 },
  similar: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  match: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
}));
