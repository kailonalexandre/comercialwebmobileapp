// Mensagem para o usuário a partir do tipo de erro da API (`kind`). undefined = usar o texto padrão.
export function userMessage(error: unknown): string | undefined {
  const kind = (error as { kind?: string } | null)?.kind;
  if (kind === 'forbidden') return 'Você não tem permissão para ver isto.';
  if (kind === 'network' || kind === 'timeout') return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return undefined;
}
