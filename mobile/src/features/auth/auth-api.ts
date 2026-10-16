import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api } from '@/infrastructure/api';
import type { Session, SessionPolicy } from '@/infrastructure/security/session-store';
import { installationId, type Terminal } from '@/infrastructure/security/terminal-store';

const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android');
const appVersion = () => Constants.expoConfig?.version;

export type TerminalInfo = { id: string; name: string; mode: Terminal['mode']; businessId: number; businessName: string | null };
export type Operator = { id: number; name: string; hasPin: boolean };
// Senha (e-mail ou usuário), PIN (só aparelho compartilhado, escolhendo o operador) ou convite (primeiro acesso / recuperação).
export type LoginInput =
  | { method: 'password'; login: string; password: string }
  | { method: 'pin'; userId: number; pin: string }
  | { method: 'invite'; inviteCode: string; newPassword: string };
export type TerminalLogin = { session: Session; user: { id: number; name: string }; terminal: TerminalInfo; policy: SessionPolicy };

const demoTerminal: TerminalInfo = { id: '00000000-0000-4000-8000-000000000000', name: 'Aparelho de demonstração', mode: 'shared', businessId: 0, businessName: 'Empresa Demonstração' };

/** Troca o código do QR de vínculo pelo segredo deste aparelho. Nenhuma sessão nasce aqui. */
export async function bindTerminal(code: string, deviceName: string): Promise<Terminal> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { id: demoTerminal.id, secret: 's'.repeat(60), name: demoTerminal.name, mode: demoTerminal.mode, businessName: demoTerminal.businessName ?? '' };
  }
  const bound = await api.request<{ terminal: TerminalInfo; terminalSecret: string }>('/v1/terminal/bind', {
    method: 'POST', anonymous: true,
    body: { code, installationId: await installationId(), deviceName, platform: platform(), appVersion: appVersion() },
  });
  return { id: bound.terminal.id, secret: bound.terminalSecret, name: bound.terminal.name, mode: bound.terminal.mode, businessName: bound.terminal.businessName ?? '' };
}

/** O aparelho segue vinculado e quem pode entrar nele. Desvinculado: ApiError 403 com `refusal.code = terminal_revoked`. */
export async function fetchTerminalState(t: Terminal): Promise<{ terminal: TerminalInfo; operators: Operator[] }> {
  if (!api) return { terminal: demoTerminal, operators: [{ id: 1, name: 'Administrador', hasPin: true }] };
  return api.request('/v1/terminal/state', { method: 'POST', anonymous: true, body: { terminalId: t.id, terminalSecret: t.secret } });
}

/** Login individual. Recusa chega como ApiError com `refusal.code` (invalid_credentials, account_locked, terminal_revoked…). */
export async function terminalLogin(t: Terminal, input: LoginInput): Promise<TerminalLogin> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    const session = { accessToken: 'dev-mock-access', refreshToken: 'dev-mock-refresh', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    return { session, user: { id: 1, name: 'Administrador' }, terminal: demoTerminal, policy: { mode: t.mode, idleLockSeconds: t.mode === 'shared' ? 120 : 300, offlineHours: 12, biometric: t.mode === 'personal' } };
  }
  const r = await api.request<Session & Omit<TerminalLogin, 'session'>>('/v1/auth/terminal-login', {
    method: 'POST', anonymous: true,
    body: { terminalId: t.id, terminalSecret: t.secret, ...input, platform: platform(), appVersion: appVersion() },
  });
  return {
    session: { accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt, minAppVersion: r.minAppVersion },
    user: r.user, terminal: r.terminal, policy: r.policy,
  };
}

/** PIN do aparelho compartilhado (6 números). Exige a senha atual; recusa = ApiError 422 com `refusal.code`. */
export async function setPin(password: string, pin: string): Promise<void> {
  if (!api) return;
  await api.request('/v1/me/pin', { method: 'PUT', body: { password, pin } });
}

/** 6 números, sem repetição nem sequência (o servidor confere de novo). */
export function acceptablePin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin) || new Set(pin).size === 1) return false;
  return !'0123456789'.includes(pin) && !'9876543210'.includes(pin);
}

// Empresa ativa vem do servidor (sessão), nunca de um valor enviado pelo app.
export type Profile = { userName: string; businessId: number; businessName: string; permissions: string[] };

// Sugestão inicial do nome do aparelho na lista de dispositivos (modelo, não o nome pessoal); o usuário pode editar.
export const defaultDeviceName = Device.modelName ?? 'Aplicativo';

const devProfile: Profile = {
  userName: 'Administrador',
  businessId: 0,
  businessName: 'Empresa Demonstração',
  permissions: ['products.view', 'people.view', 'sales.view', 'sales.create', 'loja-virtual.access', 'marketplaces.view', 'pdv.access', 'pdv.discount'],
};

// Troca o código do QR (uso único, 2 min) pela sessão da API. O código não é guardado.
// A API valida o código no ComercialWeb; empresa e usuário vêm de lá, nunca do app.
export async function pair(code: string, deviceName: string): Promise<Session> {
  if (api) {
    return api.request<Session>('/v1/auth/pair', { method: 'POST', body: { code, deviceName, platform: Platform.OS === 'ios' ? 'ios' : 'android', appVersion: Constants.expoConfig?.version },
      anonymous: true,
    });
  }

  // Sem API configurada: sessão fictícia apenas em desenvolvimento, para validar telas.
  if (__DEV__) {
    return {
      accessToken: 'dev-mock-access',
      refreshToken: 'dev-mock-refresh',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }
  throw new Error('API não configurada.');
}

export async function fetchProfile(): Promise<Profile> {
  if (!api) return devProfile;
  const [me, granted] = await Promise.all([
    api.request<Omit<Profile, 'permissions'>>('/v1/me'),
    api.request<{ permissions: string[] }>('/v1/me/permissions'),
  ]);
  // Só decide o que mostrar; cada rota do servidor confere a permissão de novo.
  return { ...me, permissions: granted.permissions };
}

// reason só vai para a trilha do servidor: troca de operador e bloqueio por inatividade no aparelho compartilhado.
export async function logout(reason?: 'operator_switch' | 'idle'): Promise<void> {
  // Revogação server-side; falha de rede não impede limpar o aparelho.
  await api?.request('/v1/auth/logout', { method: 'POST', body: reason ? { reason } : undefined }).catch(() => undefined);
}

export type BusinessOption = { id: number; name: string };

// Empresas com vínculo ativo do usuário e a ativa na sessão.
export async function fetchBusinesses(): Promise<{ businesses: BusinessOption[]; currentBusinessId: number }> {
  if (!api) return { businesses: [{ id: 0, name: 'Empresa Demonstração' }, { id: 1, name: 'Filial Demonstração' }], currentBusinessId: 0 };
  return api.request('/v1/me/businesses');
}

export type SwitchedBusiness = { accessToken: string; expiresAt: string; businessId: number; businessName: string };

// A API confere o vínculo do usuário com a empresa e emite o access token dela; o app só escolhe entre as suas.
export async function switchBusinessRequest(businessId: number): Promise<SwitchedBusiness> {
  if (!api) return { accessToken: 'dev-mock-access', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), businessId, businessName: businessId === 0 ? 'Empresa Demonstração' : 'Filial Demonstração' };
  return api.request<SwitchedBusiness>('/v1/auth/switch-business', { method: 'POST', body: { businessId } });
}
