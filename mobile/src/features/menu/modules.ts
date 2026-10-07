import type { Href } from 'expo-router';

import type { IconName } from '@/shared/components/icon';

// permissions: basta uma (mesma regra da web); só esconde o atalho, o servidor confere de novo.
export type ModuleLink = { title: string; description: string; icon: IconName; href: Href; permissions?: string[] };

// Módulos agrupam telas que já existem no app. Só entram módulos com tela real: Financeiro, Compras e Relatórios
// voltam ao menu quando o .NET expuser os endpoints correspondentes.
export const moduleLinks: Record<string, { title: string; links: ModuleLink[] }> = {
  comercial: {
    title: 'Comercial',
    links: [
      { title: 'Vendas', description: 'Consultar vendas e comprovantes', icon: 'receipt-outline', href: '/vendas' },
      { title: 'PDV', description: 'Vender e receber', icon: 'cart-outline', href: '/pdv' },
      { title: 'Nova pré-venda', description: 'Montar um pedido para fechar depois', icon: 'create-outline', href: '/nova-venda' },
      { title: 'Novo condicional', description: 'Montar a sacola e salvar, mesmo sem internet', icon: 'bag-add-outline', href: '/novo-condicional', permissions: ['sales.access'] },
      { title: 'Condicionais abertos', description: 'Vendas condicionais em andamento', icon: 'swap-horizontal-outline', href: { pathname: '/vendas', params: { status: 'condicional_aberto' } } },
    ],
  },
  cadastros: {
    title: 'Cadastros',
    links: [
      { title: 'Clientes', description: 'Buscar e consultar clientes', icon: 'people-outline', href: '/clientes' },
      { title: 'Novo cliente', description: 'Cadastro rápido, funciona sem conexão', icon: 'person-add-outline', href: '/cliente-novo' },
      { title: 'Produtos', description: 'Catálogo, preços e saldo', icon: 'pricetag-outline', href: '/produtos' },
    ],
  },
  estoque: {
    title: 'Estoque',
    links: [{ title: 'Produtos e saldo', description: 'Consultar saldo por produto', icon: 'cube-outline', href: '/produtos' }],
  },
};
