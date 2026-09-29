-- Expand: unidade de operação da sessão mobile (espelha user_preferences.current_location_id da web,
-- mas fica na sessão para o app não alterar a unidade escolhida no navegador).
-- Coluna nula: a versão anterior da API continua funcionando durante o blue-green.
ALTER TABLE mobile_sessions
    ADD COLUMN location_id BIGINT UNSIGNED NULL AFTER business_id,
    ADD CONSTRAINT mobile_sessions_location_id_foreign FOREIGN KEY (location_id) REFERENCES storage_locations (id) ON DELETE SET NULL;
