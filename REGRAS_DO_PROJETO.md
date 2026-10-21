# 🖤 Regras de Funcionamento, Layout (Padrão Uber) e Código Limpo — Meu Turno

Este documento define as diretrizes oficiais de produto, interface (UI/UX inspirada no **Uber Driver**) e engenharia de código do aplicativo **Meu Turno**.

---

## 1. Regras de Funcionamento (Jornada Real do Motorista)

O aplicativo deve respeitar a rotina real de quem está dirigindo na rua (foco em rapidez, zero distração e precisão financeira):

### 1.1. Três Momentos do Dia do Motorista
1. **Saída de Casa (Início do Turno):**
   - O motorista pode iniciar o turno com **1 toque** salvando o `KM Inicial` do painel e o `Horário de Início`.
   - O estado do turno em andamento fica salvo no `localStorage` (`meu_turno_ativo`), mesmo se fechar o navegador ou acabar a bateria.
2. **Durante a Pista (Gastos Rápidos no Meio do Dia):**
   - Quando parar no posto para abastecer ou almoçar, o motorista não precisa esperar o fim do dia para lembrar quanto gastou: ele usa o botão **"+ Gasto Rápido"** (Combustível, Alimentação, Pedágio/Lavagem) e o valor já acumula automaticamente no turno atual.
3. **Chegada em Casa (Fechamento de Turno):**
   - O app calcula automaticamente as **Horas Trabalhadas** (desde o início do turno) e puxa o **KM Inicial** e os **Gastos Rápidos** lançados durante o dia.
   - O motorista informa apenas o `KM Final` (ou `KM Total`) e os ganhos da **Uber**, **99** e **Particular/iFood**, visualizando na hora o **Lucro Líquido Real**.

### 1.2. Fórmulas e Regras de Negócio Imutáveis
- **KM Total:** `kmFinal > kmInicial ? kmFinal - kmInicial : kmTotalInformado`
- **Provisão de Manutenção (Desgaste):** `kmTotal * custoPorKm` (reserva obrigatória para pneus, óleo, freios e depreciação).
- **Custo Operacional Total:** `combustivel + alimentacao + diariaCarro + outrosGastos + provisaoManutencao`
- **Lucro Líquido Real:** `faturamentoBruto - custoOperacionalTotal`
- **Indicadores de Eficiência (KPIs):**
  - `R$/KM Bruto = faturamentoBruto / kmTotal`
  - `R$/KM Líquido = lucroLiquido / kmTotal`
  - `R$/Hora Líquido = lucroLiquido / horasTrabalhadas`
  - `Ticket Médio = faturamentoBruto / corridas`
  - `Margem Líquida (%) = (lucroLiquido / faturamentoBruto) * 100`

---

## 2. Regras de Layout e Design System (Estilo Uber Driver)

Para **nunca ficar bagunçado** ou poluído visualmente, a interface segue rigorosamente o padrão **Uber Base UI Dark**:

### 2.1. Paleta de Cores Oficial (OLED Dark Mode)
- **Fundo Principal (`--uber-black`):** `#000000` (Preto puro OLED — evita reflexo no para-brisa à noite e economiza bateria do celular no suporte).
- **Superfície de Cards (`--uber-surface`):** `#141414` e `#1F1F1F` (elevação sutil sem sombras pesadas).
- **Bordas Divisórias (`--uber-border`):** `#292929` (`1px solid`).
- **Cor de Ganhos / Sucesso (`--uber-green`):** `#06C167` (Verde oficial de ganhos da Uber).
- **Cor de Ação / Destaque (`--uber-blue`):** `#276EF1` (Azul de navegação Uber).
- **Alertas e Custos:** Amarelo `#FFC043` (Atenção/Manutenção) e Vermelho `#E11900` (Despesa/Prejuízo).
- **Tipografia:** Texto principal `#FFFFFF`, texto secundário `#A6A6A6`, números tabulares (`font-variant-numeric: tabular-nums`) para alinhamento perfeito de valores em `R$`.

