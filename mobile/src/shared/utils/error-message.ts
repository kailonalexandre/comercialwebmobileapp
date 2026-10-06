// Mensagem para o usuário a partir do tipo de erro da API (`kind`). undefined = usar o texto padrão.
export function userMessage(error: unknown): string | undefined {
  const kind = (error as { kind?: string } | null)?.kind;
  if (kind === 'forbidden') return 'Você não tem permissão para ver isto.';
  // 409: a empresa ativa não é a do QR deste aparelho (saldo e pedidos da loja dependem do aparelho pareado) ou não tem unidade.
  if (kind === 'conflict') return 'Não disponível para a empresa ativa neste aparelho. Para ver esta informação, conecte o aparelho com o QR desta empresa.';
  if (kind === 'network' || kind === 'timeout') return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return undefined;
}
