# ComercialWeb Mobile — Instruções de início do projeto

> Documento de contexto e regras para o Claude Code.
> Leia este arquivo antes de implementar qualquer tarefa relevante.

## 1. Objetivo

Criar o aplicativo mobile oficial do **ComercialWeb**, com suporte a **Android e iOS**, conectado ao backend do ComercialWeb por APIs seguras.

A arquitetura oficial será **DDD + Clean Architecture + Modular Monolith no backend e Feature-Based Architecture no React Native**.

O aplicativo será desenvolvido principalmente em **Linux**. O desenvolvimento Android deve funcionar integralmente no Linux. Para compilar, assinar, testar e publicar a versão iOS, será usado posteriormente um **Mac com Xcode**.

O app NÃO deve duplicar desnecessariamente regras de negócio existentes no ComercialWeb. Sempre que possível:

**App Mobile → API autenticada → ComercialWeb → Banco/serviços/integrações**

Nunca:

**App Mobile → banco de dados diretamente**

---

## 2. Antes de começar: valide a stack

A intenção inicial é utilizar **.NET 11** no ecossistema/backend e **React** no aplicativo.

Antes de criar o projeto, verifique a documentação oficial e determine a opção adequada para mobile multiplataforma. Se React for mantido, prefira **React Native**, não React web puro.

Não assuma versões, bibliotecas ou compatibilidades. Confirme:
- suporte atual do .NET 11;
- versão estável/adequada do Node;
- React Native e ferramentas recomendadas;
- Android SDK/JDK necessários;
- estratégia de build iOS a partir do código desenvolvido no Linux.

Não faça upgrade ou downgrade arbitrário de componentes existentes do ComercialWeb.

---

## 3. Ambiente principal

Desenvolvimento diário:

- Linux
- Docker / Docker Compose quando útil para padronizar serviços, builds e dependências
- Git
- Node.js
- TypeScript
- React Native
- Android SDK
- JDK compatível
- .NET 11 para componentes/API em .NET, caso adotados
- Editor/IDE compatível
- Claude Code

Para iOS posteriormente:

- Mac Apple Silicon
- macOS suportado pelo Xcode necessário
- Xcode
- Apple Developer
- certificados/provisioning adequados

O código deve permanecer multiplataforma. Não introduza dependências Android-only sem necessidade e sem uma abstração correspondente para iOS.

### Docker

Docker pode e deve ser utilizado quando ajudar a tornar o ambiente reproduzível, principalmente para:

- MySQL;
- serviços auxiliares;
- backend/API;
- testes de integração;
- ferramentas de CI;
- builds que sejam compatíveis com containers.

Se houver diferença relevante entre máquinas de desenvolvimento, prefira fornecer `Dockerfile` e/ou `docker-compose.yml` em vez de depender de configuração manual extensa.

Entretanto, **não force Docker onde ele não é adequado**. Builds Android que dependam diretamente de emulador/dispositivo/SDK local podem continuar no host Linux quando isso for mais simples e confiável.

Docker **não substitui macOS/Xcode para build e assinatura de iOS**.

---

## 4. Claude Code: plugins, MCPs, skills e ferramentas

### ETAPA OBRIGATÓRIA ANTES DE INICIAR O DESENVOLVIMENTO

**Antes de criar arquivos do projeto, implementar telas, alterar backend ou escrever funcionalidades, configure o ambiente do Claude Code.**

A ordem inicial obrigatória é:

1. Verificar quais plugins, MCPs e skills estão disponíveis e são compatíveis com a versão instalada do Claude Code.
2. Localizar as ferramentas recomendadas neste documento ou equivalentes atuais e confiáveis.
3. Instalar as ferramentas selecionadas.
4. **Ativar/habilitar os plugins, MCPs e skills instalados.**
5. Confirmar que foram carregados corretamente e estão disponíveis na sessão.
6. Somente depois iniciar a criação/alteração do projeto.

Não considere um plugin configurado apenas porque ele foi instalado. **Confirme que está habilitado e funcional.**

Antes de instalar qualquer plugin, MCP, skill ou extensão:

1. Verifique se é realmente necessário.
2. Consulte documentação/repositório oficial.
3. Verifique manutenção recente, reputação e permissões.
4. Não instale ferramentas desconhecidas apenas porque foram sugeridas neste documento.
5. Nunca entregue secrets, `.env`, tokens, cookies, chaves SSH ou credenciais a plugins não confiáveis.

### Economia de tokens/contexto

Procure no ecossistema atual do Claude Code uma ferramenta confiável equivalente a **Caveman / context optimization**, caso exista e seja compatível com a versão atual.

Objetivos:
- reduzir leitura repetitiva de arquivos;
- resumir contexto grande;
- evitar enviar arquivos irrelevantes;
- manter instruções persistentes curtas;
- diminuir consumo de tokens sem prejudicar qualidade.

Não dependa de um plugin para isso. Adote também estas práticas:

- Use busca (`rg`, glob, busca semântica disponível) antes de abrir arquivos grandes.
- Leia somente trechos relevantes.
- Não carregue `node_modules`, builds, logs enormes ou lockfiles inteiros sem necessidade.
- Não releia arquivos que já estão suficientemente compreendidos.
- Para tarefas grandes, primeiro crie um plano curto.
- Depois da investigação, mantenha no contexto somente decisões e arquivos relevantes.
- Prefira alterações pequenas e verificáveis.
- Não gere documentação extensa sem necessidade.

### Frontend/UI

