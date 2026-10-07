// Cadastro rápido: só nome e telefone são obrigatórios; sem CPF/CNPJ o cliente nasce "incompleto" e a web conclui.
export type PersonKind = 'individual' | 'company';

export type QuickCustomerInput = {
  personKind: PersonKind;
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  email: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  contactName: string;
  notes: string;
};

export const emptyInput = (): QuickCustomerInput => ({
  personKind: 'individual', name: '', tradeName: '', document: '', phone: '', email: '',
  zip: '', street: '', number: '', complement: '', district: '', city: '', state: '', contactName: '', notes: '',
});

export const digits = (s: string) => s.replace(/\D/g, '');

// Máscaras só de exibição; o que sai do aparelho vai sem formatação.
export function maskPhone(s: string): string {
  const d = digits(s).slice(0, 11);
  if (d.length <= 2) return d;
  const head = d.length > 10 ? 7 : 6;
  return d.length <= head ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, head)}-${d.slice(head)}`;
}

export function maskDocument(s: string, kind: PersonKind): string {
  const d = digits(s).slice(0, kind === 'company' ? 14 : 11);
  if (kind === 'company') return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export const maskZip = (s: string) => digits(s).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

export type QuickErrors = Partial<Record<'name' | 'phone' | 'document' | 'email', string>>;

// Validação só de formato (rápida e offline); CPF/CNPJ e unicidade são decididos pelo ComercialWeb.
export function validateQuick(i: QuickCustomerInput): QuickErrors {
  const errors: QuickErrors = {};
  if (i.name.trim().length < 2) errors.name = 'Informe o nome.';
  const phone = digits(i.phone).length;
  if (phone < 10 || phone > 11) errors.phone = 'Informe o telefone com DDD.';
  const doc = digits(i.document).length;
  if (doc > 0 && doc !== (i.personKind === 'company' ? 14 : 11)) errors.document = i.personKind === 'company' ? 'CNPJ tem 14 dígitos.' : 'CPF tem 11 dígitos.';
  if (i.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email.trim())) errors.email = 'E-mail inválido.';
  return errors;
}

export const isIncomplete = (i: QuickCustomerInput) => digits(i.document).length === 0;

const clean = (s: string) => (s.trim() === '' ? undefined : s.trim());

// Corpo da API. Telefone, documento e CEP vão só com dígitos.
// O ComercialWeb só aceita endereço completo (CEP, rua, número, bairro, cidade e UF). No cadastro rápido, endereço
// parcial não pode travar o salvamento: vai em texto nas observações e a web completa depois.
export function toRequest(i: QuickCustomerInput) {
  const address = {
    zip: clean(digits(i.zip)), street: clean(i.street), number: clean(i.number), complement: clean(i.complement),
    district: clean(i.district), city: clean(i.city), state: clean(i.state.toUpperCase()),
  };
  const filled = Object.values(address).some((v) => v !== undefined);
  const complete = !!(address.zip && address.street && address.number && address.district && address.city && address.state);
  const partial = [i.street, i.number, i.complement, i.district, i.city, i.state, i.zip].map((v) => v.trim()).filter(Boolean).join(', ');
  const notes = [clean(i.notes), filled && !complete ? `Endereço informado no app: ${partial}` : undefined].filter(Boolean).join('\n');
  return {
    personKind: i.personKind,
    name: i.name.trim(),
    tradeName: i.personKind === 'company' ? clean(i.tradeName) : undefined,
    document: clean(digits(i.document)),
    phone: digits(i.phone),
    email: clean(i.email),
    contactName: clean(i.contactName),
    notes: notes || undefined,
    address: complete ? address : undefined,
  };
}

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export const STATUS_LABEL: Record<SyncStatus, string> = {
  pending: 'Aguardando sincronização',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  error: 'Erro de sincronização',
};

export type QueueEntry = {
  id: string; // também é a Idempotency-Key: um toque a mais ou um reenvio nunca cria outro cliente
  input: QuickCustomerInput;
  status: SyncStatus;
  error?: string;
  serverId?: number;
  incomplete?: boolean;
  // Empresa ativa quando o cadastro foi feito: só sobe (e só aparece) nela.
  businessId?: number;
  createdAt: string;
};