### 2.2. Regras Anti-Bagunça (Arquitetura de Informação)
1. **Navegação por Abas Inferiores (Bottom Tab Bar):**
   - Proibido empilhar todas as telas em uma rolagem infinita. O app é dividido em **3 abas exclusivas**:
     - **Aba 1 — `Painel` (Início):** Card de Ganhos no topo (estilo Uber Driver), Meta Diária, Turno em Andamento (Iniciar/Parar) e botão de Gasto Rápido.
     - **Aba 2 — `Fechar Turno` (Calculadora):** Formulário limpo dividido em blocos bem espaçados, com campos avançados (como separação por app e calculadora KM/L) recolhidos em botões expansíveis quando não usados.
     - **Aba 3 — `Atividade` (Histórico):** Lista cronológica de turnos salvos, exportação para WhatsApp e download de planilha CSV.
2. **Hierarquia Visual Máxima de 3 Níveis por Card:**
   - Todo card deve ter no máximo: **Título/Rótulo** (`0.75rem`, cinza), **Valor Principal** (`1.5rem` a `2.2rem`, branco ou verde em negrito) e **Subtítulo de Apoio** (`0.8rem`).
3. **Alvos de Toque Veiculares:**
   - Botões principais e inputs devem ter no mínimo `48px` de altura para facilitar o toque com o celular fixado no suporte do painel.
4. **Proibido Diálogos Nativos do Navegador (`alert` / `prompt` / `confirm`):**
   - Toda pergunta ao motorista abre um **Bottom Sheet** (painel que sobe de baixo, igual ao Uber Driver) via módulo `Sheet`:
     - `Sheet.pedirValor({...})` → campo numérico gigante (`64px`), prefixo `R$`/sufixo `km` e **chips de valor rápido** (`+10`, `+20`, `+50`, `+100`).
     - `Sheet.confirmar({...})` → confirmação com botão de cor semântica (`danger` vermelho para ações destrutivas).
   - O botão de ação fica sempre **embaixo** (zona do polegar) e "Cancelar" é discreto (ghost).

---

## 3. Regras de Código Limpo (Clean Code)

1. **Separação em Módulos Lógicos (Single Responsibility):**
   - `StorageService`: Único ponto de leitura e gravação no `localStorage` (com tratamento `try/catch`).
   - `FinanceEngine`: Funções puras de cálculo (recebem números e retornam o objeto calculado, sem acessar o DOM).
   - `UIController`: Funções responsáveis apenas por ler inputs, renderizar componentes e exibir notificações.
2. **Zero Números Mágicos:**
   - Constantes configuráveis (`DEFAULT_CUSTO_KM = 0.15`, `DEFAULT_META_DIARIA = 200`, chaves do `localStorage`) declaradas no topo do script.
3. **Sanitização e Segurança de Dados:**
   - Toda entrada numérica passa por um helper `lerNumero(id)` que converte vírgula em ponto e garante retorno `0` em caso de `NaN` ou valor negativo inválido.
4. **Compatibilidade Retroativa:**
   - A chave `turnos_app` no `localStorage` mantém todos os campos originais exigidos pela especificação (`id`, `data`, `kmTotal`, `faturamento`, `lucroLiquido`, `liquidoKm`, `ticketMedio`), acrescidos de `ganhoUber`, `ganho99`, `ganhoOutros`, `tags` e `obs`.

---

## 4. Arquitetura Modular Atual & Repositório (`meu-turno-v17`)