Procure skills/plugins/MCPs confiáveis especializados em:
- React Native;
- UI/UX mobile;
- acessibilidade;
- design systems;
- revisão visual;
- testes de interface.

Se estiver disponível no ambiente, utilize **Playwright** para interfaces web relacionadas ao ComercialWeb. Para o aplicativo nativo, escolha uma ferramenta de teste adequada ao React Native após verificar compatibilidade atual.

Ferramentas de frontend NÃO têm autorização para alterar regras de negócio apenas para facilitar a interface.

### Documentação

Quando houver dúvida sobre API ou comportamento de biblioteca, consulte documentação oficial/atual antes de implementar. Evite inventar APIs a partir da memória.

---

## 5. Direção visual

Usar como referência o conceito visual aprovado para o ComercialWeb Mobile:

- aparência moderna;
- predominância de branco;
- roxo/violeta como cor de identidade;
- gradientes discretos;
- cards suaves;
- bordas arredondadas;
- boa hierarquia tipográfica;
- ícones consistentes;
- visual profissional de ERP/SaaS;
- interface limpa;
- foco em operação rápida.

Evitar:
- excesso de gradientes;
- glassmorphism exagerado;
- sombras pesadas;
- telas visualmente carregadas;
- animações desnecessárias;
- fontes pequenas;
- botões com área de toque insuficiente;
- componentes inconsistentes entre telas.

Crie um **design system** desde o começo:
- cores;
- tipografia;
- espaçamento;
- radius;
- sombras;
- ícones;
- botões;
- inputs;
- cards;
- feedback de loading;
- empty states;
- erros;
- dialogs;
- bottom navigation.

Centralize tokens de design. Não espalhe valores arbitrários pelo projeto.

Suportar corretamente diferentes tamanhos de tela e considerar acessibilidade.

---

## 6. MVP

Não tente transportar todo o ERP para o celular inicialmente.

Primeira etapa:

1. Splash / onboarding
2. Login
3. Dashboard
4. Menu
5. Produtos
6. Clientes
7. Pedidos/Vendas
8. Notificações
9. Perfil/configurações básicas

Depois:
- estoque;
- financeiro;
- PDV mobile;
- leitura de código de barras;
- QR Code;
- push notifications;
- recursos de Loja Virtual/marketplaces;
- funcionalidades offline, somente se houver caso de uso definido.

Cada módulo novo deve reutilizar APIs e regras existentes sempre que possível.

---

# 7. SEGURANÇA — PRIORIDADE DO PROJETO

**Segurança é requisito arquitetural, não etapa final.**

Antes de implementar autenticação, armazenamento local, comunicação, upload, QR Code, deep links, notificações ou recursos sensíveis, faça uma análise breve das ameaças relevantes.

Use **OWASP MASVS / Mobile Application Security** como referência de segurança mobile e OWASP API Security para as APIs.

## 7.1 Princípio fundamental

O aplicativo deve ser tratado como um **cliente não confiável**.

Nunca considere seguro algo porque está dentro do APK/IPA.

Um atacante pode:
- desmontar o aplicativo;
- observar requests;
- modificar o cliente;
- executar em dispositivo comprometido;
- tentar reutilizar tokens;
- alterar parâmetros;
- chamar a API sem usar o aplicativo oficial.

Portanto, **toda autorização real ocorre no servidor**.

---

## 7.2 Secrets

É proibido colocar no código mobile:

- senha de banco;
- connection string;
- API secret;
- private key;
- credenciais administrativas;
- token mestre;
- credenciais de serviços internos;
- segredo que conceda privilégios apenas por conhecê-lo.

Considere qualquer valor embarcado no aplicativo potencialmente extraível.

Use `.env` apenas para configuração adequada ao ambiente, nunca como justificativa para embarcar um segredo que precisa permanecer secreto no cliente.

O `.gitignore` deve impedir commit acidental de secrets.

Antes de commits relevantes, verificar alterações em busca de credenciais.

Se um segredo for encontrado no histórico Git, **removê-lo do arquivo não é suficiente**: sinalize imediatamente a necessidade de rotação/revogação.

---

## 7.3 Autenticação

Projetar autenticação usando padrões consolidados.

Preferir:
- tokens de acesso de curta duração;
- mecanismo seguro de renovação;
- revogação/sessões;
- logout efetivo;
- expiração;
- proteção contra replay quando aplicável.

Não criar sistema criptográfico ou protocolo de autenticação proprietário.

Nunca armazenar senha do usuário em texto puro.

Nunca registrar:
- senha;
- access token completo;
- refresh token;
- Authorization header;
- secrets;
- dados sensíveis desnecessários.

---

## 7.4 Armazenamento no aparelho

Tokens/credenciais devem usar armazenamento seguro oferecido pelo sistema operacional:
- Android Keystore;
- iOS Keychain;
- abstração confiável equivalente no framework escolhido.

Evite AsyncStorage/plain preferences para secrets.

Dados sensíveis em cache devem ser minimizados.

Pergunte antes de implementar armazenamento offline de informações empresariais sensíveis.

Logout deve limpar material de autenticação e dados locais sensíveis associados à sessão.

---

## 7.5 API

Toda comunicação de produção deve utilizar **HTTPS/TLS**.

Nunca desabilite validação de certificado para “resolver” problemas.

Backend deve validar:
- autenticação;
- autorização;
- tenant/empresa;
- ownership;
- tipos;
- limites;
- IDs;
- paginação;
- filtros;
- payload;
- permissões da operação.

