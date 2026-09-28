-- Tabelas próprias da API mobile. O schema do ComercialWeb (Laravel) nunca é alterado aqui.
-- Regra blue-green: somente mudanças expand/contract compatíveis com a versão anterior.

CREATE TABLE IF NOT EXISTS mobile_sessions (
    id CHAR(36) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    business_id BIGINT UNSIGNED NOT NULL,
    device_name VARCHAR(100) NULL,
    created_at DATETIME(6) NOT NULL,
    last_used_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    revoked_at DATETIME(6) NULL,
    revoked_reason VARCHAR(40) NULL,
    PRIMARY KEY (id),
    KEY mobile_sessions_user_id_index (user_id),
    CONSTRAINT mobile_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT mobile_sessions_business_id_foreign FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens guardados só como SHA-256. used_at preenchido = token já rotacionado;
-- reapresentá-lo indica roubo e revoga a sessão inteira.
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
    token_hash BINARY(32) NOT NULL,
    session_id CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    PRIMARY KEY (token_hash),
    KEY mobile_refresh_tokens_session_id_index (session_id),
    CONSTRAINT mobile_refresh_tokens_session_id_foreign FOREIGN KEY (session_id) REFERENCES mobile_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