- **Diretório Local:** `C:\Users\direcao\.gemini\antigravity\scratch\meu-turno`
- **Repositório GitHub Pages:** `https://github.com/Xaviervx2003/meu-turno.git` (branch `main` → `https://xaviervx2003.github.io/meu-turno/`)
- **Estrutura de Arquivos:**
  - `index.html`: Estrutura semântica enxuta das 3 abas (`#tab-painel`, `#tab-fechar`, `#tab-historico`) + Bottom Sheet (`#sheet`) + tags `<meta name="color-scheme" content="dark">` e `enterkeyhint`.
  - `css/styles.css`: Design System **Uber Base UI Dark OLED**, `color-scheme: dark;` nativo, blocos padronizados `.kpi-tile` / `.kpi-row` / `.kpi-row-2`, `.sheet` com `max-height: 92dvh; overflow-y: auto; overscroll-behavior: contain;`, gráfico interativo e responsividade para `360px`.
  - `icon.svg`, `icon-192.png`, `icon-512.png`: Ícones vetoriais e rasterizados de alta resolução padrão Google Play / WebAPK.
  - `manifest.json`: Web App Manifest com `"id"`, `"categories"`, ícones PNG `192x192` e `512x512` (any e maskable) e `shortcuts` de acesso rápido.
  - `js/storage.js`: `KEYS`, `DEFAULTS`, `StorageService` (com sanitização XSS `escaparHTML` e validação de schema `sanitizarTurno`), `Cofre` (espelhamento automático de turnos e configurações em IndexedDB + pontos de restauração), `Rascunho` e `StorageGuard`.
  - `js/calendar.js`: `CalendarEngine` (cálculo de Semanas do Ano ISO `01–52/53` no ciclo Segunda a Domingo, navegação por offset e agrupamento semanal/mensal).
  - `js/finance.js`: `FinanceEngine` (fórmulas financeiras, avaliação de rentabilidade, `resumirLista`, Modo Privacidade `ocultarValores`, formatação `moeda`, `moedaCurta`, `numeroBR`).
  - `js/sheet.js`: `Sheet` (Bottom Sheet nativo estilo Uber com histórico `popstate`, Focus Trap `Tab` e retorno automático de foco).
  - `js/ui.js`: `UIController` (Turno ao Vivo com Ganhos Parciais e Pausa Almoço, `AndroidWakeLock` veicular, histórico Android Back Button, dispatch de atalhos URL, compartilhamento nativo `navigator.share`, Modo Privacidade `👁️/🙈`, Gráfico Adaptativo por Dia/Semana/Mês, Raio-X por App Uber/99/Pix, Meta Diária/Semanal/Mensal com projeção, Caixa de Manutenção acumulado, Simulador de Corrida e Histórico com Backup JSON/CSV).
  - `sw.js`: Service Worker `meu-turno-v17` **Network-First com fallback Offline** com cache de assets completos incluindo PNGs.

### 4.1. Próxima Funcionalidade Planejada: Leitor Automático de Notas Fiscais (NFC-e SEFAZ-AM)
- Leitura via QR Code (câmera) ou link da **SEFAZ-AM** (`https://sistemas.sefaz.am.gov.br/nfceweb/consultarNFCe.do?acao=submitConsultaNFCeRedirect&txtChaveAcessoNFe=...&hash=...`).
- O portal SEFAZ-AM utiliza sessão (`JSESSIONID`) no redirect inicial e renderiza os dados do cupom em `https://sistemas.sefaz.am.gov.br/nfceweb/jsp/consultanfce/resultadoConsultaNFCeResponsiva.jsp` (estabelecimento, CNPJ, endereço, itens com código/qtd/unidade/valor unitário/total, valor total pago, forma de pagamento e data/hora exata de emissão).
- Ao ler a nota, o sistema preenche automaticamente a data da compra, o valor e categoriza os itens (ex: combustível/litros/preço por litro ou alimentação/compras).

---

## 5. Resumo de Segurança e Acessibilidade Veicular (`meu-turno-v16`)

### 5.1. Melhorias de Segurança e Proteção de Dados
1. **Modo Privacidade na Pista (`👁️` / `🙈`) + Escudo de Multitarefa (App Switcher):**
   - Toque rápido na pílula central da Topbar (`#btnPillPrivacidade`) oculta ou exibe instantaneamente todos os valores monetários da tela (`R$ ••••`) e aplica desfoque (`filter: blur`) nos inputs financeiros não focados (`body.privacy-mode`).
   - Ao minimizar o app para abrir o Uber/Waze (`visibilitychange` / `document.hidden`), `body.app-em-background` desfoca o app automaticamente para proteger os valores na captura de tela do App Switcher (estilo Apple Wallet / Nubank).
   - Os resumos copiados para o WhatsApp e os modais de lançamento continuam exibindo o valor real (`FinanceEngine.moeda(valor, true)`).
