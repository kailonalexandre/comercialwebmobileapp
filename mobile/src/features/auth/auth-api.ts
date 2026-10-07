import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api } from '@/infrastructure/api';
import type { Session } from '@/infrastructure/security/session-store';

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

export async function logout(): Promise<void> {
  // Revogação server-side; falha de rede não impede limpar o aparelho.
  await api?.request('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
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
