import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

// Digital ou Face ID, o que o aparelho tiver cadastrado. Sem sensor ou sem biometria cadastrada, o recurso não é oferecido.
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function biometricName(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    if (face && finger) return 'digital ou rosto';
    return face ? 'Face ID' : 'digital';
  } catch {
    return 'biometria';
  }
}

// Celular sem bloqueio de tela (nem PIN/padrão): não há como confirmar o dono localmente, então só a senha reabre a conta.
export async function deviceSecured(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return true;
  }
}

// O fallback para o PIN/padrão do próprio celular fica ligado (padrão do sistema): quem tem o dedo machucado ainda entra.
export async function confirmBiometric(reason: string): Promise<boolean> {
  try {
    return (await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancelar' })).success;
  } catch {
    return false;
  }
}

/** Pergunta se a conta deve entrar com a biometria do aparelho. Resolve true só se aceitou e confirmou na hora. */
export async function offerBiometric(userName: string): Promise<boolean> {
  if (!(await biometricAvailable())) return false;
  const name = await biometricName();
  const accepted = await new Promise<boolean>((resolve) =>
    Alert.alert(`Entrar com ${name}?`, `Da próxima vez, ${userName || 'esta conta'} será liberada com ${name} (ou o bloqueio de tela do celular), sem ler o QR Code de novo.`, [
      { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Ativar', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
  return accepted && (await confirmBiometric(`Confirme para ativar o acesso com ${name}`));
}

// Aparelho vinculado (pessoal): a biometria fica presa a um item do Keychain/Keystore gravado com requireAuthentication.
// O sistema invalida esse item quando as digitais/rosto do celular mudam: aí a leitura volta null e o desbloqueio local
// deixa de valer (só com a senha). Isso o authenticateAsync sozinho não detecta.
const keyFor = (accountId: string) => `cw.bio.${accountId}`;

/** Grava a marca protegida (o sistema pede a biometria agora). false = indisponível ou recusada. */
export async function enrollBiometricKey(accountId: string): Promise<boolean> {
  try {
    if (!SecureStore.canUseBiometricAuthentication()) return false;
    await SecureStore.setItemAsync(keyFor(accountId), '1', {
      requireAuthentication: true, authenticationPrompt: 'Confirme para ativar o desbloqueio biométrico',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch {
    return false;
  }
}

/** ok = biometria conferiu; cancelled = recusou/cancelou/sensor indisponível; invalidated = biometria do celular mudou. */
export async function verifyBiometricKey(accountId: string, prompt: string): Promise<'ok' | 'cancelled' | 'invalidated'> {
  try {
    const value = await SecureStore.getItemAsync(keyFor(accountId), {
      requireAuthentication: true, authenticationPrompt: prompt, keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return value === '1' ? 'ok' : 'invalidated';
  } catch {
    return 'cancelled';
  }
}

export const dropBiometricKey = (accountId: string) => SecureStore.deleteItemAsync(keyFor(accountId)).catch(() => undefined);

/** Só a pergunta (sem confirmar): no aparelho vinculado quem confirma é a gravação da marca protegida. */
export async function askBiometric(userName: string): Promise<boolean> {
  if (!(await biometricAvailable())) return false;
  const name = await biometricName();
  return new Promise<boolean>((resolve) =>
    Alert.alert(`Desbloquear com ${name}?`, `Neste celular, ${userName || 'você'} poderá desbloquear o app com ${name}. Se as digitais/rosto do celular mudarem, será pedida a senha.`, [
      { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Ativar', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
