-- Sessão pareada por QR: guarda o aparelho e o par de tokens do ComercialWeb (cifrado pela API, Data Protection).
-- Só expand: colunas anuláveis; sessões antigas (sem vínculo) continuam válidas com a versão anterior.
ALTER TABLE mobile_sessions
    ADD COLUMN cw_device_id CHAR(36) NULL AFTER device_name,
    ADD COLUMN cw_tokens TEXT NULL AFTER cw_device_id;
