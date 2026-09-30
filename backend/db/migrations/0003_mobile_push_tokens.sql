-- Token de push (Expo) por sessão do app. Só expand: tabela nova, nada existente muda.
-- last_notification_id = marca d'água do dispositivo: só notificações com id maior são enviadas.
CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    session_id CHAR(36) NOT NULL,
    token VARCHAR(255) NOT NULL,
    platform VARCHAR(16) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    last_notification_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id),
    UNIQUE KEY mobile_push_tokens_token_unique (token),
    CONSTRAINT mobile_push_tokens_session_id_foreign FOREIGN KEY (session_id) REFERENCES mobile_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
