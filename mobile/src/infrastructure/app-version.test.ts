import { isOutdated } from '@/infrastructure/app-version';

test('versão menor que a mínima é bloqueada, igual ou maior passa', () => {
  expect(isOutdated('0.9.9', '1.0.0')).toBe(true);
  expect(isOutdated('1.0.0', '1.0.0')).toBe(false);
  expect(isOutdated('1.0.1', '1.0.0')).toBe(false);
  expect(isOutdated('1.10.0', '1.9.0')).toBe(false);
  expect(isOutdated('1.9', '1.10.0')).toBe(true);
});

test('mínima ausente ou ilegível nunca bloqueia', () => {
  expect(isOutdated('0.1.0', undefined)).toBe(false);
  expect(isOutdated('0.1.0', null)).toBe(false);
  expect(isOutdated('0.1.0', 'abc')).toBe(false);
  expect(isOutdated('dev', '1.0.0')).toBe(false);
});