2. **Blindagem contra XSS, CSV Injection e Sanitização de Schema (`StorageService`):**
   - `StorageService.escaparHTML()` protege todas as strings dinâmicas (`obs`, `tags`, `motivo` de restauração, datas e IDs) antes da renderização no DOM.
   - `StorageService.sanitizarTurno()` valida tipos numéricos, remove `NaN`/`Infinity`, limita tamanho de strings e higieniza qualquer arquivo `.json` importado (com limite de 5 MB e reordenação cronológica automática).
   - `exportarCSV()` sanitiza células contra *CSV Formula Injection* (`=`, `+`, `-`, `@`) e inclui todas as colunas novas (`Ganho_Uber`, `Ganho_99`, `Ganho_Pix_Outros`, `Tags` e `Observacao`).
   - Política `Content-Security-Policy` (CSP), `Referrer-Policy: no-referrer` e filtro *same-origin* no `sw.js`.
3. **Backup JSON v4 Completo + Cofre Duplo Integral (`IndexedDB`):**
   - O pacote de exportação/importação `.json` e o espelhamento automático no `IndexedDB` (`Cofre.espelharConfigs()`, `Cofre.verificarAutoRecuperacao()`) salvam e restauram 100% dos turnos, do `TURNO_ATIVO` em andamento na rua e de todas as configurações (`metaDiaria`, `metaSemanal`, `metaMensal`, `custoKm`, `consumoKmL`, `precoLitro`, `kmProxOleo`, `custoFixoMes` e `baixaManut`).
4. **Trava de Consistência do Odômetro (`KM Final < KM Inicial`) & Lock Anti-Duplo-Toque:**
   - Destaque visual imediato (`.input-error`) e bloqueio no fechamento caso o motorista digite um `KM Final` menor que o `KM Inicial`, além de trava de concorrência (`_salvandoFechamento`) contra duplo toque em `salvarFechamento()`.

### 5.2. Melhorias de Acessibilidade (WCAG AA) e Ergonomia Veicular
5. **Zoom de Acessibilidade Desbloqueado + `touch-action: manipulation` + `safe-area-inset-bottom`:**
   - Removido o bloqueio `user-scalable=no` / `maximum-scale=1.0` do `viewport`, permitindo pinça/zoom para motoristas com baixa visão, enquanto `touch-action: manipulation` evita zoom acidental ao tocar rápido nos botões.
   - Respeito integral à barra de gestos inferior (`env(safe-area-inset-bottom)`) no `.bottom-nav-inner`, `body`, `.sheet` e `.uber-toast`.
6. **Vínculo Semântico `<label for="...">` em 100% dos Formulários:**
   - Todos os 19 campos de entrada possuem `<label for="...">` explícito e o filtro de histórico possui `aria-label`, permitindo foco ao tocar no rótulo e leitura completa via TalkBack (Android) e VoiceOver (iOS).
7. **Alto Contraste sob Sol Forte (`4.5:1`), `:focus-visible` e `prefers-reduced-motion`:**
   - Placeholders ajustados de `#595959` (`2.35:1`) para `#8A8A8A` (`4.5:1` WCAG AA sobre `#1F1F1F`).
   - Anel de foco `:focus-visible` em azul Uber (`--uber-blue`) para navegação por teclado/botões físicos e suporte a `@media (prefers-reduced-motion: reduce)`.
