-- Sessão aberta por login individual num aparelho vinculado (QR de vínculo do ComercialWeb, tabela mobile_terminals).
-- terminal_id = uuid do aparelho lá; mode = personal | shared (define validade, inatividade e troca de empresa).
-- Só expand: colunas anuláveis; sessões do QR antigo seguem com as duas nulas.
ALTER TABLE mobile_sessions
    ADD COLUMN terminal_id CHAR(36) NULL AFTER cw_device_id,
    ADD COLUMN mode VARCHAR(10) NULL AFTER terminal_id;