Nunca confiar em:
- `company_id`;
- `user_id`;
- preço;
- desconto;
- permissão;
- perfil;
- total;
- status;
- qualquer valor crítico

somente porque foi enviado pelo aplicativo.

Recalcule/valide no servidor tudo que tiver impacto financeiro, fiscal, de estoque ou de autorização.

---

## 7.6 Multi-tenant

O ComercialWeb atende empresas diferentes.

Isto é crítico.

Um usuário da Empresa A **jamais** pode acessar dados da Empresa B alterando:
- URL;
- ID;
- query string;
- JSON;
- header;
- cache;
- storage local.

Toda consulta deve aplicar o escopo do tenant no backend a partir da identidade autenticada.

Nunca use apenas um `company_id` fornecido pelo cliente como autorização.

Criar testes específicos para isolamento entre tenants.

---

## 7.7 Autorização

Interface escondida NÃO é autorização.

Exemplo:

O usuário sem permissão pode não enxergar “Excluir venda”, mas ainda assim pode tentar:

`DELETE /api/sales/123`

A API deve rejeitar a operação independentemente da interface.

Implementar autorização por recurso/ação conforme as permissões existentes no ComercialWeb.

---

## 7.8 Financeiro, estoque e vendas

Operações críticas precisam de atenção adicional.

Para:
- vendas;
- cancelamentos;
- estoque;
- recebimentos;
- pagamentos;
- descontos;
- alteração de preço;
- ações administrativas,

considere:
- autorização explícita;
- validação server-side;
- idempotência;
- concorrência;
- auditoria;
- rastreabilidade;
- prevenção de chamadas duplicadas.

Um double tap ou retry de rede não pode criar duas vendas/cobranças/movimentações.

Use identificadores de idempotência onde fizer sentido.

---

## 7.9 Logs e auditoria

Logs devem ajudar na investigação sem vazar informações.

Registrar quando apropriado:
- usuário;
- empresa;
- ação;
- recurso;
- resultado;
- timestamp;
- correlation/request ID.

Não registrar secrets.

Para ações críticas, manter trilha de auditoria server-side.

---

## 7.10 Erros

Não mostrar ao usuário:
- stack trace;
- SQL;
- caminhos internos;
- secrets;
- detalhes de infraestrutura.

UI:

`Não foi possível concluir a operação.`

Logs internos podem conter detalhes técnicos seguros e um correlation ID.

---

## 7.11 QR Code e deep links

QR Code deve ser considerado entrada não confiável.

Nunca coloque credenciais permanentes em QR Code.

Caso seja implementado login por QR:
- token temporário;
- uso único;
- expiração curta;
- vínculo com sessão/dispositivo quando apropriado;
- confirmação server-side;
- invalidação após utilização.

Validar rigorosamente deep links e universal/app links.

---

## 7.12 WebView

Evite WebView para funcionalidades que podem ser nativas.

Se necessária:
- limitar origens;
- impedir navegação arbitrária;
- evitar bridges JavaScript perigosas;
- não expor tokens desnecessariamente;
- revisar downloads/uploads;
- bloquear esquemas inesperados.

---

## 7.13 Dependências

Antes de adicionar biblioteca:

1. Pergunte se realmente é necessária.
2. Verifique manutenção.
3. Verifique origem.
4. Verifique vulnerabilidades conhecidas.
5. Prefira bibliotecas consolidadas.
6. Evite dependência para funções triviais.

Manter lockfiles versionados.

Ativar análise de dependências/vulnerabilidades no CI.

---


# 8. Banco de dados — MySQL

O banco de dados utilizado pelo backend/API do aplicativo deverá ser **MySQL**.

O aplicativo mobile **não deve se conectar diretamente ao MySQL**.

Arquitetura obrigatória:

```text
Android / iOS
      │
      │ HTTPS
      ▼
API autenticada
      │
      ▼
Services / regras de negócio
      │
      ▼
MySQL
```

Nunca:

```text
Android / iOS ──────► MySQL
```

Credenciais do MySQL jamais podem existir no APK/IPA.

Para desenvolvimento local, prefira executar o MySQL através de Docker Compose, com volume persistente e configuração por variáveis de ambiente.

Exemplo conceitual:

```yaml
services:
  mysql:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: comercialweb
      MYSQL_USER: comercialweb
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "127.0.0.1:3306:3306"

volumes:
  mysql_data:
```

O exemplo não deve ser copiado cegamente. Antes de implementá-lo, confira a versão do MySQL já utilizada pelo ComercialWeb e mantenha compatibilidade quando necessário.

Nunca versionar senhas reais. Forneça `.env.example` somente com nomes/valores fictícios.

O banco deve utilizar:
- migrations versionadas;
- índices adequados;
- foreign keys quando apropriadas;
- charset/collation adequados, preferencialmente `utf8mb4`;
- transações para operações críticas;
- constraints para reforçar integridade;
- backups no ambiente de produção.

Evite criar um segundo conjunto de dados independente apenas para o mobile. Se o aplicativo representa o mesmo ComercialWeb, ele deve consumir as mesmas regras e dados através da API, respeitando a arquitetura existente.

Se for necessário criar tabelas específicas do aplicativo — por exemplo dispositivos, push tokens ou sessões mobile — elas devem permanecer server-side no MySQL e seguir isolamento por tenant quando aplicável.


# Decisão arquitetural — DDD + Clean Architecture + Modular Monolith

