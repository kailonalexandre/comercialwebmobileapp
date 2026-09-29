// Lógica pura do push: sem módulos nativos, testável em Jest.

// Mesmo formato que a API aceita (ExponentPushToken[...] / ExpoPushToken[...]).
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 && EXPO_TOKEN.test(value);
}

// Sem projectId do EAS (ainda não criado), aparelho virtual ou permissão negada: o recurso fica desligado.
export function canRegister(input: { projectId: string | undefined; isDevice: boolean; granted: boolean }): boolean {
  return Boolean(input.projectId) && input.isDevice && input.granted;
}
