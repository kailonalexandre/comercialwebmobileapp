import * as LocalAuthentication from 'expo-local-authentication';
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