O padrão arquitetural oficial do projeto será:

**DDD (Domain-Driven Design) + Clean Architecture + Modular Monolith + Feature-Based Architecture no aplicativo mobile.**

Não iniciar o projeto como microservices. Os limites entre domínios devem ser bem definidos para permitir extração futura somente se houver necessidade real.

## Princípios de DDD

Organize o backend por **domínio/capacidade de negócio**, e não por tabelas do banco ou apenas por tipo técnico.

Bounded Contexts/módulos iniciais sugeridos:

```text
Modules/
├── Identity/
├── Companies/
├── Customers/
├── Products/
├── Inventory/
├── Sales/
├── Orders/
├── Financial/
├── Marketplace/
└── Notifications/
```

A lista deve ser ajustada depois de analisar o ComercialWeb existente. Não crie módulos apenas porque estão listados aqui.

Dentro de um módulo, a separação conceitual será:

```text
Sales/
├── Domain/
│   ├── Entities/
│   ├── ValueObjects/
│   ├── Aggregates/
│   ├── Events/
│   ├── Services/
│   └── Repositories/
├── Application/
│   ├── Commands/
│   ├── Queries/
│   ├── DTOs/
│   └── UseCases/
└── Infrastructure/
    ├── Persistence/
    ├── Repositories/
    └── Integrations/
```

Não criar pastas vazias ou abstrações artificiais apenas para seguir o desenho. Crie os elementos conforme o domínio exigir.

### Domain

O Domain contém as regras de negócio centrais.

O Domain:
- não conhece React Native;
- não conhece HTTP;
- não conhece controllers;
- não conhece MySQL;
- não conhece Docker;
- não conhece detalhes de framework de persistência;
- não depende de Infrastructure.

Regras críticas devem viver no domínio ou nos casos de uso apropriados, e não espalhadas por controllers.

### Entities

Use Entity quando a identidade do objeto for relevante ao longo do tempo.

### Value Objects

Use Value Objects quando o conceito for definido principalmente pelo valor e puder encapsular invariantes.

Exemplos possíveis, somente quando fizerem sentido:

```text
Money
Quantity
DocumentNumber
Email
Sku
```

Não transforme todo campo primitivo em Value Object sem benefício real.

### Aggregates e Aggregate Roots

Defina Aggregate Roots em torno de invariantes e limites transacionais reais.

Não carregue grafos enormes de entidades apenas para respeitar um modelo teórico.

Alterações internas de um Aggregate devem ocorrer através de sua raiz quando isso representar corretamente a regra de negócio.

### Domain Events

Utilize Domain Events para representar acontecimentos relevantes do domínio quando houver consumidores reais.

Exemplos conceituais:

```text
SaleCreated
SaleCancelled
StockChanged
OrderPaid
```

Não implemente Event Bus distribuído apenas porque existem Domain Events.

### Repositories

Repositories devem representar acesso a Aggregate Roots quando fizer sentido.

Interfaces pertencem à camada que define a necessidade; implementação concreta de MySQL/persistência pertence à Infrastructure.

Evite Generic Repository universal se ele apenas esconder a ORM sem agregar semântica de domínio.

### Application

Application orquestra casos de uso.

Responsabilidades típicas:
- Commands;
- Queries;
- DTOs;
- autorização contextual;
- transações/casos de uso;
- coordenação entre domínio e infraestrutura.

Controllers devem permanecer finos.

Fluxo:

```text
Controller/API
      ↓
Application / Use Case
      ↓
Domain
      ↓
Repository abstraction
      ↓
Infrastructure
      ↓
MySQL
```

### CQRS

Pode utilizar separação entre Commands e Queries quando melhorar clareza.

Não é obrigatório criar infraestrutura complexa de CQRS para CRUD simples.

### Infrastructure

Infrastructure contém detalhes externos:
- MySQL;
- ORM/driver;
- cache;
- filas;
- filesystem;
- APIs externas;
- Mercado Livre e outros marketplaces;
- push notifications;
- e-mail;
- observabilidade.

O Domain não deve depender dela.

## Modular Monolith

O backend deve começar como **Modular Monolith**.

Cada módulo deve possuir limites claros. Evite acesso arbitrário de um módulo às tabelas internas de outro módulo.

Integrações entre módulos devem ocorrer por contratos/casos de uso bem definidos.

Não criar microservices sem uma necessidade operacional concreta.

## Arquitetura do aplicativo React Native

No frontend mobile, utilizar **Feature-Based Architecture** em vez de tentar reproduzir todas as abstrações de DDD do servidor.

Estrutura inicial sugerida:

```text
src/
├── app/
│   ├── navigation/
│   ├── providers/
│   └── config/
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── products/
│   ├── customers/
│   ├── sales/
│   ├── inventory/
│   └── notifications/
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── theme/
│   ├── utils/
│   └── types/
└── infrastructure/
    ├── api/
    ├── storage/
    ├── security/
    └── notifications/
```

Uma feature deve manter próximos os componentes, hooks, serviços e tipos que pertencem exclusivamente a ela.

Somente código realmente reutilizável deve ir para `shared`.

Evite uma pasta global `components` com centenas de componentes sem relação clara.

## Regra de dependências

As dependências devem apontar para dentro:

```text
Presentation/API ──► Application ──► Domain
Infrastructure ────────────────────► Domain/Application contracts
```

O Domain nunca deve depender das camadas externas.

## DDD pragmático

