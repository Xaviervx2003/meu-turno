/* ==========================================================================
   MÓDULO 5: UI CONTROLLER (INTERAÇÃO, NAVEGAÇÃO, SEMANAS DO ANO & RENDERIZAÇÃO)
   ========================================================================== */
const UIController = {
  periodoAtual: 'hoje',
  offsetSemana: 0,
  offsetMes: 0,
  filtroHistorico: 'todos',
  ultimoTextoWhatsApp: '',
  deferredPrompt: null,
  idTurnoEditando: null,

  hojeISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  },

  async iniciar() {
    document.getElementById('dataTurno').value = this.hojeISO();
    document.getElementById('custoKm').value = StorageService.obterNumero(KEYS.CUSTO_KM, DEFAULTS.CUSTO_KM);

    const kml = StorageService.obterNumero(KEYS.CONSUMO_KML, 0);
    const preco = StorageService.obterNumero(KEYS.PRECO_LITRO, 0);
    if (kml > 0) document.getElementById('consumoKmL').value = kml;
    if (preco > 0) document.getElementById('precoLitro').value = preco;

    Rascunho.iniciarMonitoramento();
    await StorageGuard.verificarStatusPersistencia();

    const recuperados = await Cofre.verificarAutoRecuperacao();
    if (recuperados > 0) {
      this.notificar(`🛡️ ${recuperados} turno(s) recuperados automaticamente do Cofre!`);
    }

    this.atualizarTudo();

    setInterval(() => {
      if (StorageService.obterTurnoAtivo() && !Sheet._resolver) this.renderizarTurnoVivo();
    }, 30000);
  },

  atualizarTudo() {
    this.renderizarTurnoVivo();
    this.atualizarPainel();
    this.renderizarHistorico();
    this.renderizarSegurancaDados();
  },

  lerNumero(id) {
    const el = document.getElementById(id);
    if (!el || !el.value) return 0;
    const num = parseFloat(String(el.value).replace(',', '.'));
    return isNaN(num) || num < 0 ? 0 : num;
  },

  notificar(mensagem) {
    const toast = document.getElementById('toast');
    toast.textContent = mensagem;
    toast.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2600);
  },

  navegarAba(aba) {
    document.querySelectorAll('.tab-view').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    document.getElementById(`tab-${aba}`).classList.add('active');
    document.getElementById(`nav-${aba}`).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  togglePainel(id) {
    document.getElementById(id).classList.toggle('open');
  },

  formatarDuracaoMs(ms) {
    const totalMin = Math.max(1, Math.round(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },

  parseData(item) {
    return CalendarEngine.parseData(item);
  },

  /* ==========================================================================
     TURNO AO VIVO NA PISTA + PAUSA ALMOÇO + GASTOS RÁPIDOS
     ========================================================================== */
  renderizarTurnoVivo() {
    const ativo = StorageService.obterTurnoAtivo();
    const card = document.getElementById('cardTurnoVivo');
    const dot = document.getElementById('topStatusDot');
    const txt = document.getElementById('topStatusText');

    if (!ativo) {
      card.classList.remove('active-shift', 'paused-shift');
      dot.classList.remove('online', 'paused');
      txt.textContent = 'Fora de turno';

      card.innerHTML = `
        <div class="card-header-row" style="margin-bottom:10px;">
          <h2 class="card-title">Pronto para rodar?</h2>
          <span style="font-size:0.75rem; color:var(--uber-muted);">Salva hora e KM inicial</span>
        </div>
        <button class="btn-uber-go" onclick="UIController.iniciarTurnoNaPista()">
          <span>▶ INICIAR TURNO AGORA</span>
        </button>
      `;
      return;
    }

    const agoraMs = Date.now();
    const emPausa = Boolean(ativo.pausadoEmMs);
    const pausaAtualMs = emPausa ? Math.max(0, agoraMs - ativo.pausadoEmMs) : 0;
    const pausaTotalMs = (ativo.totalPausaMs || 0) + pausaAtualMs;
    const tempoLiquidoMs = Math.max(60000, (agoraMs - ativo.inicioMs) - pausaTotalMs);
    const totalGastosParciais = (ativo.combustivel || 0) + (ativo.alimentacao || 0) + (ativo.outrosGastos || 0);

    card.classList.toggle('active-shift', !emPausa);
    card.classList.toggle('paused-shift', emPausa);
    dot.classList.toggle('online', !emPausa);
    dot.classList.toggle('paused', emPausa);
    txt.textContent = emPausa ? 'Em Pausa' : 'Em Turno';

    const badgeHTML = emPausa
      ? `<span class="status-badge status-warn">☕ PAUSA ALMOÇO (${this.formatarDuracaoMs(pausaAtualMs)})</span>`
      : `<span class="status-badge status-good">🟢 EM TURNO DESDE ${ativo.horaFormatada}</span>`;

    const infoPausaHTML = pausaTotalMs > 0
      ? ` • Pausa descontada: <b style="color:var(--uber-yellow);">${this.formatarDuracaoMs(pausaTotalMs)}</b>`
      : '';

    const botaoPausaHTML = emPausa
      ? `<button type="button" class="btn-uber-green" style="margin-bottom:10px;" onclick="UIController.alternarPausaTurno()">
           ▶ Retomar Turno (Voltar p/ Pista)
         </button>`
      : `<button type="button" class="btn-uber-pause" style="margin-bottom:10px;" onclick="UIController.alternarPausaTurno()">
           <span>☕ Pausar p/ Almoço ou Descanso</span>
         </button>`;

    card.innerHTML = `
      <div class="card-header-row" style="margin-bottom:8px;">
        ${badgeHTML}
        <span style="font-size:0.8rem; font-weight:700;">Rodando: ${this.formatarDuracaoMs(tempoLiquidoMs)}</span>
      </div>
      <div style="font-size:0.83rem; color:var(--uber-muted); margin-bottom:12px;">
        KM Inicial: <b style="color:#fff;">${ativo.kmInicial || '—'}</b> •
        Gastos hoje: <b style="color:#fff;">R$ ${totalGastosParciais.toFixed(2)}</b>${infoPausaHTML}
      </div>

      ${botaoPausaHTML}

      <div style="font-size:0.72rem; color:var(--uber-muted); text-transform:uppercase; font-weight:700;">
        Anote gastos rápidos na rua:
      </div>
      <div class="quick-expense-grid">
        <button class="quick-exp-btn" onclick="UIController.lancarGastoRapido('combustivel', 'Combustível / GNV', '⛽')">
          <span>⛽</span>+ Combustível<br><small style="color:var(--uber-muted)">R$ ${(ativo.combustivel || 0).toFixed(0)}</small>
        </button>
        <button class="quick-exp-btn" onclick="UIController.lancarGastoRapido('alimentacao', 'Alimentação / Água', '🍔')">
          <span>🍔</span>+ Refeição<br><small style="color:var(--uber-muted)">R$ ${(ativo.alimentacao || 0).toFixed(0)}</small>
        </button>
        <button class="quick-exp-btn" onclick="UIController.lancarGastoRapido('outrosGastos', 'Pedágio / Lavagem / Outros', '🧼')">
          <span>🧼</span>+ Outros<br><small style="color:var(--uber-muted)">R$ ${(ativo.outrosGastos || 0).toFixed(0)}</small>
        </button>
      </div>

      <div class="grid-2" style="margin-top:10px;">
        <button class="btn-uber-primary" onclick="UIController.prepararEncerramentoTurno()">
          🏁 Encerrar Turno
        </button>
        <button class="btn-uber-ghost" onclick="UIController.cancelarTurnoVivo()">
          Cancelar
        </button>
      </div>
    `;
  },

  alternarPausaTurno() {
    const ativo = StorageService.obterTurnoAtivo();
    if (!ativo) return;

    const agora = Date.now();
    if (!ativo.pausadoEmMs) {
      ativo.pausadoEmMs = agora;
      ativo.horaPausa = new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      StorageService.salvarTurnoAtivo(ativo);
      this.renderizarTurnoVivo();
      this.notificar('☕ Turno pausado! Bom almoço / descanso.');
    } else {
      const duracaoPausa = Math.max(0, agora - ativo.pausadoEmMs);
      ativo.totalPausaMs = (ativo.totalPausaMs || 0) + duracaoPausa;
      ativo.pausadoEmMs = null;
      StorageService.salvarTurnoAtivo(ativo);
      this.renderizarTurnoVivo();
      this.notificar(`▶️ De volta à pista! (${this.formatarDuracaoMs(duracaoPausa)} de pausa descontados)`);
    }
  },

  async iniciarTurnoNaPista() {
    const turnos = StorageService.obterTurnos();
    const ultimoComKm = turnos.find(t => t.kmFinal && t.kmFinal > 0);
    const sugestaoKm = ultimoComKm ? String(ultimoComKm.kmFinal) : '';

    const kmInicial = await Sheet.pedirValor({
      icone: '🚗',
      titulo: 'Iniciar turno',
      subtitulo: ultimoComKm
        ? `Confira o odômetro do painel. Último KM salvo: <b>${ultimoComKm.kmFinal} km</b>`
        : 'Digite o KM que aparece no painel do carro agora. Pode deixar em branco e informar só no final.',
      valorInicial: sugestaoKm,
      placeholder: 'Ex: 45200',
      sufixo: 'km',
      inteiro: true,
      permitirVazio: true,
      textoOk: '▶ Ficar online',
      variante: 'blue'
    });
    if (kmInicial === null) return;

    const agora = new Date();
    const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    StorageService.salvarTurnoAtivo({
      inicioMs: Date.now(),
      horaFormatada,
      kmInicial,
      pausadoEmMs: null,
      totalPausaMs: 0,
      combustivel: 0,
      alimentacao: 0,
      outrosGastos: 0
    });

    this.renderizarTurnoVivo();
    this.notificar('Bom trabalho! Turno iniciado.');
  },

  async lancarGastoRapido(campo, nomeAmigavel, icone) {
    const ativo = StorageService.obterTurnoAtivo();
    if (!ativo) return;

    const acumulado = ativo[campo] || 0;
    const valor = await Sheet.pedirValor({
      icone: icone || '💸',
      titulo: nomeAmigavel,
      subtitulo: `Quanto você gastou agora? Já anotado neste turno: <b>R$ ${acumulado.toFixed(2)}</b>`,
      placeholder: '0,00',
      prefixo: 'R$',
      atalhos: [10, 20, 50, 100],
      textoOk: 'Adicionar gasto',
      variante: 'primary'
    });
    if (valor === null || valor <= 0) return;

    ativo[campo] = Number(((ativo[campo] || 0) + valor).toFixed(2));
    StorageService.salvarTurnoAtivo(ativo);
    this.renderizarTurnoVivo();
    this.notificar(`+ R$ ${valor.toFixed(2)} somado em ${nomeAmigavel}!`);
  },

  prepararEncerramentoTurno() {
    const ativo = StorageService.obterTurnoAtivo();
    if (!ativo) return;

    const agoraMs = Date.now();
    const pausaAtualMs = ativo.pausadoEmMs ? Math.max(0, agoraMs - ativo.pausadoEmMs) : 0;
    const pausaTotalMs = (ativo.totalPausaMs || 0) + pausaAtualMs;
    const tempoLiquidoMs = Math.max(0, (agoraMs - ativo.inicioMs) - pausaTotalMs);
    const horasDecorridas = Math.max(0.5, Number((tempoLiquidoMs / 3600000).toFixed(1)));

    if (ativo.kmInicial > 0) document.getElementById('kmInicial').value = ativo.kmInicial;
    document.getElementById('horasTrabalhadas').value = horasDecorridas;
    if (ativo.combustivel > 0) document.getElementById('combustivel').value = ativo.combustivel.toFixed(2);
    if (ativo.alimentacao > 0) document.getElementById('alimentacao').value = ativo.alimentacao.toFixed(2);
    if (ativo.outrosGastos > 0) document.getElementById('outrosGastos').value = ativo.outrosGastos.toFixed(2);

    Rascunho.salvar();
    this.navegarAba('fechar');
    document.getElementById('kmFinal').focus();
    this.notificar('Dados do turno preenchidos (pausas descontadas)!');
  },

  async cancelarTurnoVivo() {
    const ok = await Sheet.confirmar({
      icone: '⚠️',
      titulo: 'Cancelar turno?',
      subtitulo: 'O horário de início e os gastos rápidos anotados serão descartados. Nada será salvo no histórico.',
      textoOk: 'Sim, cancelar turno',
      textoCancelar: 'Continuar rodando',
      variante: 'danger'
    });
    if (ok) {
      StorageService.salvarTurnoAtivo(null);
      this.renderizarTurnoVivo();
      this.notificar('Turno cancelado.');
    }
  },

  /* ==========================================================================
     FORMULÁRIO DE FECHAMENTO DE TURNO
     ========================================================================== */
  puxarUltimoKmFinal() {
    const ultimo = StorageService.obterTurnos().find(t => t.kmFinal && t.kmFinal > 0);
    if (ultimo) {
      document.getElementById('kmInicial').value = ultimo.kmFinal;
      this.aoMudarOdometro();
      this.notificar(`KM Inicial preenchido: ${ultimo.kmFinal}`);
    } else {
      this.notificar('Nenhum KM Final anterior salvo.');
    }
  },

  aoMudarOdometro() {
    const kmIni = this.lerNumero('kmInicial');
    const kmFim = this.lerNumero('kmFinal');
    if (kmFim > kmIni) {
      document.getElementById('kmTotalInput').value = (kmFim - kmIni).toFixed(1).replace(/\.0$/, '');
      this.calcularCombustivelPorConsumo();
    }
  },

  somarApps() {
    const soma = this.lerNumero('ganhoUber') + this.lerNumero('ganho99') + this.lerNumero('ganhoOutros');
    if (soma > 0) {
      document.getElementById('faturamento').value = soma.toFixed(2);
    }
  },

  calcularCombustivelPorConsumo() {
    const kmIni = this.lerNumero('kmInicial');
    const kmFim = this.lerNumero('kmFinal');
    const kmTotal = kmFim > kmIni ? (kmFim - kmIni) : this.lerNumero('kmTotalInput');
    const kml = this.lerNumero('consumoKmL');
    const preco = this.lerNumero('precoLitro');

    if (kml > 0) StorageService.salvarValor(KEYS.CONSUMO_KML, kml);
    if (preco > 0) StorageService.salvarValor(KEYS.PRECO_LITRO, preco);

    if (kmTotal > 0 && kml > 0 && preco > 0) {
      const custoComb = (kmTotal / kml) * preco;
      document.getElementById('combustivel').value = custoComb.toFixed(2);
    }
  },

  formatarDataBR(iso) {
    if (!iso || !iso.includes('-')) return new Date().toLocaleDateString('pt-BR');
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  async salvarFechamento() {
    const entrada = {
      dataISO: document.getElementById('dataTurno').value,
      horas: this.lerNumero('horasTrabalhadas'),
      kmIni: this.lerNumero('kmInicial'),
      kmFim: this.lerNumero('kmFinal'),
      kmDireto: this.lerNumero('kmTotalInput'),
      corridas: Math.round(this.lerNumero('corridas')),
      faturamento: this.lerNumero('faturamento'),
      combustivel: this.lerNumero('combustivel'),
      alimentacao: this.lerNumero('alimentacao'),
      diariaCarro: this.lerNumero('diariaCarro'),
      outrosGastos: this.lerNumero('outrosGastos'),
      custoKm: this.lerNumero('custoKm')
    };

    const calc = FinanceEngine.calcularTurno(entrada);

    if (entrada.faturamento <= 0 && calc.kmTotal <= 0) {
      this.notificar('Informe o Faturamento ou KM Rodado!');
      return;
    }

    StorageService.salvarValor(KEYS.CUSTO_KM, entrada.custoKm);

    const dataBR = this.formatarDataBR(entrada.dataISO);
    const avaliacao = FinanceEngine.avaliarRentabilidade(calc);

    const registro = {
      id: Date.now(),
      data: dataBR,
      dataISO: entrada.dataISO,
      kmInicial: entrada.kmIni,
      kmFinal: entrada.kmFim,
      kmTotal: calc.kmTotal,
      horas: entrada.horas,
      corridas: entrada.corridas,
      faturamento: Number(entrada.faturamento.toFixed(2)),
      custosTotais: calc.custosTotais,
      combustivel: Number(entrada.combustivel.toFixed(2)),
      alimentacao: Number(entrada.alimentacao.toFixed(2)),
      diariaCarro: Number(entrada.diariaCarro.toFixed(2)),
      outrosGastos: Number(entrada.outrosGastos.toFixed(2)),
      provisaoManut: calc.provisaoManut,
      lucroLiquido: calc.lucroLiquido,
      brutoKm: calc.brutoKm,
      liquidoKm: calc.liquidoKm,
      liquidoHora: calc.liquidoHora,
      ticketMedio: calc.ticketMedio
    };

    const turnos = StorageService.obterTurnos();

    if (this.idTurnoEditando) {
      const idxEdit = turnos.findIndex(t => String(t.id) === String(this.idTurnoEditando));
      if (idxEdit !== -1) {
        await Cofre.criarPonto(`Antes de editar turno de ${turnos[idxEdit].data}`);
        registro.id = turnos[idxEdit].id;
        turnos[idxEdit] = registro;
        if (!StorageService.salvarTurnos(turnos)) return;
        this.cancelarEdicaoTurno(false);
        Rascunho.limpar();
        this.exibirRecibo(registro, calc, avaliacao);
        this.atualizarTudo();
        this.notificar('Turno atualizado com sucesso!');
        return;
      }
      this.idTurnoEditando = null;
    }

    const assinatura = [entrada.dataISO, calc.kmTotal, entrada.faturamento, calc.custosTotais].join('|');
    const duplicado = turnos.find(t =>
      [t.dataISO, t.kmTotal, t.faturamento, t.custosTotais].join('|') === assinatura
    );
    if (duplicado) {
      const salvarMesmoAssim = await Sheet.confirmar({
        icone: '🧐',
        titulo: 'Esse turno já foi salvo',
        subtitulo: `Já existe um fechamento de <b>${duplicado.data}</b> com os mesmos valores (Lucro <b>R$ ${duplicado.lucroLiquido}</b>). Salvar outra vez vai duplicar seus ganhos.`,
        textoOk: 'Salvar mesmo assim',
        textoCancelar: 'Não salvar',
        variante: 'danger'
      });
      if (!salvarMesmoAssim) return;
    }

    turnos.unshift(registro);
    if (!StorageService.salvarTurnos(turnos)) return;

    StorageService.salvarTurnoAtivo(null);
    Rascunho.limpar();
    StorageGuard.pedirPersistencia();

    this.exibirRecibo(registro, calc, avaliacao);
    this.atualizarTudo();
    this.notificar('Fechamento salvo com sucesso!');
  },

  exibirRecibo(reg, calc, avaliacao) {
    const box = document.getElementById('boxResultado');
    box.style.display = 'block';
    const corLucro = parseFloat(reg.lucroLiquido) >= 0 ? 'var(--uber-green)' : 'var(--uber-red)';

    box.innerHTML = `
      <div class="card-header-row">
        <strong>Recibo • ${reg.data}</strong>
        <span class="status-badge ${avaliacao.classe}">${avaliacao.rotulo}</span>
      </div>
      <div class="receipt-row"><span>KM Total Rodado</span><span>${reg.kmTotal} km</span></div>
      <div class="receipt-row"><span>Faturamento Bruto</span><span>R$ ${reg.faturamento.toFixed(2)}</span></div>
      <div class="receipt-row"><span>Despesas do Dia</span><span style="color:var(--uber-red)">- R$ ${calc.gastosDiretos.toFixed(2)}</span></div>
      <div class="receipt-row"><span>Reserva Manutenção (KM)</span><span style="color:var(--uber-yellow)">- R$ ${calc.provisaoManut.toFixed(2)}</span></div>
      <div class="receipt-row"><span>Ganho por KM (Bruto / Líq.)</span><span>R$ ${reg.brutoKm} / <b>R$ ${reg.liquidoKm}</b></span></div>
      ${reg.horas > 0 ? `<div class="receipt-row"><span>Ganho Líquido por Hora</span><span>R$ ${reg.liquidoHora}/h</span></div>` : ''}
      <div class="receipt-row"><span>Ticket Médio (${reg.corridas} corridas)</span><span>R$ ${reg.ticketMedio}</span></div>
      <div class="receipt-total">
        <span>Lucro Líquido (${calc.margemLiquida}%)</span>
        <span style="color:${corLucro}">R$ ${reg.lucroLiquido}</span>
      </div>
      <button type="button" class="btn-uber-ghost" style="margin-top:14px;" onclick="UIController.copiarWhatsApp()">
        📲 Copiar Resumo para WhatsApp
      </button>
    `;

    this.ultimoTextoWhatsApp =
      `🖤 *FECHAMENTO MEU TURNO (${reg.data})*\n` +
      `💰 *Bruto:* R$ ${reg.faturamento.toFixed(2)}\n` +
      `⛽ *Custos Totais:* R$ ${reg.custosTotais.toFixed(2)}\n` +
      `✅ *LUCRO LÍQUIDO:* R$ ${reg.lucroLiquido} (${calc.margemLiquida}%)\n` +
      `🛣️ *KM:* ${reg.kmTotal} km (Líq: R$ ${reg.liquidoKm}/km)\n` +
      (reg.horas > 0 ? `⏱️ *Horas:* ${reg.horas}h (Líq: R$ ${reg.liquidoHora}/h)\n` : '') +
      `🏁 *Corridas:* ${reg.corridas} (Ticket: R$ ${reg.ticketMedio})`;
  },

  copiarWhatsApp() {
    if (!this.ultimoTextoWhatsApp) return;
    navigator.clipboard.writeText(this.ultimoTextoWhatsApp).then(() => {
      this.notificar('Resumo copiado para colar no WhatsApp!');
    });
  },

  /* ==========================================================================
     PAINEL DE GANHOS, SEMANAS DO ANO (01–52), COMPARATIVO & META SEMANAL
     ========================================================================== */
  mudarPeriodo(periodo, btn) {
    this.periodoAtual = periodo;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.atualizarPainel();
  },

  navegarCiclo(delta) {
    if (this.periodoAtual === '7dias') {
      this.offsetSemana = Math.min(0, this.offsetSemana + delta);
    } else if (this.periodoAtual === 'mes') {
      this.offsetMes = Math.min(0, this.offsetMes + delta);
    }
    this.atualizarPainel();
  },

  voltarCicloAtual() {
    this.offsetSemana = 0;
    this.offsetMes = 0;
    this.atualizarPainel();
  },

  atualizarPainel() {
    const turnos = StorageService.obterTurnos();
    const agora = new Date();
    const hojeStr = agora.toLocaleDateString('pt-BR');

    // Lucro de hoje para a pílula superior e barra de meta diária
    const lucroHoje = turnos
      .filter(t => t.data === hojeStr)
      .reduce((acc, t) => acc + (parseFloat(t.lucroLiquido) || 0), 0);

    document.getElementById('pillLucroHoje').textContent = `R$ ${lucroHoje.toFixed(2)}`;

    const infoSemanaSelecionada = CalendarEngine.obterSemanaPorOffset(this.offsetSemana);
    const infoMesSelecionado = CalendarEngine.obterMesPorOffset(this.offsetMes);

    // 1. Renderiza a barra de navegação de Semana do Ano (Semana 01 a 52) ou Mês (#1)
    this.renderizarBarraNavegacaoCiclo(infoSemanaSelecionada, infoMesSelecionado);

    // 2. Filtra os turnos do período ativo e do período imediatamente anterior (para o comparativo #2)
    let filtrados = [];
    let filtradosAnteriores = [];
    let rotuloAnterior = '';

    if (this.periodoAtual === 'hoje') {
      filtrados = turnos.filter(t => t.data === hojeStr);
      document.getElementById('lblPeriodoTitulo').textContent = 'LUCRO LÍQUIDO LIVRE (HOJE)';
    } else if (this.periodoAtual === '7dias') {
      filtrados = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSemanaSelecionada));
      filtradosAnteriores = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSemanaSelecionada.anterior));
      rotuloAnterior = `Semana ${infoSemanaSelecionada.anterior.numStr}`;
      document.getElementById('lblPeriodoTitulo').textContent =
        `LUCRO LÍQUIDO • SEMANA ${infoSemanaSelecionada.numStr}/${infoSemanaSelecionada.totalAno} (${infoSemanaSelecionada.intervaloCurto.toUpperCase()})`;
    } else if (this.periodoAtual === 'mes') {
      filtrados = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoMesSelecionado));
      filtradosAnteriores = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoMesSelecionado.anterior));
      rotuloAnterior = infoMesSelecionado.anterior.rotuloCurto;
      document.getElementById('lblPeriodoTitulo').textContent =
        `LUCRO LÍQUIDO • ${infoMesSelecionado.rotuloMes.toUpperCase()}`;
    } else {
      filtrados = turnos;
      document.getElementById('lblPeriodoTitulo').textContent = 'LUCRO LÍQUIDO LIVRE (ACUMULADO GERAL)';
    }

    const resumoAtual = FinanceEngine.resumirLista(filtrados);
    const resumoAnterior = FinanceEngine.resumirLista(filtradosAnteriores);

    const elLucro = document.getElementById('kpiLucroLiquido');
    elLucro.textContent = `R$ ${resumoAtual.somaLucro.toFixed(2)}`;
    elLucro.style.color = resumoAtual.somaLucro >= 0 ? 'var(--uber-white)' : 'var(--uber-red)';

    document.getElementById('kpiBruto').textContent = `R$ ${resumoAtual.somaBruto.toFixed(2)}`;
    document.getElementById('kpiCustos').textContent = `R$ ${resumoAtual.somaCustos.toFixed(2)}`;
    document.getElementById('kpiTurnosCount').textContent =
      `${filtrados.length} turno${filtrados.length === 1 ? '' : 's'} (${resumoAtual.diasTrabalhados}d)`;

    document.getElementById('kpiMediaKm').textContent = `R$ ${resumoAtual.mediaKm.toFixed(2)}`;
    document.getElementById('kpiMediaHora').textContent =
      resumoAtual.somaHoras > 0 ? `R$ ${resumoAtual.mediaHora.toFixed(2)}/h` : '—';
    document.getElementById('kpiKmRodado').textContent = `${resumoAtual.somaKm.toFixed(0)} km`;

    // 3. Renderiza o Comparativo Automático com a Semana / Mês Anterior (#2)
    this.renderizarComparativoPeriodo(resumoAtual.somaLucro, resumoAnterior.somaLucro, rotuloAnterior);

    // 4. Meta Diária + Meta Semanal (Segunda a Domingo) + Contador de Dias Rodados (#3)
    const metaDiaria = StorageService.obterNumero(KEYS.META_DIARIA, DEFAULTS.META_DIARIA);
    const pctDiaria = metaDiaria > 0 ? Math.min(100, Math.max(0, (lucroHoje / metaDiaria) * 100)) : 0;
    document.getElementById('barraMetaFill').style.width = `${pctDiaria}%`;

    const faltaHoje = Math.max(0, metaDiaria - lucroHoje);
    document.getElementById('txtMetaInfo').innerHTML = lucroHoje >= metaDiaria
      ? `🏆 Meta Hoje Batida! <strong>R$ ${lucroHoje.toFixed(2)} / R$ ${metaDiaria.toFixed(2)}</strong>`
      : `🎯 Meta Hoje: <strong>R$ ${metaDiaria.toFixed(2)}</strong> (Falta R$ ${faltaHoje.toFixed(2)})`;

    this.renderizarPrevisaoMeta(turnos, faltaHoje, lucroHoje >= metaDiaria);
    this.renderizarMetaSemanal(turnos, infoSemanaSelecionada);
    this.renderizarGrafico7Dias(turnos, metaDiaria, infoSemanaSelecionada);
    this.renderizarInsightDiaSemana(turnos);
    this.renderizarFerramentasPista(turnos);
  },

  renderizarBarraNavegacaoCiclo(infoSemana, infoMes) {
    const nav = document.getElementById('barraNavegacaoPeriodo');
    if (!nav) return;

    if (this.periodoAtual !== '7dias' && this.periodoAtual !== 'mes') {
      nav.classList.remove('visible');
      return;
    }

    nav.classList.add('visible');

    if (this.periodoAtual === '7dias') {
      const btnHoje = !infoSemana.ehSemanaAtual
        ? `<button type="button" class="chip-btn" style="padding:3px 8px; margin-left:6px;" onclick="UIController.voltarCicloAtual()">Atual</button>`
        : `<span class="status-badge status-good" style="padding:2px 7px; font-size:0.65rem; margin-left:6px;">ATUAL</span>`;

      nav.innerHTML = `
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(-1)" title="Semana anterior">◀</button>
        <div class="period-nav-center">
          <span class="period-nav-title">
            📅 Semana ${infoSemana.numStr} / ${infoSemana.totalAno} (${infoSemana.anoISO}) ${btnHoje}
          </span>
          <span class="period-nav-sub">Ciclo Seg–Dom: ${infoSemana.intervaloCurto}</span>
        </div>
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(1)" ${infoSemana.ehSemanaAtual ? 'disabled' : ''} title="Próxima semana">▶</button>
      `;
    } else if (this.periodoAtual === 'mes') {
      const btnAtual = !infoMes.ehMesAtual
        ? `<button type="button" class="chip-btn" style="padding:3px 8px; margin-left:6px;" onclick="UIController.voltarCicloAtual()">Atual</button>`
        : `<span class="status-badge status-good" style="padding:2px 7px; font-size:0.65rem; margin-left:6px;">ATUAL</span>`;

      nav.innerHTML = `
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(-1)" title="Mês anterior">◀</button>
        <div class="period-nav-center">
          <span class="period-nav-title">🗓️ ${infoMes.rotuloMes} ${btnAtual}</span>
          <span class="period-nav-sub">Navegue entre os meses fechados</span>
        </div>
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(1)" ${infoMes.ehMesAtual ? 'disabled' : ''} title="Próximo mês">▶</button>
      `;
    }
  },

  renderizarComparativoPeriodo(lucroAtual, lucroAnterior, rotuloAnterior) {
    const el = document.getElementById('badgeComparativoPeriodo');
    if (!el) return;

    if ((this.periodoAtual !== '7dias' && this.periodoAtual !== 'mes') || (lucroAtual === 0 && lucroAnterior === 0)) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';

    if (lucroAnterior <= 0) {
      el.innerHTML = `<span style="color:var(--uber-muted);">📊 Sem registros em <b>${rotuloAnterior}</b> para comparar.</span>`;
      return;
    }

    const diff = lucroAtual - lucroAnterior;
    const pct = Math.round((diff / lucroAnterior) * 100);
    const sinal = diff >= 0 ? '+' : '-';
    const cor = diff >= 0 ? 'var(--uber-green)' : 'var(--uber-yellow)';
    const icone = diff >= 0 ? '🟢' : '🟡';

    el.innerHTML = `
      ${icone} <span style="color:${cor};">${sinal}R$ ${Math.abs(diff).toFixed(2)} (${diff >= 0 ? '+' : ''}${pct}%)</span>
      <span style="color:var(--uber-muted);">vs. ${rotuloAnterior} (R$ ${lucroAnterior.toFixed(2)})</span>
    `;
  },

  renderizarMetaSemanal(turnos, infoSemanaSelecionada) {
    const infoSem = this.periodoAtual === '7dias'
      ? infoSemanaSelecionada
      : CalendarEngine.obterSemanaPorOffset(0);

    const turnosSemana = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSem));
    const resumoSemana = FinanceEngine.resumirLista(turnosSemana);

    const metaSemanal = StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL);
    const lucroSem = resumoSemana.somaLucro;
    const diasRodados = resumoSemana.diasTrabalhados;
    const pctSem = metaSemanal > 0 ? Math.min(100, Math.max(0, (lucroSem / metaSemanal) * 100)) : 0;

    const barra = document.getElementById('barraMetaSemanalFill');
    const txtInfo = document.getElementById('txtMetaSemanalInfo');
    const txtRitmo = document.getElementById('txtMetaSemanalRitmo');
    if (!barra || !txtInfo || !txtRitmo) return;

    barra.style.width = `${pctSem}%`;
    barra.classList.toggle('hit', lucroSem >= metaSemanal && metaSemanal > 0);

    const faltaSem = Math.max(0, metaSemanal - lucroSem);

    txtInfo.innerHTML = lucroSem >= metaSemanal
      ? `🏆 Semana ${infoSem.numStr} Batida! <strong>R$ ${lucroSem.toFixed(0)} / R$ ${metaSemanal.toFixed(0)}</strong> <span class="status-badge status-good" style="margin-left:4px;">${diasRodados}d rodados</span>`
      : `📅 Meta Semana ${infoSem.numStr}: <strong>R$ ${lucroSem.toFixed(0)} / R$ ${metaSemanal.toFixed(0)}</strong> <span style="color:var(--uber-muted); font-size:0.75rem;">(${diasRodados}d rodados)</span>`;

    if (lucroSem >= metaSemanal) {
      txtRitmo.innerHTML = `🔥 <b>Meta da Semana ${infoSem.numStr} concluída!</b> Lucro excedente: +R$ ${(lucroSem - metaSemanal).toFixed(2)}.`;
      return;
    }

    if (infoSem.ehSemanaAtual) {
      const hoje = new Date();
      const diaISO = hoje.getDay() === 0 ? 7 : hoje.getDay(); // Seg=1 .. Dom=7
      const diasRestantesAteDom = Math.max(1, 7 - diaISO + 1);
      const porDiaRestante = faltaSem / diasRestantesAteDom;
      txtRitmo.innerHTML = `Faltam <b>R$ ${faltaSem.toFixed(2)}</b> na Semana ${infoSem.numStr} (~<b>R$ ${porDiaRestante.toFixed(0)}/dia</b> nos ${diasRestantesAteDom} dia(s) até domingo).`;
    } else {
      txtRitmo.innerHTML = `Semana ${infoSem.numStr} (${infoSem.intervaloCurto}): faltaram R$ ${faltaSem.toFixed(2)} para a meta semanal.`;
    }
  },

  async editarMetaSemanal() {
    const atual = StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL);
    const val = await Sheet.pedirValor({
      icone: '📅',
      titulo: 'Meta líquida da semana',
      subtitulo: 'Quanto você quer fechar livre por semana (de Segunda a Domingo), já descontando combustível, manutenção e aluguel?',
      valorInicial: String(atual),
      prefixo: 'R$',
      atalhos: [1000, 1200, 1500, 2000],
      modoAtalho: 'definir',
      textoOk: 'Salvar meta semanal',
      variante: 'blue'
    });
    if (val === null || val <= 0) return;

    StorageService.salvarValor(KEYS.META_SEMANAL, val.toFixed(2));
    this.atualizarPainel();
    this.notificar('Meta semanal atualizada!');
  },

  renderizarInsightDiaSemana(turnos) {
    const container = document.getElementById('insightDiaSemana');
    if (!container) return;

    if (!turnos || turnos.length === 0) {
      container.style.display = 'none';
      return;
    }

    const nomesCompletos = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];

    const estatisticas = Array.from({ length: 7 }, (_, idx) => ({
      idx,
      nome: nomesCompletos[idx],
      somaLucro: 0,
      somaHoras: 0,
      somaKm: 0,
      diasUnicos: new Set()
    }));

    turnos.forEach(t => {
      const dt = this.parseData(t);
      const diaSemana = dt.getDay();
      const chaveData = t.dataISO || t.data || `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      const reg = estatisticas[diaSemana];
      reg.somaLucro += parseFloat(t.lucroLiquido) || 0;
      reg.somaHoras += parseFloat(t.horas) || 0;
      reg.somaKm += parseFloat(t.kmTotal) || 0;
      reg.diasUnicos.add(chaveData);
    });

    const ativos = estatisticas
      .filter(d => d.diasUnicos.size > 0)
      .map(d => {
        const qtdDias = d.diasUnicos.size;
        const mediaDia = d.somaLucro / qtdDias;
        const mediaHora = d.somaHoras > 0 ? (d.somaLucro / d.somaHoras) : 0;
        const mediaKm = d.somaKm > 0 ? (d.somaLucro / d.somaKm) : 0;
        return { ...d, qtdDias, mediaDia, mediaHora, mediaKm };
      });

    if (ativos.length === 0) {
      container.style.display = 'none';
      return;
    }

    const todosComHoras = ativos.every(d => d.mediaHora > 0);
    const criterio = d => (todosComHoras ? d.mediaHora : d.mediaDia);

    const ordenados = [...ativos].sort((a, b) => criterio(b) - criterio(a));
    const melhor = ordenados[0];
    const pior = ordenados[ordenados.length - 1];

    const formatarResumoDia = d => {
      const partes = [`Média: <b>R$ ${d.mediaDia.toFixed(0)}/dia</b>`];
      if (d.mediaHora > 0) partes.push(`<b>R$ ${d.mediaHora.toFixed(0)}/h</b>`);
      return partes.join(' • ');
    };

    container.style.display = 'block';

    if (ativos.length === 1) {
      container.innerHTML = `
        <div class="weekday-box" style="border-color:rgba(6,193,103,0.35);">
          <span class="weekday-box-tag" style="color:var(--uber-green);">🔥 Inteligência da Semana</span>
          <div class="weekday-box-day">${melhor.nome}</div>
          <div class="weekday-box-meta">
            ${formatarResumoDia(melhor)} • Salve turnos em outros dias da semana para descobrir o melhor dia p/ folga.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="weekday-insight-grid">
        <div class="weekday-box" style="border-color:rgba(6,193,103,0.4);">
          <span class="weekday-box-tag" style="color:var(--uber-green);">🔥 Melhor p/ Rodar</span>
          <div class="weekday-box-day">${melhor.nome}</div>
          <div class="weekday-box-meta">${formatarResumoDia(melhor)}</div>
        </div>
        <div class="weekday-box">
          <span class="weekday-box-tag" style="color:var(--uber-yellow);">🛠️ Ideal p/ Folga</span>
          <div class="weekday-box-day">${pior.nome}</div>
          <div class="weekday-box-meta">${formatarResumoDia(pior)}</div>
        </div>
      </div>
    `;
  },

  renderizarPrevisaoMeta(turnos, falta, bateuMeta) {
    const elRitmo = document.getElementById('txtMetaRitmo');
    if (!elRitmo) return;
    if (bateuMeta) {
      elRitmo.innerHTML = `🔥 <b>Parabéns!</b> Tudo o que você rodar hoje agora é lucro extra acima da meta diária.`;
      return;
    }
    if (turnos.length === 0) {
      elRitmo.textContent = 'Salve seu primeiro turno para ver a previsão de horas e corridas para bater a meta.';
      return;
    }

    let totLucro = 0, totHoras = 0, totCorridas = 0;
    turnos.slice(0, 14).forEach(t => {
      totLucro += parseFloat(t.lucroLiquido) || 0;
      totHoras += parseFloat(t.horas) || 0;
      totCorridas += parseInt(t.corridas) || 0;
    });

    const liqPorHora = totHoras > 0 ? (totLucro / totHoras) : 0;
    const liqPorCorrida = totCorridas > 0 ? (totLucro / totCorridas) : 0;

    const partes = [];
    if (liqPorHora > 0) {
      const horasRestantes = falta / liqPorHora;
      partes.push(`~<b>${this.formatarDuracaoMs(horasRestantes * 3600000)}</b> de pista`);
    }
    if (liqPorCorrida > 0) {
      const corridasRestantes = Math.max(1, Math.ceil(falta / liqPorCorrida));
      partes.push(`~<b>${corridasRestantes} corrida${corridasRestantes === 1 ? '' : 's'}</b>`);
    }

    elRitmo.innerHTML = partes.length > 0
      ? `⚡ No seu ritmo médio: faltam ${partes.join(' ou ')} para bater a meta de hoje.`
      : `Continue registrando horas e corridas para calcular seu ritmo automático.`;
  },

  renderizarGrafico7Dias(turnos, meta, infoSemanaSelecionada) {
    const container = document.getElementById('grafico7Dias');
    if (!container) return;

    const hojeStr = new Date().toLocaleDateString('pt-BR');
    let dias = [];

    // Quando estiver na aba "Semana", exibe de Segunda a Domingo daquela Semana do Ano (#1)
    if (this.periodoAtual === '7dias' && infoSemanaSelecionada) {
      dias = infoSemanaSelecionada.diasDaSemana.map(d => {
        const somaDia = turnos
          .filter(t => t.data === d.dataBR)
          .reduce((acc, t) => acc + (parseFloat(t.lucroLiquido) || 0), 0);

        return {
          rotulo: d.rotulo,
          valor: somaDia,
          ehHoje: d.dataBR === hojeStr
        };
      });
    } else {
      const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const hoje = new Date();

      for (let i = 6; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
        const dataBR = d.toLocaleDateString('pt-BR');
        const somaDia = turnos
          .filter(t => t.data === dataBR)
          .reduce((acc, t) => acc + (parseFloat(t.lucroLiquido) || 0), 0);

        dias.push({
          rotulo: i === 0 ? 'Hoje' : nomesDias[d.getDay()],
          valor: somaDia,
          ehHoje: i === 0
        });
      }
    }

    const maxVal = Math.max(meta || 200, ...dias.map(d => d.valor), 50);

    container.innerHTML = dias.map(d => {
      const alturaPct = d.valor > 0 ? Math.max(8, Math.min(100, Math.round((d.valor / maxVal) * 100))) : 4;
      const classesBarra = [
        'chart-bar',
        d.ehHoje ? 'today' : '',
        d.valor >= meta && meta > 0 ? 'hit-goal' : ''
      ].filter(Boolean).join(' ');

      const txtVal = d.valor > 0 ? `R$${Math.round(d.valor)}` : '—';
      return `
        <div class="chart-col">
          <span class="chart-val">${txtVal}</span>
          <div class="chart-bar-wrap">
            <div class="${classesBarra}" style="height:${alturaPct}%"></div>
          </div>
          <span class="chart-day" style="${d.ehHoje ? 'color:var(--uber-white);' : ''}">${d.rotulo}</span>
        </div>
      `;
    }).join('');
  },

  /* ==========================================================================
     FERRAMENTAS DE PISTA: VALE A CORRIDA?, TROCA DE ÓLEO E CUSTOS FIXOS
     ========================================================================== */
  renderizarFerramentasPista(turnos) {
    const kmProxOleo = StorageService.obterNumero(KEYS.KM_PROX_OLEO, 0);
    const custoFixoMes = StorageService.obterNumero(KEYS.CUSTO_FIXO_MES, 0);
    const ultimoComKm = turnos.find(t => t.kmFinal && t.kmFinal > 0);
    const kmAtual = ultimoComKm ? Number(ultimoComKm.kmFinal) : 0;

    const badge = document.getElementById('badgeOleoStatus');
    const info = document.getElementById('infoManutencaoFixo');
    if (!badge || !info) return;

    const linhasInfo = [];

    if (kmProxOleo > 0 && kmAtual > 0) {
      const faltaKm = kmProxOleo - kmAtual;
      if (faltaKm <= 0) {
        badge.className = 'status-badge status-bad';
        badge.textContent = '🛢️ Trocar Óleo!';
        linhasInfo.push(`⚠️ <b style="color:var(--uber-red)">Troca de óleo vencida há ${Math.abs(faltaKm)} km!</b> (Meta: ${kmProxOleo} km)`);
      } else if (faltaKm <= 600) {
        badge.className = 'status-badge status-warn';
        badge.textContent = `🛢️ Óleo: ${faltaKm} km`;
        linhasInfo.push(`🔔 Faltam <b style="color:var(--uber-yellow)">${faltaKm} km</b> para a troca de óleo (${kmProxOleo} km).`);
      } else {
        badge.className = 'status-badge status-good';
        badge.textContent = `🛢️ Óleo: ${faltaKm} km`;
        linhasInfo.push(`🛢️ Próxima troca de óleo em <b>${kmProxOleo} km</b> (faltam ${faltaKm} km).`);
      }
    } else if (kmProxOleo > 0) {
      badge.className = 'status-badge status-good';
      badge.textContent = `🛢️ ${kmProxOleo} km`;
      linhasInfo.push(`🛢️ Troca de óleo programada para <b>${kmProxOleo} km</b>.`);
    } else {
      badge.className = 'status-badge status-warn';
      badge.textContent = '🛢️ Definir Óleo';
    }

    if (custoFixoMes > 0) {
      const custoDia = (custoFixoMes / 26).toFixed(2);
      linhasInfo.push(`📅 Custo fixo: <b>R$ ${custoFixoMes.toFixed(0)}/mês</b> (~<b>R$ ${custoDia}/dia</b> p/ 26 dias).`);
      const campoDiaria = document.getElementById('diariaCarro');
      if (campoDiaria && !campoDiaria.value) {
        campoDiaria.placeholder = `Sugerido: ${custoDia}`;
      }
    }

    info.innerHTML = linhasInfo.join('<br>') || 'Toque nos botões acima para simular uma corrida, programar troca de óleo ou calcular seu custo fixo diário.';
  },

  simularCorrida() {
    const valor = this.lerNumero('simValor');
    const km = this.lerNumero('simKm');
    const min = this.lerNumero('simMin');
    const out = document.getElementById('resultadoSimulador');
    if (!out) return;

    if (valor <= 0 || km <= 0) {
      out.innerHTML = 'Digite o valor da oferta (R$) e os KMs totais (incluindo buscar o passageiro).';
      return;
    }

    const custoKmManut = StorageService.obterNumero(KEYS.CUSTO_KM, DEFAULTS.CUSTO_KM);
    const kml = StorageService.obterNumero(KEYS.CONSUMO_KML, 10);
    const precoLitro = StorageService.obterNumero(KEYS.PRECO_LITRO, 5.80);
    const custoCombKm = kml > 0 ? (precoLitro / kml) : 0.55;

    const custoTotalCorrida = km * (custoKmManut + custoCombKm);
    const lucroCorrida = valor - custoTotalCorrida;
    const reaisPorKmBruto = valor / km;
    const reaisPorKmLiq = lucroCorrida / km;
    const ganhoHoraLiq = min > 0 ? (lucroCorrida / (min / 60)) : 0;

    let veredito = '🟢 <b>VALE A PENA ACEITAR!</b>';
    let cor = 'var(--uber-green)';
    if (reaisPorKmLiq < 0.85 || (min > 0 && ganhoHoraLiq < 22)) {
      veredito = '🔴 <b>RECUSAR (Margem baixa / Prejuízo)</b>';
      cor = 'var(--uber-red)';
    } else if (reaisPorKmLiq < 1.30 || (min > 0 && ganhoHoraLiq < 32)) {
      veredito = '🟡 <b>CORRIDA MÉDIA (Avalie o destino)</b>';
      cor = 'var(--uber-yellow)';
    }

    out.innerHTML = `
      <div style="padding:10px; border-radius:10px; background:var(--uber-surface-elevated); border-left:4px solid ${cor}; margin-top:4px;">
        <div style="color:${cor}; font-size:0.88rem; margin-bottom:4px;">${veredito}</div>
        <div style="color:var(--uber-white); font-weight:700;">
          Lucro Livre: R$ ${lucroCorrida.toFixed(2)} • Líq: R$ ${reaisPorKmLiq.toFixed(2)}/km
          ${min > 0 ? ` • R$ ${ganhoHoraLiq.toFixed(0)}/h` : ''}
        </div>
        <div style="font-size:0.74rem; color:var(--uber-muted); margin-top:2px;">
          Bruto: R$ ${reaisPorKmBruto.toFixed(2)}/km • Custo estimado da corrida: R$ ${custoTotalCorrida.toFixed(2)}
        </div>
      </div>
    `;
  },

  async configurarTrocaOleo() {
    const turnos = StorageService.obterTurnos();
    const ultimoComKm = turnos.find(t => t.kmFinal && t.kmFinal > 0);
    const kmAtual = ultimoComKm ? Number(ultimoComKm.kmFinal) : 0;
    const salvo = StorageService.obterNumero(KEYS.KM_PROX_OLEO, kmAtual > 0 ? kmAtual + 7000 : 50000);

    const novoKm = await Sheet.pedirValor({
      icone: '🛢️',
      titulo: 'Próxima troca de óleo',
      subtitulo: kmAtual > 0
        ? `Seu último odômetro salvo é <b>${kmAtual} km</b>. Com quantos KM será a próxima troca?`
        : 'Digite o KM do odômetro em que você deve fazer a próxima troca de óleo:',
      valorInicial: String(salvo),
      sufixo: 'km',
      inteiro: true,
      atalhos: [5000, 7000, 10000],
      modoAtalho: 'somar',
      textoOk: 'Salvar alerta de óleo',
      variante: 'green'
    });
    if (novoKm === null || novoKm <= 0) return;

    StorageService.salvarValor(KEYS.KM_PROX_OLEO, novoKm);
    this.atualizarPainel();
    this.notificar(`Alerta de troca de óleo salvo para ${novoKm} km!`);
  },

  async configurarCustoFixoMensal() {
    const atual = StorageService.obterNumero(KEYS.CUSTO_FIXO_MES, 0);
    const novoValor = await Sheet.pedirValor({
      icone: '📅',
      titulo: 'Custos fixos do mês',
      subtitulo: 'Some IPVA + Seguro/Proteção + Parcela ou Aluguel mensal + Celular. O app divide por 26 dias trabalhados para achar seu custo fixo diário.',
      valorInicial: atual > 0 ? String(atual) : '',
      prefixo: 'R$',
      atalhos: [300, 600, 1200, 2000],
      modoAtalho: 'definir',
      permitirVazio: true,
      textoOk: 'Salvar custo mensal',
      variante: 'blue'
    });
    if (novoValor === null) return;

    StorageService.salvarValor(KEYS.CUSTO_FIXO_MES, novoValor);
    if (novoValor > 0) {
      const diaria = (novoValor / 26).toFixed(2);
      document.getElementById('diariaCarro').value = diaria;
      Rascunho.salvar();
      this.notificar(`Custo fixo diário (R$ ${diaria}/dia) preenchido!`);
    } else {
      this.notificar('Custo fixo mensal zerado.');
    }
    this.atualizarPainel();
  },

  async editarMetaDiaria() {
    const atual = StorageService.obterNumero(KEYS.META_DIARIA, DEFAULTS.META_DIARIA);
    const val = await Sheet.pedirValor({
      icone: '🎯',
      titulo: 'Meta diária',
      subtitulo: 'Quanto você quer colocar no bolso por dia, já descontando todos os gastos?',
      valorInicial: String(atual),
      prefixo: 'R$',
      atalhos: [150, 200, 250, 300],
      modoAtalho: 'definir',
      textoOk: 'Salvar meta',
      variante: 'green'
    });
    if (val === null || val <= 0) return;

    StorageService.salvarValor(KEYS.META_DIARIA, val.toFixed(2));
    this.atualizarPainel();
    this.notificar('Meta diária atualizada!');
  },

  /* ==========================================================================
     HISTÓRICO DE ATIVIDADES AGRUPADO POR SEMANA DO ANO (#4) & FILTRO RÁPIDO (#6)
     ========================================================================== */
  filtrarHistoricoPorCiclo(valorFiltro) {
    this.filtroHistorico = valorFiltro || 'todos';
    this.renderizarHistorico();
  },

  toggleDetalhesTurno(id) {
    const card = document.getElementById(`card-turno-${id}`);
    const hint = document.getElementById(`hint-turno-${id}`);
    if (!card) return;
    const abriu = card.classList.toggle('open');
    if (hint) {
      hint.textContent = abriu ? '▴ Ocultar' : '▾ Raio-X';
    }
  },

  renderizarHistorico() {
    const turnos = StorageService.obterTurnos();
    const container = document.getElementById('listaHistorico');
    const selectFiltro = document.getElementById('filtroSemanaHistorico');

    if (turnos.length === 0) {
      if (selectFiltro) selectFiltro.style.display = 'none';
      container.innerHTML = `
        <div style="text-align:center; padding:28px 12px; color:var(--uber-muted); font-size:0.86rem;">
          Nenhum turno salvo ainda. Inicie ou feche seu dia para ver suas estatísticas!
        </div>
      `;
      return;
    }

    // Agrupa todos os turnos por Semana do Ano ISO para popular o filtro rápido (#6)
    const todosGruposSemana = CalendarEngine.agruparTurnosPorSemana(turnos);

    // Também coleta os meses disponíveis
    const mapaMeses = new Map();
    turnos.forEach(t => {
      const dt = this.parseData(t);
      const chaveMes = `MES:${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!mapaMeses.has(chaveMes)) {
        mapaMeses.set(chaveMes, {
          chave: chaveMes,
          rotulo: `${CalendarEngine.MESES_COMPLETOS[dt.getMonth()]}/${dt.getFullYear()}`,
          qtd: 0,
          lucro: 0
        });
      }
      const m = mapaMeses.get(chaveMes);
      m.qtd += 1;
      m.lucro += parseFloat(t.lucroLiquido) || 0;
    });

    if (selectFiltro) {
      selectFiltro.style.display = 'block';
      const opcoesSemana = todosGruposSemana.map(g =>
        `<option value="SEM:${g.chaveSemana}" ${this.filtroHistorico === `SEM:${g.chaveSemana}` ? 'selected' : ''}>` +
        `📅 Semana ${g.numStr}/${g.anoISO} (${g.intervaloCurto}) — Líq: R$ ${g.somaLucro.toFixed(0)} (${g.turnos.length}t)` +
        `</option>`
      ).join('');

      const opcoesMes = Array.from(mapaMeses.values()).map(m =>
        `<option value="${m.chave}" ${this.filtroHistorico === m.chave ? 'selected' : ''}>` +
        `🗓️ Mês: ${m.rotulo} — Líq: R$ ${m.lucro.toFixed(0)} (${m.qtd}t)` +
        `</option>`
      ).join('');

      selectFiltro.innerHTML = `
        <option value="todos" ${this.filtroHistorico === 'todos' ? 'selected' : ''}>📋 Todas as Semanas (${turnos.length} turnos)</option>
        <optgroup label="Filtrar por Semana do Ano (Seg–Dom)">
          ${opcoesSemana}
        </optgroup>
        <optgroup label="Filtrar por Mês">
          ${opcoesMes}
        </optgroup>
      `;
    }

    // Filtra turnos conforme a seleção (#6)
    const turnosFiltrados = turnos.filter(t => {
      if (!this.filtroHistorico || this.filtroHistorico === 'todos') return true;
      const dt = this.parseData(t);
      if (this.filtroHistorico.startsWith('SEM:')) {
        const chaveAlvo = this.filtroHistorico.replace('SEM:', '');
        return CalendarEngine.obterInfoSemanaISO(dt).chaveSemana === chaveAlvo;
      }
      if (this.filtroHistorico.startsWith('MES:')) {
        const chaveMes = `MES:${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        return chaveMes === this.filtroHistorico;
      }
      return true;
    });

    const gruposExibidos = CalendarEngine.agruparTurnosPorSemana(turnosFiltrados);
    const diasCurto = CalendarEngine.DIAS_CURTOS;

    container.innerHTML = gruposExibidos.map(grupo => {
      const totalAno = CalendarEngine.totalSemanasNoAnoISO(grupo.anoISO);
      const cardsHTML = grupo.turnos.map(item => {
        const dt = this.parseData(item);
        const diaSem = diasCurto[dt.getDay()];
        const fatNum = Number(item.faturamento || 0);
        const cusNum = Number(item.custosTotais || 0);
        const combNum = Number(item.combustivel || 0);
        const alimNum = Number(item.alimentacao || 0);
        const diarNum = Number(item.diariaCarro || 0);
        const outrNum = Number(item.outrosGastos || 0);
        const manutNum = Number(item.provisaoManut || 0);

        const fat = item.faturamento !== undefined ? `Bruto: R$ ${fatNum.toFixed(2)}` : '';
        const cus = item.custosTotais !== undefined ? `Custos: R$ ${cusNum.toFixed(2)}` : '';
        const hrs = item.horas ? `${item.horas}h (R$ ${item.liquidoHora}/h)` : '';

        const textoOdometro = (item.kmInicial > 0 && item.kmFinal > 0)
          ? `${item.kmInicial} → ${item.kmFinal} km (${item.kmTotal} km)`
          : `${item.kmTotal} km rodados`;

        const textoCorridas = item.corridas > 0
          ? `${item.corridas} (${item.ticketMedio ? `R$ ${item.ticketMedio}/corr.` : ''})`
          : 'Não informado';

        return `
          <div id="card-turno-${item.id}" class="activity-item" onclick="UIController.toggleDetalhesTurno('${item.id}')">
            <div class="act-header">
              <span class="act-title">${item.data} (${diaSem}) • ${item.kmTotal} km</span>
              <div style="display:flex; align-items:center; gap:6px;" onclick="event.stopPropagation()">
                <span class="act-net">R$ ${item.lucroLiquido}</span>
                <button class="chip-btn" style="padding:3px 7px;" onclick="UIController.compartilharTurnoId('${item.id}')" title="Copiar p/ WhatsApp">📲</button>
                <button class="chip-btn" style="padding:3px 7px;" onclick="UIController.editarTurno('${item.id}')" title="Editar turno">✎</button>
                <button class="chip-btn" style="padding:3px 7px;" onclick="UIController.excluirTurno('${item.id}')" title="Excluir">✕</button>
              </div>
            </div>
            <div class="act-meta">
              ${fat ? `<span>${fat}</span>` : ''}
              ${cus ? `<span>• ${cus}</span>` : ''}
              <span>• R$ ${item.liquidoKm}/km</span>
              ${hrs ? `<span>• ${hrs}</span>` : ''}
              <span id="hint-turno-${item.id}" class="act-toggle-hint">▾ Raio-X</span>
            </div>

            <div class="act-details-panel" onclick="event.stopPropagation()">
              <div class="act-detail-section-title">🛣️ Operação e Eficiência</div>
              <div style="background:var(--uber-black); border:1px solid var(--uber-border); border-radius:var(--radius-sm); padding:8px 10px;">
                <div class="act-detail-row">
                  <span>Odômetro</span>
                  <span>${textoOdometro}</span>
                </div>
                <div class="act-detail-row">
                  <span>Horas líquidas na pista</span>
                  <span>${item.horas > 0 ? `${item.horas}h (R$ ${item.liquidoHora}/h)` : 'Não informado'}</span>
                </div>
                <div class="act-detail-row">
                  <span>Viagens / Ticket médio</span>
                  <span>${textoCorridas}</span>
                </div>
                <div class="act-detail-row">
                  <span>Ganho Bruto vs. Líquido / KM</span>
                  <span>R$ ${item.brutoKm || '0.00'}/km → <b style="color:var(--uber-green)">R$ ${item.liquidoKm}/km</b></span>
                </div>
              </div>

              <div class="act-detail-section-title">💸 Raio-X dos Custos (Total: R$ ${cusNum.toFixed(2)})</div>
              <div style="background:var(--uber-black); border:1px solid var(--uber-border); border-radius:var(--radius-sm); padding:8px 10px;">
                <div class="act-detail-row">
                  <span>⛽ Combustível</span>
                  <span>R$ ${combNum.toFixed(2)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🛠️ Reserva de Manutenção (KM)</span>
                  <span>R$ ${manutNum.toFixed(2)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🍽️ Alimentação / Água</span>
                  <span>R$ ${alimNum.toFixed(2)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🚗 Diária / Aluguel / Fixo</span>
                  <span>R$ ${diarNum.toFixed(2)}</span>
                </div>
                <div class="act-detail-row">
                  <span>📦 Outros (Pedágio, Lavagem...)</span>
                  <span>R$ ${outrNum.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="week-group-header">
          <div>
            <div class="week-group-title">📅 Semana ${grupo.numStr}/${totalAno} (${grupo.anoISO}) • ${grupo.intervaloCurto}</div>
            <div class="week-group-sub">${grupo.diasUnicos.size} dia(s) • Bruto: R$ ${grupo.somaBruto.toFixed(2)} • ${grupo.somaKm.toFixed(0)} km</div>
          </div>
          <div class="week-group-right">
            <span class="week-group-net">R$ ${grupo.somaLucro.toFixed(2)}</span>
            <button type="button" class="chip-btn" style="padding:4px 8px;" onclick="UIController.compartilharSemana('${grupo.chaveSemana}')" title="Copiar Resumo da Semana p/ WhatsApp">📲</button>
          </div>
        </div>
        ${cardsHTML}
      `;
    }).join('');
  },

  compartilharSemana(chaveSemana) {
    const turnos = StorageService.obterTurnos();
    const grupos = CalendarEngine.agruparTurnosPorSemana(turnos);
    const g = grupos.find(x => x.chaveSemana === chaveSemana);
    if (!g) return;

    const liqKm = g.somaKm > 0 ? (g.somaLucro / g.somaKm).toFixed(2) : '0.00';
    const liqHora = g.somaHoras > 0 ? (g.somaLucro / g.somaHoras).toFixed(2) : '0.00';

    const texto =
      `🖤 *FECHAMENTO SEMANA ${g.numStr}/${g.anoISO} (${g.intervaloCurto})*\n` +
      `🗓️ *Dias Rodados:* ${g.diasUnicos.size} dia(s) (${g.turnos.length} turnos)\n` +
      `💰 *Faturamento Bruto:* R$ ${g.somaBruto.toFixed(2)}\n` +
      `⛽ *Custos Totais:* R$ ${g.somaCustos.toFixed(2)}\n` +
      `✅ *LUCRO LÍQUIDO LIVRE:* R$ ${g.somaLucro.toFixed(2)}\n` +
      `🛣️ *KM Total:* ${g.somaKm.toFixed(0)} km (Líq: R$ ${liqKm}/km)` +
      (g.somaHoras > 0 ? `\n⏱️ *Horas:* ${g.somaHoras.toFixed(1)}h (Líq: R$ ${liqHora}/h)` : '');

    navigator.clipboard.writeText(texto).then(() => {
      this.notificar(`Resumo da Semana ${g.numStr} copiado p/ WhatsApp!`);
    });
  },

  compartilharTurnoId(id) {
    const reg = StorageService.obterTurnos().find(t => String(t.id) === String(id));
    if (!reg) return;
    const texto =
      `🖤 *FECHAMENTO MEU TURNO (${reg.data})*\n` +
      `💰 *Bruto:* R$ ${Number(reg.faturamento || 0).toFixed(2)}\n` +
      `⛽ *Custos Totais:* R$ ${Number(reg.custosTotais || 0).toFixed(2)}\n` +
      `✅ *LUCRO LÍQUIDO:* R$ ${reg.lucroLiquido}\n` +
      `🛣️ *KM:* ${reg.kmTotal} km (Líq: R$ ${reg.liquidoKm}/km)` +
      (reg.horas > 0 ? `\n⏱️ *Horas:* ${reg.horas}h (Líq: R$ ${reg.liquidoHora}/h)` : '');

    navigator.clipboard.writeText(texto).then(() => {
      this.notificar(`Resumo de ${reg.data} copiado p/ WhatsApp!`);
    });
  },

  editarTurno(id) {
    const reg = StorageService.obterTurnos().find(t => String(t.id) === String(id));
    if (!reg) return;

    this.idTurnoEditando = reg.id;
    document.getElementById('bannerModoEdicao').style.display = 'block';
    document.getElementById('txtModoEdicao').textContent = `✏️ Editando turno de ${reg.data}`;

    if (reg.dataISO) document.getElementById('dataTurno').value = reg.dataISO;
    document.getElementById('horasTrabalhadas').value = reg.horas || '';
    document.getElementById('kmInicial').value = reg.kmInicial || '';
    document.getElementById('kmFinal').value = reg.kmFinal || '';
    document.getElementById('kmTotalInput').value = reg.kmTotal || '';
    document.getElementById('corridas').value = reg.corridas || '';
    document.getElementById('faturamento').value = reg.faturamento || '';
    document.getElementById('combustivel').value = reg.combustivel || '';
    document.getElementById('alimentacao').value = reg.alimentacao || '';
    document.getElementById('diariaCarro').value = reg.diariaCarro || '';
    document.getElementById('outrosGastos').value = reg.outrosGastos || '';

    this.navegarAba('fechar');
    this.notificar(`Editando turno de ${reg.data}. Altere e toque em Salvar!`);
  },

  cancelarEdicaoTurno(mostrarAviso = true) {
    this.idTurnoEditando = null;
    const banner = document.getElementById('bannerModoEdicao');
    if (banner) banner.style.display = 'none';
    Rascunho.limpar();
    document.getElementById('dataTurno').value = this.hojeISO();
    if (mostrarAviso) this.notificar('Edição cancelada.');
  },

  async excluirTurno(id) {
    const turnos = StorageService.obterTurnos();
    const alvo = turnos.find(t => String(t.id) === String(id));
    if (!alvo) return;

    const ok = await Sheet.confirmar({
      icone: '🗑️',
      titulo: 'Excluir este turno?',
      subtitulo: `${alvo.data} • ${alvo.kmTotal} km • Lucro <b>R$ ${alvo.lucroLiquido}</b><br>Se errar, dá pra desfazer em <b>Pontos de restauração</b>.`,
      textoOk: 'Excluir turno',
      variante: 'danger'
    });
    if (!ok) return;

    await Cofre.criarPonto(`Antes de excluir turno de ${alvo.data}`);
    StorageService.salvarTurnos(turnos.filter(t => String(t.id) !== String(id)));
    this.atualizarTudo();
    this.notificar('Turno removido.');
  },

  async limparTodoHistorico() {
    const total = StorageService.obterTurnos().length;
    if (total === 0) return this.notificar('O histórico já está vazio.');

    const ok = await Sheet.confirmar({
      icone: '⚠️',
      titulo: 'Apagar todo o histórico?',
      subtitulo: `Os <b>${total} turno(s)</b> serão apagados deste celular. Uma cópia fica guardada em <b>Pontos de restauração</b>, mas o ideal é salvar um backup antes.`,
      textoOk: 'Apagar tudo',
      variante: 'danger'
    });
    if (!ok) return;

    await Cofre.criarPonto(`Antes de apagar todo o histórico (${total} turnos)`);
    StorageService.salvarTurnos([]);
    this.atualizarTudo();
    document.getElementById('boxResultado').style.display = 'none';
    this.notificar('Histórico apagado.');
  },

  exportarCSV() {
    const turnos = StorageService.obterTurnos();
    if (turnos.length === 0) {
      this.notificar('Nenhum turno para exportar.');
      return;
    }

    const cols = [
      'Data', 'Semana_Ano', 'KM_Total', 'Horas', 'Corridas', 'Faturamento_Bruto',
      'Combustivel', 'Alimentacao', 'Diaria_Carro', 'Outros_Gastos',
      'Reserva_Manutencao', 'Custo_Total', 'Lucro_Liquido', 'Liquido_KM', 'Ticket_Medio'
    ];

    const linhas = turnos.map(t => {
      const infoSem = CalendarEngine.obterInfoSemanaISO(this.parseData(t));
      return [
        t.data || '', infoSem.chaveSemana, t.kmTotal || 0, t.horas || 0, t.corridas || 0, t.faturamento || 0,
        t.combustivel || 0, t.alimentacao || 0, t.diariaCarro || 0, t.outrosGastos || 0,
        t.provisaoManut || 0, t.custosTotais || 0, t.lucroLiquido || 0, t.liquidoKm || 0, t.ticketMedio || 0
      ].join(';');
    });

    const blob = new Blob(['\uFEFF' + cols.join(';') + '\n' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meu-turno-uber-${this.hojeISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.notificar('Planilha CSV baixada!');
  },

  /* ==========================================================================
     SEGURANÇA DE DADOS, BACKUP COMPLETO (JSON) E PONTOS DE RESTAURAÇÃO
     ========================================================================== */
  async renderizarSegurancaDados() {
    const turnos = StorageService.obterTurnos();
    const infoBackup = StorageGuard.obterInfoUltimoBackup();
    const lblTotal = document.getElementById('lblTotalHistorico');
    if (lblTotal) lblTotal.textContent = `${turnos.length} registro(s)`;

    const textoUltimoBackup = infoBackup
      ? `Último backup externo: <b style="color:#fff;">${infoBackup.dataFormatada}</b> (${infoBackup.qtdTurnos} turnos)`
      : `<span style="color:var(--uber-yellow);">Você ainda não salvou um arquivo de backup externo.</span>`;

    const elInfo = document.getElementById('infoSegurancaDados');
    if (elInfo) {
      elInfo.innerHTML = `
        <div>• <b>Cofre Duplo Local:</b> Salvo em <code>localStorage</code> + <code>IndexedDB</code> (${turnos.length} turnos).</div>
        <div style="margin-top:4px;">• ${textoUltimoBackup}</div>
      `;
    }

    const banner = document.getElementById('bannerBackup');
    if (banner) {
      const turnosSemBackup = infoBackup ? (turnos.length - (infoBackup.qtdTurnos || 0)) : turnos.length;
      if (turnos.length > 0 && turnosSemBackup >= 5) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="font-size:0.82rem;">
              <strong style="color:var(--uber-yellow);">🛡️ Proteja seus ganhos</strong><br>
              <span style="color:var(--uber-muted);">Você tem ${turnosSemBackup} turnos novos sem backup externo.</span>
            </div>
            <button class="chip-btn" style="background:var(--uber-yellow); color:#000; border:none; padding:8px 12px;" onclick="UIController.exportarBackupJSON()">
              Salvar Backup
            </button>
          </div>
        `;
      } else {
        banner.style.display = 'none';
      }
    }

    const contPontos = document.getElementById('listaPontosRestauracao');
    if (!contPontos) return;
    const pontos = await Cofre.listarPontos();
    if (pontos.length === 0) {
      contPontos.innerHTML = `<div style="font-size:0.78rem; color:var(--uber-muted);">Os pontos de restauração aparecem aqui automaticamente antes de qualquer exclusão.</div>`;
      return;
    }

    contPontos.innerHTML = pontos.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--uber-border); font-size:0.78rem;">
        <div>
          <b style="color:#fff;">${p.motivo}</b><br>
          <span style="color:var(--uber-muted);">${p.dataHora} • ${p.qtdTurnos} turno(s)</span>
        </div>
        <button type="button" class="chip-btn" onclick="UIController.restaurarPonto(${p.id})">Restaurar</button>
      </div>
    `).join('');
  },

  async exportarBackupJSON() {
    const turnos = StorageService.obterTurnos();
    if (turnos.length === 0) {
      this.notificar('Nenhum turno salvo para fazer backup.');
      return;
    }

    const pacote = {
      app: 'meu-turno',
      versao: 3,
      exportadoEm: new Date().toISOString(),
      configuracoes: {
        metaDiaria: StorageService.obterNumero(KEYS.META_DIARIA, DEFAULTS.META_DIARIA),
        metaSemanal: StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL),
        custoKm: StorageService.obterNumero(KEYS.CUSTO_KM, DEFAULTS.CUSTO_KM),
        consumoKmL: StorageService.obterNumero(KEYS.CONSUMO_KML, 0),
        precoLitro: StorageService.obterNumero(KEYS.PRECO_LITRO, 0)
      },
      turnos
    };

    const jsonStr = JSON.stringify(pacote, null, 2);
    const nomeArquivo = `backup-meu-turno-${this.hojeISO()}.json`;
    const arquivo = new File([jsonStr], nomeArquivo, { type: 'application/json' });

    StorageGuard.registrarBackupExterno(turnos.length);
    this.renderizarSegurancaDados();

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({
          title: 'Backup Meu Turno',
          text: `Backup com ${turnos.length} turno(s) do app Meu Turno.`,
          files: [arquivo]
        });
        this.notificar('Backup compartilhado com sucesso!');
        return;
      } catch {}
    }

    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
    this.notificar('Arquivo de Backup salvo no aparelho!');
  },

  async importarBackupArquivo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const texto = await file.text();
      const dados = JSON.parse(texto);
      const listaImportada = Array.isArray(dados) ? dados : (Array.isArray(dados.turnos) ? dados.turnos : null);

      if (!listaImportada || listaImportada.length === 0) {
        this.notificar('Arquivo inválido ou sem turnos.');
        return;
      }

      const atuais = StorageService.obterTurnos();
      const ok = await Sheet.confirmar({
        icone: '📥',
        titulo: 'Restaurar Backup',
        subtitulo: `O arquivo contém <b>${listaImportada.length} turno(s)</b>. Eles serão mesclados com seus <b>${atuais.length} turno(s)</b> atuais sem duplicar registros.`,
        textoOk: 'Restaurar agora',
        variante: 'green'
      });
      if (!ok) return;

      await Cofre.criarPonto(`Antes de restaurar backup (${atuais.length} turnos)`);

      const mapa = new Map();
      [...listaImportada, ...atuais].forEach((t, idx) => {
        if (!t) return;
        const chave = t.id ? String(t.id) : `${t.data}_${t.kmTotal}_${t.faturamento}_${idx}`;
        if (!mapa.has(chave)) mapa.set(chave, t);
      });

      const mesclados = Array.from(mapa.values());
      StorageService.salvarTurnos(mesclados);

      if (dados.configuracoes) {
        if (dados.configuracoes.metaDiaria) StorageService.salvarValor(KEYS.META_DIARIA, dados.configuracoes.metaDiaria);
        if (dados.configuracoes.metaSemanal) StorageService.salvarValor(KEYS.META_SEMANAL, dados.configuracoes.metaSemanal);
        if (dados.configuracoes.custoKm) StorageService.salvarValor(KEYS.CUSTO_KM, dados.configuracoes.custoKm);
      }

      StorageGuard.registrarBackupExterno(mesclados.length);
      this.atualizarTudo();
      this.notificar(`${mesclados.length} turno(s) disponíveis após restauração!`);
    } catch {
      this.notificar('Erro ao ler o arquivo de backup.');
    }
  },

  async restaurarPonto(idPonto) {
    const pontos = await Cofre.listarPontos();
    const alvo = pontos.find(p => p.id === idPonto);
    if (!alvo) return;

    const ok = await Sheet.confirmar({
      icone: '⏪',
      titulo: 'Voltar para este ponto?',
      subtitulo: `Restaurar <b>${alvo.qtdTurnos} turno(s)</b> do ponto <i>"${alvo.motivo}"</i> (${alvo.dataHora})?`,
      textoOk: 'Sim, restaurar',
      variante: 'green'
    });
    if (!ok) return;

    StorageService.salvarTurnos(alvo.turnos);
    this.atualizarTudo();
    this.notificar('Turnos restaurados com sucesso!');
  },

  async instalarPWA() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    document.getElementById('btnInstall').style.display = 'none';
  }
};

window.addEventListener('DOMContentLoaded', () => UIController.iniciar());

window.addEventListener('storage', (e) => {
  if (!e.key || Object.values(KEYS).includes(e.key)) {
    UIController.renderizarTurnoVivo();
    UIController.atualizarPainel();
    UIController.renderizarHistorico();
    UIController.renderizarSegurancaDados();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  UIController.deferredPrompt = e;
  document.getElementById('btnInstall').style.display = 'inline-block';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
