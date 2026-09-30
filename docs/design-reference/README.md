# Referência visual — "Direção A" (Claude Design)

Renders do protótipo (artefato Claude Design) usados para o redesign do app. São referência, não fonte de verdade de dados.

| Arquivo | Tela |
|---|---|
| onb | Onboarding (roxo pleno, cartões flutuantes, "Continuar") |
| connect | Conectar ao ComercialWeb (passo a passo, Ler QR, colar link, aparelho) |
| home / home-dark | Início claro e escuro (saudação, cartão roxo de vendas com barras da semana, atalhos, "Precisa de atenção", últimas vendas) |
| sales | Vendas (título + "+ Pré-venda", busca, chips de status, lista agrupada por data) |
| sale | Detalhe da venda (total grande, cartão Cliente/Vendedor/Pagamento, itens, "Reimprimir" e "Enviar recibo") |
| pre | Nova pré-venda (busca/scan de produto, mais vendidos, carrinho, total e "Enviar" fixos no rodapé) |
| pdv | PDV (status do caixa, busca/scan, carrinho, "Cobrar") |
| orders / order | Pedidos (abas por canal) e detalhe (linha do tempo de status) |
| menu | Menu (cartão do usuário, busca, grade de módulos) |

## Tokens do protótipo

- Claro: bg `#f4f5f8`, card `#ffffff`, ink `#1c1f26`, muted `#6d7488`, line `#e6e9f0`, soft `#f0ebfe`, primary `#6a2de8`, ok `#1f8a4c` (soft `#e3f5ea`), warn `#b4561a` (soft `#fdf0e4`), bad `#c8354a` (soft `#fbe9ec`), chip `#eef0f4`.
- Escuro: bg `#0f1015`, card `#181a21`, ink `#eef0f6`, muted `#9aa1b3`, line `#272a35`, soft `#2a2144`, primary `#7c4dff`, ok `#4ade80` (soft `#142b1d`), warn `#f5a462` (soft `#35230f`), bad `#f07083` (soft `#3a1a21`), chip `#20232c`.
- Fontes: Inter Tight (texto e títulos), IBM Plex Mono (códigos, datas, números de venda).
- Tab bar: Início, Vendas, PDV (botão central roxo em destaque), Pedidos, Menu.

## Pontos do protótipo que dependem de dados/endpoints que a API ainda não tem

Barras de vendas da semana, ticket médio, "mais vendidos", status do caixa no PDV, "Marcar como separado" no pedido, "Reimprimir".
