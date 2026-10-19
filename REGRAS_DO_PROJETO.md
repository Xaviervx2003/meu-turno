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
   - A chave `turnos_app` no `localStorage` mantém todos os campos originais exigidos pela especificação (`id`, `data`, `kmTotal`, `faturamento`, `lucroLiquido`, `liquidoKm`, `ticketMedio`).
