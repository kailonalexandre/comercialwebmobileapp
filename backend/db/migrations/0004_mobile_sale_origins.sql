-- Vendas criadas pelo próprio app (pré-venda e PDV). O disparador de push não avisa o celular de uma venda que
-- ele mesmo acabou de fazer (o aviso é para vendas feitas fora do app, no web). Só expand: tabela nova.
-- Sem FK para `sales` (tabela do ComercialWeb): a linha é só um marcador por empresa.
CREATE TABLE IF NOT EXISTS mobile_sale_origins (
    business_id BIGINT UNSIGNED NOT NULL,
    sale_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (business_id, sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