DDD será utilizado para tornar regras complexas explícitas, e não para aumentar artificialmente o número de arquivos.

Não adicionar automaticamente:
- MediatR;
- Unit of Work customizado;
- Specification Pattern;
- Generic Repository;
- Event Bus;
- message broker;
- microservices;
- factories para tudo.

Cada padrão ou biblioteca precisa resolver um problema concreto.


# 9. Arquitetura sugerida

Separar responsabilidades.

Exemplo conceitual:

```text
src/
├── app/
├── components/
│   ├── ui/
│   └── common/
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── products/
│   ├── customers/
│   ├── sales/
│   └── notifications/
├── navigation/
├── services/
│   ├── api/
│   ├── auth/
│   └── storage/
├── hooks/
├── store/
├── theme/
├── types/
├── utils/
└── security/
```

Evite um diretório global gigante de componentes.

Organize regras específicas por feature e mantenha infraestrutura compartilhada isolada.

---


# Consulta ao código-fonte existente do ComercialWeb

O código do **ComercialWeb existente é a principal referência funcional e técnica** para integração do aplicativo.

O Claude está autorizado a **consultar livremente, em modo de leitura, a pasta local do ComercialWeb no computador do desenvolvedor** sempre que houver dúvida sobre:

- regras de negócio;
- models;
- banco e migrations;
- relacionamentos;
- autenticação;
- autorização;
- permissões;
- multi-tenant;
- services;
- controllers;
- endpoints;
- rotas;
- DTOs;
- validações;
- estoque;
- vendas;
- pedidos;
- clientes;
- produtos;
- financeiro;
- marketplaces;
- notificações;
- comportamento existente do sistema.

Antes de perguntar ao desenvolvedor como determinada regra funciona, procure primeiro no código existente quando a resposta puder ser obtida com segurança por inspeção.

## Descoberta da pasta

No início da configuração, identifique a localização da pasta/repositório local do ComercialWeb.

Se o caminho não puder ser determinado de forma inequívoca, **pergunte uma única vez ao desenvolvedor qual é o caminho absoluto da pasta do ComercialWeb** e registre esse caminho apenas na configuração/documentação local apropriada, sem criar dependência de um caminho específico no código do aplicativo.

Não invente um caminho.

## Permissões sobre o ComercialWeb existente

Por padrão, considere o repositório/pasta existente do ComercialWeb como:

**READ-ONLY para tarefas do aplicativo mobile.**

Pode:
- pesquisar;
- usar `rg`/grep;
- listar arquivos;
- abrir arquivos;
- analisar código;
- analisar migrations/schema;
- consultar histórico Git quando útil;
- comparar implementações;
- identificar contratos e regras reutilizáveis.

Não pode, sem solicitação explícita:
- editar arquivos do ComercialWeb;
- executar migrations destrutivas;
- resetar banco;
- alterar branches;
- fazer commit;
- fazer push;
- modificar configuração de produção.

Se uma mudança no ComercialWeb for necessária para suportar o aplicativo, primeiro descreva:
1. por que é necessária;
2. quais arquivos/componentes seriam afetados;
3. impacto na Web/API;
4. impacto no banco;
5. impacto de segurança;
6. compatibilidade com versões existentes.

Depois implemente somente quando a tarefa/autorização incluir essa alteração.

## Reutilização de regras

Não copie cegamente regras existentes para o aplicativo.

Ao encontrar uma regra no ComercialWeb, determine se ela deve permanecer server-side e ser exposta/reutilizada através de um caso de uso/API.

Prefira:

```text
ComercialWeb Web ─────┐
                      ├── Application / Domain
Mobile API ───────────┘
```

em vez de:

```text
ComercialWeb Web → regra A

Mobile App → cópia independente da regra A
```

O mobile não deve se tornar uma segunda implementação do ERP.

## Economia de tokens durante a consulta

A autorização de leitura da pasta não significa carregar o repositório inteiro no contexto.

Use:
1. árvore/listagem curta;
2. busca por nomes/símbolos;
3. `rg`/grep;
4. leitura de arquivos específicos;
5. leitura apenas dos trechos relevantes.

Ignore, salvo necessidade:
- `node_modules`;
- `vendor`;
- builds;
- caches;
- logs grandes;
- artefatos compilados;
- arquivos binários.

Quando já houver evidência suficiente, pare de explorar e implemente.

## Segurança da consulta

Nunca copie para o novo repositório valores encontrados em:
- `.env`;
- arquivos de secrets;
- certificados;
- tokens;
- senhas;
- connection strings reais;
- chaves privadas.

Se encontrar credenciais expostas no código existente, não as reproduza em logs, respostas ou commits. Apenas sinalize o arquivo/localização de forma segura e recomende rotação quando aplicável.


# 10. Integração com ComercialWeb

Antes de criar endpoints novos:

1. Investigue o ComercialWeb existente.
2. Identifique services/use cases já existentes.
3. Identifique autorização existente.
4. Verifique se a operação já possui endpoint adequado.
5. Reutilize regras de negócio.
6. Crie endpoint mobile específico somente quando houver justificativa.

Evite:

```text
MobileService
  └── cópia da regra de venda existente
```

Prefira:

```text
Web Controller ──────┐
                     ├── SaleService / Use Case
Mobile API ──────────┘
```

Assim web e mobile executam a mesma regra.

---

# 11. Estado e rede

A camada HTTP deve ser centralizada.