8. **Semântica ARIA Completa e Focus Trap no Bottom Sheet (`Sheet`):**
   - KPIs clicáveis, pílula do topo e alerta de óleo convertidos em `<button type="button">` nativos; gavetas recolhíveis sincronizam `aria-expanded` / `aria-controls`; cards de histórico com `role="button"`, `tabindex="0"`, `aria-expanded` e suporte às teclas `Enter`/`Espaço`.
   - `#toast` e status do turno configurados com `role="status" aria-live="polite"`.
   - Modal `Sheet` prende o foco (`Tab` / `Shift+Tab`) enquanto aberto e devolve o foco ao botão de origem ao fechar.

---

## 6. Engenharia Nativa Android Puro (6 Pilares Implementados — `v17`)

1. **Predictive Back Navigation & Botão Voltar do Android (`popstate` / History API):**
   - Ao abrir qualquer `Sheet` (`Sheet.pedirValor`, `Sheet.confirmar`), o app empilha um estado no histórico (`history.pushState({ modal: 'sheet' })`). Ao pressionar o botão Voltar do Android (físico ou gesto lateral), o evento `popstate` intercepta e fecha o Sheet suavemente sem sair do app.
   - Ao navegar entre as abas (`fechar`, `historico`), o histórico armazena `{ aba }`. O botão Voltar do Android retorna à aba principal (`painel`) antes de fechar o app, comportando-se exatamente como um aplicativo nativo Android.
2. **Tema Dark Nativo Android & System Navigation Bar (`color-scheme: dark`):**
   - Inclusão de `color-scheme: dark;` na raiz do CSS (`:root`) e `<meta name="color-scheme" content="dark">` no HTML.
   - Instrui o motor Chromium/Android WebView a pintar os fundos de carregamento inicial em preto puro (`#000000`), renderizar controles nativos (como seletor de data e barras de rolagem) no estilo escuro e ajustar a barra de navegação do sistema Android para não ofuscar a visão noturna do motorista.
3. **Otimização do Teclado Virtual Android (IME / Soft Keyboard):**
   - Adicionados atributos semânticos `enterkeyhint="next"` para campos sequenciais de formulário e `enterkeyhint="done"` para o último campo ou campos de valor único.
   - Listener de teclado avançando o foco automaticamente ao pressionar a tecla de ação do teclado Android.
   - O Bottom Sheet (`.sheet`) recebeu `max-height: 92dvh; overflow-y: auto; overscroll-behavior: contain;` para que, ao abrir o teclado virtual, os inputs e botões de confirmação continuem visíveis e roláveis sem quebrar o layout.
4. **Padrão Google Play Store & WebAPK (Empacotamento TWA / Bubblewrap):**
   - Geração de ícones rasterizados PNG em `192x192` (`icon-192.png`) e `512x512` (`icon-512.png`), incluindo propósito `maskable` (com zona segura para ícones adaptativos do Android) e `any`.
   - `manifest.json` atualizado com `"id": "/meu-turno/"`, `"categories": ["finance", "productivity", "utilities"]` e `shortcuts` (Atalhos rápidos na tela inicial do Android ao segurar o ícone do app: "Iniciar Turno", "Fechar Turno" e "Simulador de Corrida").
   - Tratamento de parâmetros de inicialização (`?acao=iniciar`, `?acao=fechar`, `?acao=simulador`) em `UIController.iniciar()`.
5. **Web Share API Nativa do Android (`navigator.share`):**
   - O compartilhamento de relatórios diários e resumos semanais utiliza preferencialmente o `navigator.share()`, acionando a folha nativa do Android (Direct Share) com 1 toque direto para WhatsApp, Telegram ou contatos recentes, mantendo fallback resiliente para a área de transferência (`navigator.clipboard`).
6. **Screen Wake Lock API Veicular (`navigator.wakeLock`):**
   - Módulo `AndroidWakeLock` que solicita a trava de tela (`screen`) enquanto o turno estiver em andamento na pista ou durante o uso do simulador de corrida com o celular fixado no suporte veicular, impedindo que a tela apague ou bloqueie durante o trabalho.
   - Reativação inteligente da trava ao alternar entre aplicativos através do evento `visibilitychange`.
