import { emptyInput, isIncomplete, maskDocument, maskPhone, toRequest, validateQuick } from '@/features/customers/quick-customer-model';

const ok = { ...emptyInput(), name: 'Loja do João', phone: '(11) 98888-7777' };

describe('validateQuick', () => {
  it('só nome e telefone são obrigatórios', () => {
    expect(validateQuick(ok)).toEqual({});
    expect(validateQuick({ ...ok, name: ' ' }).name).toBeDefined();
    expect(validateQuick({ ...ok, phone: '1198' }).phone).toBeDefined();
  });
  it('documento é opcional, mas se vier precisa ter o tamanho do tipo', () => {
    expect(validateQuick({ ...ok, document: '123' }).document).toBeDefined();
    expect(validateQuick({ ...ok, document: '123.456.789-09' }).document).toBeUndefined();
    expect(validateQuick({ ...ok, personKind: 'company', document: '123.456.789-09' }).document).toBeDefined();
    expect(validateQuick({ ...ok, email: 'x@y' }).email).toBeDefined();
  });
});

describe('request e máscaras', () => {
  it('manda só dígitos e omite o vazio', () => {
    const r = toRequest({ ...ok, document: '123.456.789-09', tradeName: 'Fantasia' });
    expect(r).toMatchObject({ phone: '11988887777', document: '12345678909', tradeName: undefined, address: undefined });
    const partial = toRequest({ ...ok, personKind: 'company', tradeName: ' Fantasia ', zip: '01310-100', city: 'São Paulo' });
    expect(partial.address).toBeUndefined(); // incompleto não vai como endereço...
    expect(partial.notes).toContain('São Paulo'); // ...mas nada se perde
    const full = toRequest({ ...ok, zip: '01310-100', street: 'Av. Paulista', number: '1', district: 'Bela Vista', city: 'São Paulo', state: 'sp' });
    expect(full.address).toMatchObject({ zip: '01310100', state: 'SP' });
    expect(full.notes).toBeUndefined();
  });
  it('incompleto = sem documento', () => {
    expect(isIncomplete(ok)).toBe(true);
    expect(isIncomplete({ ...ok, document: '12345678909' })).toBe(false);
  });
  it('máscaras', () => {
    expect(maskPhone('11988887777')).toBe('(11) 98888-7777');
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
    expect(maskDocument('12345678909', 'individual')).toBe('123.456.789-09');
    expect(maskDocument('11222333000181', 'company')).toBe('11.222.333/0001-81');
  });
});