Implementar consistentemente:
- base URL por ambiente;
- autenticação;
- timeout;
- cancelamento;
- tratamento de 401/403;
- retry somente onde for seguro;
- refresh de sessão;
- erros tipados;
- correlation ID quando suportado.

Nunca faça retry automático indiscriminado em POST de operações financeiras ou de estoque.

Utilize idempotência para operações que possam ser repetidas com segurança.

Diferencie claramente:
- loading inicial;
- atualização;
- vazio;
- offline;
- erro;
- sessão expirada;
- sem permissão.

---

# 12. Qualidade

TypeScript deve utilizar configuração estrita sempre que possível.

Evitar:
- `any` desnecessário;
- componentes gigantes;
- lógica de API diretamente na UI;
- URLs hardcoded;
- duplicação de tipos;
- `console.log` esquecido;
- `catch` silencioso;
- warnings ignorados.

Antes de considerar uma tarefa concluída:

1. build;
2. lint;
3. typecheck;
4. testes relevantes;
5. revisão de segurança;
6. revisão visual quando houver UI.

Não “corrija” testes removendo assertions ou desabilitando verificações.

---

# 13. Testes

Prioridades:

**Unitários**
- validações;
- formatadores;
- hooks;
- regras locais.

**Integração**
- API client;
- autenticação;
- refresh;
- armazenamento;
- estado.

**E2E**
- login;
- logout;
- dashboard;
- consulta;
- criação de operações importantes.

Adicionar testes de segurança/backend para:
- acesso entre tenants;
- IDOR/BOLA;
- usuário sem permissão;
- token expirado;
- payload adulterado;
- IDs inexistentes;
- requisição duplicada;
- paginação abusiva.

---

# 14. CI/CD

Desde cedo, preparar pipeline para:

```text
install
  ↓
lint
  ↓
typecheck
  ↓
tests
  ↓
security/dependency scan
  ↓
build
```

Android pode ser construído no ambiente Linux apropriado.

O pipeline iOS deverá usar posteriormente um runner macOS/Mac configurado para assinatura.

Nunca imprimir secrets do CI nos logs.

Produção deve usar secrets fornecidos pelo ambiente/secret store do CI.

---



## Estratégia de branches, CI/CD e Blue-Green

O projeto deve configurar **CI/CD desde o início**.

### Branches oficiais

Utilizar duas branches permanentes:

- `main` → **produção**
- `dev` → **homologação / desenvolvimento**

Fluxo padrão:

```text
feature/*
fix/*
chore/*
   │
   ▼
  dev
   │
   │ validação em homologação
   ▼
 main
   │
   ▼
produção
```

Novas funcionalidades e correções devem normalmente nascer a partir de `dev`:

```bash
git checkout dev
git pull
git checkout -b feature/nome-da-feature
```

Após revisão e validação, integrar em `dev`.

A promoção para produção deve ocorrer por Pull Request:

```text
dev → main
```

Evitar commits diretos em `main`.

Configure proteção da `main` no GitHub quando as permissões do repositório permitirem, exigindo CI aprovado antes do merge. A `dev` também deve ter proteção adequada conforme o projeto amadurecer.

### Ambientes

Manter configurações separadas:

```text
DEV LOCAL
   ↓
HOMOLOGAÇÃO
branch: dev
   ↓
PRODUÇÃO
branch: main
```

Nunca compartilhar secrets de produção com homologação.

Banco, API, tokens, endpoints, serviços externos e credenciais devem ser separados por ambiente sempre que aplicável.

O aplicativo deve suportar configuração de ambiente sem hardcode de URLs ou credenciais.

### GitHub Actions

Configurar workflows no diretório:

```text
.github/workflows/
```

Separar responsabilidades quando fizer sentido:

```text
ci.yml
deploy-homolog.yml
deploy-production.yml
```

O CI deve executar em Pull Requests e pushes relevantes:

```text
checkout
   ↓
install/cache
   ↓
lint
   ↓
typecheck
   ↓
tests
   ↓
security/dependency scan
   ↓
build
```

Falha em lint, typecheck, testes, security checks críticos ou build deve impedir promoção automática.

### Homologação — `dev`

Push/merge em `dev` deve:

1. executar CI completo;
2. gerar o build de homologação aplicável;
3. publicar/deployar serviços backend de homologação quando existirem;
4. executar migrations de maneira controlada;
5. executar smoke tests;
6. marcar claramente o ambiente como homologação.

Nunca apontar automaticamente uma build de `dev` para serviços ou banco de produção.

### Produção — `main`

Merge/push aprovado em `main` deve iniciar o pipeline de produção.

O deploy de produção precisa ser mais restritivo que homologação e usar **GitHub Environments**/secrets de produção quando disponíveis.

Para ações destrutivas, migrations sensíveis ou publicação em lojas, preferir aprovação explícita quando apropriado.

### Blue-Green Deployment

Para componentes server-side do ComercialWeb Mobile/API, implementar estratégia **Blue-Green** quando a infraestrutura permitir.

Conceito:

```text
                  ┌── BLUE  (versão atualmente ativa)
Internet/API ─────┤
                  └── GREEN (nova versão)
```

Durante o deploy:

```text
BLUE = produção atual recebendo tráfego
GREEN = nova versão sendo implantada

        ↓

deploy GREEN
        ↓
health check
        ↓
smoke tests
        ↓
validação
        ↓
troca de tráfego BLUE → GREEN
        ↓
monitoramento
        ↓
BLUE permanece temporariamente disponível para rollback
```

No deploy seguinte, os papéis podem ser invertidos.

