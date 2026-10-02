-- Domínios de notificação que o usuário silenciou no push (o sino do app continua listando tudo). Só expand: tabela nova.
CREATE TABLE IF NOT EXISTS mobile_push_mutes (
    user_id BIGINT UNSIGNED NOT NULL,
    domain VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
