-- Troca de empresa sem sair da conta: a sessão passa a apontar para outra empresa (business_id), mas o aparelho pareado no
-- ComercialWeb continua sendo o da empresa do QR. paired_business_id guarda essa empresa original para a checagem de vínculo.
-- Só expand: coluna anulável (sessões antigas e API anterior seguem válidas; null = nunca trocou, vale business_id).
ALTER TABLE mobile_sessions
    ADD COLUMN paired_business_id BIGINT UNSIGNED NULL AFTER business_id;