A troca de tráfego deve ocorrer somente depois que o ambiente novo passar nos health checks.

Se a nova versão falhar após a promoção, o pipeline deve permitir rollback rápido para o ambiente anterior.

**Não derrubar o ambiente ativo antes de validar o ambiente novo.**

### Docker e Blue-Green

Quando a infraestrutura utilizar Docker, estruturar os serviços para permitir duas versões da API/backend coexistindo temporariamente.

Exemplo conceitual:

```text
reverse proxy / load balancer
          │
          ├── comercial-api-blue
          │
          └── comercial-api-green
                    │
                    ▼
                  MySQL
```

O mecanismo real de troca de tráfego deve ser escolhido conforme a infraestrutura de produção existente. Não introduzir Kubernetes apenas para implementar Blue-Green se Docker Compose + reverse proxy resolverem o cenário.

### Banco de dados e Blue-Green

Este é um ponto crítico.

Blue-Green da aplicação **não significa duplicar automaticamente o MySQL de produção**.

Como BLUE e GREEN podem executar simultaneamente durante a transição, migrations precisam ser compatíveis com ambas as versões.

Preferir estratégia de migration **expand/contract**:

```text
1. EXPAND
   adicionar nova estrutura compatível

2. DEPLOY
   publicar código novo

3. MIGRATE
   migrar/preencher dados quando necessário

4. SWITCH
   direcionar tráfego para nova versão

5. CONTRACT
   remover estrutura antiga somente em release posterior
```

Evitar migrations que imediatamente:
- removam coluna usada pela versão anterior;
- renomeiem coluna de forma incompatível;
- alterem tipo destrutivamente;
- destruam dados.

Backup não substitui migration segura.

### Mobile e Blue-Green

Blue-Green aplica-se principalmente ao **backend/API e serviços web**.

APK/IPA instalados nos aparelhos não são trocados por Blue-Green. Usuários podem permanecer em versões antigas do aplicativo por algum tempo.

Por isso, a API deve manter compatibilidade razoável com versões mobile ainda suportadas.

Mudanças incompatíveis devem utilizar versionamento de API quando necessário, por exemplo:

```text
/api/v1/...
/api/v2/...
```

Não quebre clientes antigos imediatamente após publicar uma nova versão.

### Secrets no CI/CD

Utilizar secrets protegidos do GitHub/ambiente de CI.

Nunca colocar no YAML:
- senha MySQL;
- token de produção;
- chave privada;
- signing key;
- keystore password;
- Apple credentials;
- API secrets.

Também não imprimir esses valores em logs.

### Artefatos

Builds devem ser rastreáveis até:
- commit SHA;
- branch;
- versão;
- data/build number.

Para produção, preferir releases/tags versionadas quando o fluxo estiver estabilizado.

Exemplo:

```text
v1.0.0
v1.1.0
v1.1.1
```

### Rollback

Todo pipeline de produção deve responder à pergunta:

**“Como voltamos à última versão funcional?”**

Antes de considerar o CI/CD pronto, documentar e testar o procedimento de rollback.

No Blue-Green, o objetivo é permitir que o tráfego retorne rapidamente ao ambiente anterior quando ele ainda for compatível com o estado atual do banco.


# 15. Repositório Git / GitHub

O projeto deve ser iniciado e versionado desde o começo no repositório:

`https://github.com/kailonalexandre/comercialwebmobileapp`

Antes de criar qualquer estrutura definitiva:

1. Verificar se o repositório já existe e está acessível.
2. Se estiver vazio, inicializar o projeto localmente e configurar esse repositório como `origin`.
3. Se já possuir arquivos, fazer clone e preservar o conteúdo existente.
4. Não sobrescrever histórico remoto.
5. Não usar `git push --force`.
6. Não apagar branches existentes sem autorização explícita.

Fluxo esperado quando o repositório estiver vazio:

```bash
git init
git branch -M main
git remote add origin https://github.com/kailonalexandre/comercialwebmobileapp.git
```

Se o repositório já existir com conteúdo:

```bash
git clone https://github.com/kailonalexandre/comercialwebmobileapp.git
cd comercialwebmobileapp
```

Antes do primeiro commit, criar um `.gitignore` adequado para:

- React Native;
- Node.js;
- .NET, se houver projetos .NET no mesmo repositório;
- Android;
- macOS/iOS;
- IDEs;
- arquivos locais;
- `.env`;
- secrets;
- certificados;
- keystores;
- builds;
- logs;
- arquivos temporários.

Nunca versionar:

- `.env` real;
- senhas;
- tokens;
- connection strings;
- certificados privados;
- `.p12`;
- `.pfx`;
- keystores com credenciais;
- provisioning profiles privados;
- chaves SSH;
- credenciais MySQL.

Criar `.env.example` apenas com nomes de variáveis e valores fictícios.

Depois que a estrutura inicial estiver validada:

1. revisar `git status`;
2. revisar `git diff`;
3. executar lint/typecheck/test/build aplicáveis;
4. procurar secrets;
5. criar o primeiro commit;
6. garantir a existência de `main` e `dev`;
7. considerar `main` exclusivamente como produção;
8. utilizar `dev` como integração, homologação e desenvolvimento;
9. configurar os workflows de CI/CD antes de iniciar o fluxo normal de features.

Sugestão de mensagem inicial:

```text
chore: initialize ComercialWeb mobile app
```

Depois da inicialização, criar features/fixes a partir de `dev`:

