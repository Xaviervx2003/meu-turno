# 🚗 Meu Turno — PWA de Controle Financeiro para Motoristas (Uber, 99, iFood)

Aplicativo web **Offline-First (PWA)** focado em motoristas de aplicativo e entregadores para calcular o **Lucro Líquido Real** do dia a dia na pista, descontando todos os custos operacionais e o desgaste por KM.

## ✨ Funcionalidades Principais

1. **Painel de Resumo & Meta Diária:**
   - Acompanhe seu **Lucro Líquido**, **Faturamento Bruto**, **Gastos**, **KM Rodado**, **R$/KM Líquido** e **Ganho por Hora** filtrando por **Hoje**, **Últimos 7 Dias**, **Mês Atual** ou **Acumulado Geral**.
   - **Meta Diária configurável** com barra de progresso em tempo real.
2. **Controle de Odômetro e Tempo:**
   - Cálculo automático pelo `KM Inicial` e `KM Final` (com botão para puxar automaticamente o último KM Final salvo) ou digitação direta do `KM Total`.
   - Registro de **Horas Trabalhadas** e **Quantidade de Corridas/Entregas**.
3. **Faturamento Separado por App:**
   - Lance ganhos de **Uber**, **99** e **Outros/Particular/iFood** com soma automática no Bruto Total.
4. **Gastos Detalhados do Dia:**
   - **Combustível / GNV** (inclui **Calculadora por Consumo KM/L e Preço do Litro** para estimar automaticamente o gasto do turno).
   - **Alimentação / Água / Café**.
   - **Aluguel / Diária do Carro / Seguro**.
   - **Lavagem / Pedágio / Estacionamento / Outros**.
   - **Reserva de Manutenção por KM** (pneus, óleo, freios — padrão R$ 0,15/km).
5. **Diagnóstico do Turno + Compartilhamento:**
   - Classificação automática da saúde do turno (`🔥 Excelente`, `👍 Regular`, `⚠️ Custo Alto`).
   - Botão **Copiar Resumo p/ WhatsApp** e **Exportar Planilha (CSV)** para Excel / Google Sheets.
6. **100% Offline no Celular (PWA):**
   - Instalável na tela inicial do Android e iPhone via `manifest.json` e `sw.js`, salvando todos os dados localmente no aparelho (`localStorage`).

## 📱 Como Usar no Celular

1. Acesse o link do GitHub Pages do projeto no navegador do celular:
   - `https://xaviervx2003.github.io/meu-turno/`
2. **Android (Chrome):** Toque em **📲 Instalar App** no topo ou no menu `⋮` ➔ **Adicionar à tela inicial**.
3. **iPhone (Safari):** Toque em **Compartilhar** ➔ **Adicionar à Tela de Início**.