```text
dev
├── feature/auth
├── feature/dashboard
├── feature/products
└── fix/session-refresh
```

Fluxo esperado:

```text
feature/fix → dev → homologação → Pull Request dev→main → produção
```

Para alterações relevantes, utilizar Pull Requests. Não promover uma feature diretamente para `main` ignorando `dev` e a homologação.


# 16. Git

Branches e commits devem ser pequenos e compreensíveis.

Antes de commit:
- revisar `git diff`;
- procurar secrets;
- remover logs temporários;
- executar verificações pertinentes.

Não faça commits automáticos sem solicitação.

Não force push.

Não reescreva histórico compartilhado sem autorização explícita.

---

# 17. Regras para o Claude

Ao receber uma tarefa:

### 1 — Entender

Leia este documento e somente os arquivos relevantes.

### 2 — Investigar

Antes de alterar, descubra como o projeto já resolve problemas semelhantes.

### 3 — Planejar

Para alterações não triviais, escreva um plano curto.

### 4 — Implementar

Faça a menor alteração coerente que resolva completamente o problema.

### 5 — Segurança

Pergunte:

- isto cria uma nova superfície de ataque?
- estou confiando no cliente?
- existe risco multi-tenant?
- existe segredo?
- há informação sensível em logs?
- esta operação precisa de idempotência?
- a autorização ocorre no servidor?

### 6 — Validar

Execute testes/build/lint/typecheck pertinentes.

### 7 — Revisar

Revise o próprio diff antes de encerrar.

### 8 — Responder

Informe de maneira curta:
- o que foi alterado;
- arquivos principais;
- testes executados;
- problemas/riscos pendentes.

Não despeje centenas de linhas de contexto desnecessário na resposta.

---

# 18. Regra contra overengineering

Não transforme o MVP em uma plataforma genérica.

Antes de criar:
- abstração;
- factory;
- provider;
- wrapper;
- generic repository;
- event bus;
- microservice;
- nova dependência,

pergunte se existe uma necessidade concreta atual.

Prefira código simples, legível e testável.

---

# 19. Primeira tarefa sugerida ao Claude

Ao iniciar o projeto, execute esta sequência:

1. Verifique o ambiente Linux.
2. Verifique o acesso ao repositório `https://github.com/kailonalexandre/comercialwebmobileapp`.
3. Se o repositório já existir com conteúdo, faça clone e preserve o histórico. Se estiver vazio, prepare a inicialização local e configure-o como `origin`.
4. Confirme versões atuais e compatibilidade da stack em documentação oficial.
5. Verifique plugins/skills/MCPs disponíveis que realmente auxiliem React Native, frontend, documentação, segurança e economia de contexto.
6. Instale os plugins/skills/MCPs confiáveis selecionados.
7. Ative/habilite cada ferramenta instalada.
8. Confirme que elas estão efetivamente carregadas e funcionando.
9. Não prossiga silenciosamente se uma ferramenta essencial falhar ao instalar ou ativar; informe o problema e proponha uma alternativa confiável.
10. Verifique Docker e Docker Compose e configure-os quando forem úteis.
11. Configure MySQL, preferencialmente via Docker Compose no desenvolvimento.
12. Não instale ferramentas obscuras sem verificar origem, manutenção e permissões.
13. Localize a pasta/repositório local do ComercialWeb. Se o caminho não for inequívoco, pergunte uma única vez ao desenvolvedor.
14. Analise, em modo de leitura, a estrutura relevante do ComercialWeb para identificar regras, autenticação, multi-tenant, APIs e módulos que possam ser reutilizados.
15. Confirme/refine os Bounded Contexts do DDD com base no sistema real, em vez de assumir que a lista deste documento é definitiva.
16. Proponha a arquitetura inicial respeitando DDD + Clean Architecture + Modular Monolith.
17. Proponha a estratégia de autenticação/API.
18. Faça um threat model inicial simples.
19. Crie o projeto.
20. Configure TypeScript estrito, lint, formatter e testes.
21. Crie o design system básico.
22. Implemente primeiro uma tela visual isolada usando dados mockados.
23. Comece pela tela de Login ou Dashboard.
24. Valide no Android.
25. Somente depois conecte gradualmente às APIs reais.

Antes de modificar o backend existente do ComercialWeb, apresente quais endpoints/regras existentes serão reutilizados.

---

# 20. Critério de sucesso inicial

A primeira milestone estará concluída quando houver:

- aplicativo rodando no Android a partir do Linux;
- estrutura organizada;
- design system;
- login visual;
- dashboard visual;
- navegação principal;
- TypeScript estrito;
- lint/typecheck/test funcionando;
- armazenamento seguro preparado;
- API client centralizado;
- nenhuma credencial embarcada;
- arquitetura de autenticação definida;
- isolamento multi-tenant considerado;
- CI inicial;
- documentação curta de setup.

A versão iOS deve usar o mesmo código-base e será validada/assinada posteriormente em macOS.

---

## Regra final

**Não priorize velocidade de implementação acima da integridade dos dados e da segurança.**

Este aplicativo manipulará informações empresariais, vendas, estoque e possivelmente dados financeiros. O cliente mobile é sempre uma fronteira não confiável.

Se uma solução mais rápida exigir colocar segredo no aplicativo, confiar em IDs enviados pelo cliente, enfraquecer TLS, ignorar autorização ou duplicar regras críticas sem validação server-side, **não implemente dessa forma**. Explique o risco e escolha uma arquitetura segura.
