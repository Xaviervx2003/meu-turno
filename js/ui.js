/* ==========================================================================
   MÓDULO 5: UI CONTROLLER (INTERAÇÃO, NAVEGAÇÃO, SEMANAS DO ANO & RENDERIZAÇÃO)
   ========================================================================== */
const UIController = {
  periodoAtual: 'hoje',
  abaMetaAtiva: 'dia',
  offsetSemana: 0,
  offsetMes: 0,
  indiceBarraSelecionada: null,
  ultimosDiasGrafico: [],
  filtroHistorico: 'todos',
  ultimoTextoWhatsApp: '',
  deferredPrompt: null,
  idTurnoEditando: null,
  tagsSelecionadas: [],

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

    FinanceEngine.ocultarValores = localStorage.getItem(KEYS.MODO_PRIVACIDADE) === '1';
    this.sincronizarIconePrivacidade();

    this.atualizarTudo();

    setInterval(() => {
      if (StorageService.obterTurnoAtivo() && !Sheet._resolver) this.renderizarTurnoVivo();
    }, 30000);
  },

  alternarPrivacidade() {
    FinanceEngine.ocultarValores = !FinanceEngine.ocultarValores;
    StorageService.salvarValor(KEYS.MODO_PRIVACIDADE, FinanceEngine.ocultarValores ? '1' : '0');
    this.sincronizarIconePrivacidade();
    this.atualizarTudo();
    this.notificar(
      FinanceEngine.ocultarValores
        ? '🙈 Modo privacidade ativado (valores ocultos)'
        : '👁️ Valores visíveis novamente'
    );
  },

  sincronizarIconePrivacidade() {
    const icone = document.getElementById('iconePrivacidade');
    const pill = document.getElementById('btnPillPrivacidade');
    if (icone) icone.textContent = FinanceEngine.ocultarValores ? '🙈' : '👁️';
    if (pill) pill.setAttribute('aria-pressed', String(FinanceEngine.ocultarValores));
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
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });

    document.getElementById(`tab-${aba}`).classList.add('active');
    const btnAba = document.getElementById(`nav-${aba}`);
    if (btnAba) {
      btnAba.classList.add('active');
      btnAba.setAttribute('aria-current', 'page');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  abrirResumoSemanaRapido() {
    this.navegarAba('painel');
    const btnSemana = document.getElementById('seg-7dias');
    this.mudarPeriodo('7dias', btnSemana);
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
        <div class="card-header-row compact">
          <h2 class="card-title">Pronto para rodar?</h2>
          <span class="text-muted-sm">Salva hora e KM inicial</span>
        </div>
        <button type="button" class="btn-uber-go" onclick="UIController.iniciarTurnoNaPista()">
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
    const brutoParcial = ativo.faturamentoParcial || 0;
    const lucroParcial = brutoParcial - totalGastosParciais;

    card.classList.toggle('active-shift', !emPausa);
    card.classList.toggle('paused-shift', emPausa);
    dot.classList.toggle('online', !emPausa);
    dot.classList.toggle('paused', emPausa);
    txt.textContent = emPausa ? 'Em Pausa' : 'Em Turno';

    const horaSegura = StorageService.escaparHTML(ativo.horaFormatada || '');
    const badgeHTML = emPausa
      ? `<span class="status-badge status-warn">☕ PAUSA (${this.formatarDuracaoMs(pausaAtualMs)})</span>`
      : `<span class="status-badge status-good">🟢 DESDE ${horaSegura}</span>`;

    const botaoPausaHTML = emPausa
      ? `<button type="button" class="btn-uber-green mb-12" onclick="UIController.alternarPausaTurno()">
           ▶ Retomar Turno (Voltar p/ Pista)
         </button>`
      : `<button type="button" class="btn-uber-pause" onclick="UIController.alternarPausaTurno()">
           <span>☕ Pausar p/ Almoço ou Descanso</span>
         </button>`;

    card.innerHTML = `
      <div class="card-header-row compact">
        ${badgeHTML}
        <span class="status-badge">⏱️ ${this.formatarDuracaoMs(tempoLiquidoMs)}${ativo.kmInicial ? ` • KM ${Number(ativo.kmInicial)}` : ''}</span>
      </div>
      <div class="kpi-row mb-12">
        <button type="button" class="kpi-tile clickable" onclick="UIController.lancarGanhoParcial()" title="Toque para atualizar quanto já fez hoje">
          <span>💰 Bruto Parcial</span>
          <strong>${FinanceEngine.moeda(brutoParcial)}</strong>
        </button>
        <div class="kpi-tile">
          <span>💸 Gastos Rua</span>
          <strong>${FinanceEngine.moeda(totalGastosParciais)}</strong>
        </div>
        <button type="button" class="kpi-tile clickable" onclick="UIController.lancarGanhoParcial()" title="Toque para atualizar quanto já fez hoje">
          <span>✅ Livre Agora</span>
          <strong class="${lucroParcial >= 0 ? 'text-green' : 'text-red'}">${FinanceEngine.moeda(lucroParcial)}</strong>
        </button>
      </div>

      ${botaoPausaHTML}

      <div class="live-shift-section-label">Lançar rápido na rua (toque p/ anotar):</div>
      <div class="quick-expense-grid">
        <button type="button" class="quick-exp-btn" onclick="UIController.lancarGanhoParcial()">
          <span>💰</span>+ Ganhos
          <small>${FinanceEngine.moedaCurta(brutoParcial)}</small>
        </button>
        <button type="button" class="quick-exp-btn" onclick="UIController.lancarGastoRapido('combustivel', 'Combustível / GNV', '⛽')">
          <span>⛽</span>+ Combust.
          <small>${FinanceEngine.moedaCurta(ativo.combustivel || 0)}</small>
        </button>
        <button type="button" class="quick-exp-btn" onclick="UIController.lancarGastoRapido('alimentacao', 'Alimentação / Água', '🍔')">
          <span>🍔</span>+ Refeição
          <small>${FinanceEngine.moedaCurta(ativo.alimentacao || 0)}</small>
        </button>
      </div>

      <div class="grid-2">
        <button type="button" class="btn-uber-primary" onclick="UIController.prepararEncerramentoTurno()">
          🏁 Encerrar Turno
        </button>
        <button type="button" class="btn-uber-ghost" onclick="UIController.cancelarTurnoVivo()">
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
      faturamentoParcial: 0,
      combustivel: 0,
      alimentacao: 0,
      outrosGastos: 0
    });

    this.renderizarTurnoVivo();
    this.atualizarPainel();
    this.notificar('Bom trabalho! Turno iniciado.');
  },

  async lancarGanhoParcial() {
    const ativo = StorageService.obterTurnoAtivo();
    if (!ativo) return;

    const atual = ativo.faturamentoParcial || 0;
    const valor = await Sheet.pedirValor({
      icone: '💰',
      titulo: 'Faturamento parcial de hoje',
      subtitulo: 'Digite quanto está marcando de Bruto total nos apps agora (ou use os botões p/ somar). A Meta de Hoje atualiza na hora!',
      valorInicial: atual > 0 ? String(atual) : '',
      placeholder: '0,00',
      prefixo: 'R$',
      atalhos: [50, 100, 150, 200],
      modoAtalho: 'somar',
      permitirVazio: true,
      textoOk: 'Atualizar parcial',
      variante: 'green'
    });
    if (valor === null) return;

    ativo.faturamentoParcial = Number(valor.toFixed(2));
    StorageService.salvarTurnoAtivo(ativo);
    this.renderizarTurnoVivo();
    this.atualizarPainel();
    this.notificar(`Bruto parcial atualizado: ${FinanceEngine.moeda(valor)}!`);
  },

  async lancarGastoRapido(campo, nomeAmigavel, icone) {
    const ativo = StorageService.obterTurnoAtivo();
    if (!ativo) return;

    const acumulado = ativo[campo] || 0;
    const valor = await Sheet.pedirValor({
      icone: icone || '💸',
      titulo: nomeAmigavel,
      subtitulo: `Quanto você gastou agora? Já anotado neste turno: <b>${FinanceEngine.moeda(acumulado, true)}</b>`,
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
    this.atualizarPainel();
    this.notificar(`+ ${FinanceEngine.moeda(valor)} somado em ${nomeAmigavel}!`);
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
    if (ativo.faturamentoParcial > 0) document.getElementById('faturamento').value = ativo.faturamentoParcial.toFixed(2);
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
    const inputFim = document.getElementById('kmFinal');
    const erroKm = kmIni > 0 && kmFim > 0 && kmFim < kmIni;
    if (inputFim) inputFim.classList.toggle('input-error', erroKm);

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

  alternarTagTurno(tag) {
    const idx = this.tagsSelecionadas.indexOf(tag);
    if (idx === -1) {
      this.tagsSelecionadas.push(tag);
    } else {
      this.tagsSelecionadas.splice(idx, 1);
    }
    this.sincronizarPillsTags();
  },

  sincronizarPillsTags() {
    document.querySelectorAll('#listaTagsTurno .tag-pill').forEach(btn => {
      const ativo = this.tagsSelecionadas.includes(btn.dataset.tag);
      btn.classList.toggle('active', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    });
  },

  async salvarFechamento() {
    const obsTexto = (document.getElementById('obsTurno')?.value || '').trim().slice(0, 60);
    const entrada = {
      dataISO: document.getElementById('dataTurno').value,
      horas: this.lerNumero('horasTrabalhadas'),
      kmIni: this.lerNumero('kmInicial'),
      kmFim: this.lerNumero('kmFinal'),
      kmDireto: this.lerNumero('kmTotalInput'),
      corridas: Math.round(this.lerNumero('corridas')),
      ganhoUber: this.lerNumero('ganhoUber'),
      ganho99: this.lerNumero('ganho99'),
      ganhoOutros: this.lerNumero('ganhoOutros'),
      faturamento: this.lerNumero('faturamento'),
      combustivel: this.lerNumero('combustivel'),
      alimentacao: this.lerNumero('alimentacao'),
      diariaCarro: this.lerNumero('diariaCarro'),
      outrosGastos: this.lerNumero('outrosGastos'),
      custoKm: this.lerNumero('custoKm')
    };

    if (entrada.kmIni > 0 && entrada.kmFim > 0 && entrada.kmFim < entrada.kmIni) {
      const inputFim = document.getElementById('kmFinal');
      if (inputFim) {
        inputFim.classList.add('input-error');
        inputFim.focus();
      }
      this.notificar('⚠️ KM Final não pode ser menor que o KM Inicial!');
      return;
    }

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
      ganhoUber: Number(entrada.ganhoUber.toFixed(2)),
      ganho99: Number(entrada.ganho99.toFixed(2)),
      ganhoOutros: Number(entrada.ganhoOutros.toFixed(2)),
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
      ticketMedio: calc.ticketMedio,
      tags: [...this.tagsSelecionadas],
      obs: obsTexto
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
        this.tagsSelecionadas = [];
        this.sincronizarPillsTags();
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
        subtitulo: `Já existe um fechamento de <b>${StorageService.escaparHTML(duplicado.data)}</b> com os mesmos valores (Lucro <b>${FinanceEngine.moeda(duplicado.lucroLiquido, true)}</b>). Salvar outra vez vai duplicar seus ganhos.`,
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
    this.tagsSelecionadas = [];
    this.sincronizarPillsTags();
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
        <strong>Recibo • ${StorageService.escaparHTML(reg.data)}</strong>
        <span class="status-badge ${avaliacao.classe}">${avaliacao.rotulo}</span>
      </div>
      <div class="receipt-row"><span>KM Total Rodado</span><span>${reg.kmTotal} km</span></div>
      <div class="receipt-row"><span>Faturamento Bruto</span><span>${FinanceEngine.moeda(reg.faturamento)}</span></div>
      <div class="receipt-row"><span>Despesas do Dia</span><span class="text-red">- ${FinanceEngine.moeda(calc.gastosDiretos)}</span></div>
      <div class="receipt-row"><span>Reserva Manutenção (KM)</span><span class="text-yellow">- ${FinanceEngine.moeda(calc.provisaoManut)}</span></div>
      <div class="receipt-row"><span>Ganho por KM (Bruto / Líq.)</span><span>${FinanceEngine.moeda(reg.brutoKm)} / <b>${FinanceEngine.moeda(reg.liquidoKm)}</b></span></div>
      ${reg.horas > 0 ? `<div class="receipt-row"><span>Ganho Líquido por Hora</span><span>${FinanceEngine.moeda(reg.liquidoHora)}/h</span></div>` : ''}
      <div class="receipt-row"><span>Ticket Médio (${reg.corridas} corridas)</span><span>${FinanceEngine.moeda(reg.ticketMedio)}</span></div>
      <div class="receipt-total">
        <span>Lucro Líquido (${calc.margemLiquida}%)</span>
        <span style="color:${corLucro}">${FinanceEngine.moeda(reg.lucroLiquido)}</span>
      </div>
      <button type="button" class="btn-uber-ghost mt-16" onclick="UIController.copiarWhatsApp()">
        📲 Copiar Resumo para WhatsApp
      </button>
    `;

    this.ultimoTextoWhatsApp =
      `🖤 *FECHAMENTO MEU TURNO (${reg.data})*\n` +
      `💰 *Bruto:* ${FinanceEngine.moeda(reg.faturamento, true)}\n` +
      `⛽ *Custos Totais:* ${FinanceEngine.moeda(reg.custosTotais, true)}\n` +
      `✅ *LUCRO LÍQUIDO:* ${FinanceEngine.moeda(reg.lucroLiquido, true)} (${calc.margemLiquida}%)\n` +
      `🛣️ *KM:* ${reg.kmTotal} km (Líq: ${FinanceEngine.moeda(reg.liquidoKm, true)}/km)\n` +
      (reg.horas > 0 ? `⏱️ *Horas:* ${reg.horas}h (Líq: ${FinanceEngine.moeda(reg.liquidoHora, true)}/h)\n` : '') +
      `🏁 *Corridas:* ${reg.corridas} (Ticket: ${FinanceEngine.moeda(reg.ticketMedio, true)})`;
  },

  copiarWhatsApp() {
    if (!this.ultimoTextoWhatsApp) return;
    navigator.clipboard.writeText(this.ultimoTextoWhatsApp).then(() => {
      this.notificar('Resumo copiado para colar no WhatsApp!');
    });
  },

  /* ==========================================================================
     PAINEL DE GANHOS, SEMANAS DO ANO (01–52), COMPARATIVO & CARD DE METAS UNIFICADO
     ========================================================================== */
  mudarPeriodo(periodo, btn) {
    this.periodoAtual = periodo;
    this.indiceBarraSelecionada = null;
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }

    // Sincroniza automaticamente a aba do Card de Meta com o período escolhido
    if (periodo === '7dias') {
      this.abaMetaAtiva = 'semana';
    } else if (periodo === 'mes') {
      this.abaMetaAtiva = 'mes';
    } else if (periodo === 'hoje') {
      this.abaMetaAtiva = 'dia';
    }

    this.atualizarPainel();
  },

  alternarAbaMeta(modo) {
    this.abaMetaAtiva = modo;
    this.atualizarPainel();
  },

  editarMetaAtiva() {
    if (this.abaMetaAtiva === 'semana') {
      this.editarMetaSemanal();
    } else if (this.abaMetaAtiva === 'mes') {
      this.editarMetaMensal();
    } else {
      this.editarMetaDiaria();
    }
  },

  navegarCiclo(delta) {
    this.indiceBarraSelecionada = null;
    if (this.periodoAtual === '7dias') {
      this.offsetSemana = Math.min(0, this.offsetSemana + delta);
    } else if (this.periodoAtual === 'mes') {
      this.offsetMes = Math.min(0, this.offsetMes + delta);
    }
    this.atualizarPainel();
  },

  voltarCicloAtual() {
    this.indiceBarraSelecionada = null;
    this.offsetSemana = 0;
    this.offsetMes = 0;
    this.atualizarPainel();
  },

  atualizarPainel() {
    const turnos = StorageService.obterTurnos();
    const ativo = StorageService.obterTurnoAtivo();
    const agora = new Date();
    const hojeStr = agora.toLocaleDateString('pt-BR');

    // Atualiza o badge da Semana Atual no canto direito da Top Bar
    const semanaHoje = CalendarEngine.obterSemanaPorOffset(0);
    const badgeSemanaTopo = document.getElementById('badgeSemanaTopo');
    if (badgeSemanaTopo) {
      badgeSemanaTopo.textContent = `S${semanaHoje.numStr}`;
      badgeSemanaTopo.title = `Semana ${semanaHoje.numStr}/${semanaHoje.totalAno} (${semanaHoje.intervaloCurto})`;
    }

    // Inclui lucro parcial do turno ao vivo na rua (se houver faturamento parcial informado)
    const lucroParcialVivo = ativo && (ativo.faturamentoParcial > 0 || ativo.combustivel > 0 || ativo.alimentacao > 0 || ativo.outrosGastos > 0)
      ? (ativo.faturamentoParcial || 0) - ((ativo.combustivel || 0) + (ativo.alimentacao || 0) + (ativo.outrosGastos || 0))
      : 0;

    const lucroSalvoHoje = turnos
      .filter(t => t.data === hojeStr)
      .reduce((acc, t) => acc + (parseFloat(t.lucroLiquido) || 0), 0);

    const lucroHoje = lucroSalvoHoje + (ativo && ativo.faturamentoParcial > 0 ? lucroParcialVivo : 0);

    document.getElementById('pillLucroHoje').textContent = FinanceEngine.moeda(lucroHoje);

    const infoSemanaSelecionada = CalendarEngine.obterSemanaPorOffset(this.offsetSemana);
    const infoMesSelecionado = CalendarEngine.obterMesPorOffset(this.offsetMes);

    this.renderizarBarraNavegacaoCiclo(infoSemanaSelecionada, infoMesSelecionado);

    let filtrados = [];
    let filtradosAnteriores = [];
    let rotuloAnterior = '';

    if (this.periodoAtual === 'hoje') {
      filtrados = turnos.filter(t => t.data === hojeStr);
      document.getElementById('lblPeriodoTitulo').textContent = 'LUCRO LÍQUIDO (HOJE)';
    } else if (this.periodoAtual === '7dias') {
      filtrados = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSemanaSelecionada));
      filtradosAnteriores = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSemanaSelecionada.anterior));
      rotuloAnterior = `Semana ${infoSemanaSelecionada.anterior.numStr}`;
      document.getElementById('lblPeriodoTitulo').textContent =
        `LUCRO • SEMANA ${infoSemanaSelecionada.numStr}/${infoSemanaSelecionada.totalAno}`;
    } else if (this.periodoAtual === 'mes') {
      filtrados = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoMesSelecionado));
      filtradosAnteriores = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoMesSelecionado.anterior));
      rotuloAnterior = infoMesSelecionado.anterior.rotuloCurto;
      document.getElementById('lblPeriodoTitulo').textContent =
        `LUCRO • ${infoMesSelecionado.rotuloMes.toUpperCase()}`;
    } else {
      filtrados = turnos;
      document.getElementById('lblPeriodoTitulo').textContent = 'LUCRO LÍQUIDO (GERAL)';
    }

    const resumoAtual = FinanceEngine.resumirLista(filtrados);
    const resumoAnterior = FinanceEngine.resumirLista(filtradosAnteriores);

    const elLucro = document.getElementById('kpiLucroLiquido');
    const lucroExibido = this.periodoAtual === 'hoje' ? lucroHoje : resumoAtual.somaLucro;
    elLucro.textContent = FinanceEngine.moeda(lucroExibido);
    elLucro.style.color = lucroExibido >= 0 ? 'var(--uber-white)' : 'var(--uber-red)';

    document.getElementById('kpiBruto').textContent = FinanceEngine.moeda(
      this.periodoAtual === 'hoje' && ativo?.faturamentoParcial > 0
        ? resumoAtual.somaBruto + ativo.faturamentoParcial
        : resumoAtual.somaBruto
    );
    document.getElementById('kpiCustos').textContent = FinanceEngine.moeda(resumoAtual.somaCustos);
    document.getElementById('kpiTurnosCount').textContent =
      this.periodoAtual === 'hoje'
        ? `${filtrados.length} turno${filtrados.length === 1 ? '' : 's'}${ativo ? ' + ao vivo' : ''}`
        : `${resumoAtual.diasTrabalhados}d • ${filtrados.length}t`;

    document.getElementById('kpiMediaKm').textContent = FinanceEngine.moeda(resumoAtual.mediaKm);
    document.getElementById('kpiMediaHora').textContent =
      resumoAtual.somaHoras > 0 ? `${FinanceEngine.moeda(resumoAtual.mediaHora)}/h` : '—';
    document.getElementById('kpiKmRodado').textContent = `${resumoAtual.somaKm.toFixed(0)} km`;

    this.renderizarDivisaoApps(resumoAtual);
    this.renderizarComparativoPeriodo(resumoAtual.somaLucro, resumoAnterior.somaLucro, rotuloAnterior);

    const metaDiaria = StorageService.obterNumero(KEYS.META_DIARIA, DEFAULTS.META_DIARIA);
    this.renderizarCardMetaUnificada(turnos, lucroHoje, metaDiaria, infoSemanaSelecionada, infoMesSelecionado);
    this.renderizarGrafico7Dias(turnos, metaDiaria, infoSemanaSelecionada, infoMesSelecionado);
    this.renderizarInsightDiaSemana(turnos);
    this.renderizarFerramentasPista(turnos);
  },

  renderizarDivisaoApps(resumo) {
    const box = document.getElementById('barraAppsPeriodo');
    if (!box) return;

    const totalApps = (resumo.somaUber || 0) + (resumo.soma99 || 0) + (resumo.somaOutrosApps || 0);
    if (totalApps <= 0) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    const pctUber = Math.round(((resumo.somaUber || 0) / totalApps) * 100);
    const pct99 = Math.round(((resumo.soma99 || 0) / totalApps) * 100);
    const pctOutros = Math.max(0, 100 - pctUber - pct99);

    const partes = [];
    if (resumo.somaUber > 0) partes.push(`<span>🔵 Uber: <b>${pctUber}%</b> (${FinanceEngine.moedaCurta(resumo.somaUber)})</span>`);
    if (resumo.soma99 > 0) partes.push(`<span>🟡 99: <b>${pct99}%</b> (${FinanceEngine.moedaCurta(resumo.soma99)})</span>`);
    if (resumo.somaOutrosApps > 0) partes.push(`<span>🟢 Pix/Part.: <b>${pctOutros}%</b> (${FinanceEngine.moedaCurta(resumo.somaOutrosApps)})</span>`);

    box.innerHTML = `
      <div class="app-split-labels">${partes.join('')}</div>
      <div class="app-split-track">
        ${pctUber > 0 ? `<div class="app-split-seg uber" style="width:${pctUber}%"></div>` : ''}
        ${pct99 > 0 ? `<div class="app-split-seg pop99" style="width:${pct99}%"></div>` : ''}
        ${pctOutros > 0 ? `<div class="app-split-seg outros" style="width:${pctOutros}%"></div>` : ''}
      </div>
    `;
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
        ? `<button type="button" class="chip-btn" onclick="UIController.voltarCicloAtual()">Atual</button>`
        : `<span class="status-badge status-good">ATUAL</span>`;

      nav.innerHTML = `
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(-1)" title="Semana anterior">◀</button>
        <div class="period-nav-center">
          <span class="period-nav-title">
            <span>📅 Semana ${infoSemana.numStr}/${infoSemana.totalAno}</span>
            ${btnHoje}
          </span>
          <span class="period-nav-sub">Seg–Dom • ${infoSemana.intervaloCurto} (${infoSemana.anoISO})</span>
        </div>
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(1)" ${infoSemana.ehSemanaAtual ? 'disabled' : ''} title="Próxima semana">▶</button>
      `;
    } else if (this.periodoAtual === 'mes') {
      const btnAtual = !infoMes.ehMesAtual
        ? `<button type="button" class="chip-btn" onclick="UIController.voltarCicloAtual()">Atual</button>`
        : `<span class="status-badge status-good">ATUAL</span>`;

      nav.innerHTML = `
        <button type="button" class="period-nav-btn" onclick="UIController.navegarCiclo(-1)" title="Mês anterior">◀</button>
        <div class="period-nav-center">
          <span class="period-nav-title">
            <span>🗓️ ${infoMes.rotuloMes}</span>
            ${btnAtual}
          </span>
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
      el.innerHTML = `<span class="text-muted-sm">📊 Sem registros em <b>${rotuloAnterior}</b> para comparar.</span>`;
      return;
    }

    const diff = lucroAtual - lucroAnterior;
    const pct = Math.round((diff / lucroAnterior) * 100);
    const sinal = diff >= 0 ? '+' : '-';
    const classeCor = diff >= 0 ? 'text-green' : 'text-yellow';
    const icone = diff >= 0 ? '🟢' : '🟡';

    el.innerHTML = `
      ${icone} <span class="${classeCor}">${sinal}${FinanceEngine.moeda(Math.abs(diff))} (${diff >= 0 ? '+' : ''}${pct}%)</span>
      <span class="text-muted-sm">vs. ${rotuloAnterior} (${FinanceEngine.moeda(lucroAnterior)})</span>
    `;
  },

  renderizarCardMetaUnificada(turnos, lucroHoje, metaDiaria, infoSemanaSelecionada, infoMesSelecionado) {
    const btnDia = document.getElementById('btnAbaMetaDia');
    const btnSem = document.getElementById('btnAbaMetaSemana');
    const btnMes = document.getElementById('btnAbaMetaMes');
    const btnEditar = document.getElementById('btnEditarMetaUnificada');
    const txtInfo = document.getElementById('txtMetaUnificadaInfo');
    const barra = document.getElementById('barraMetaUnificadaFill');
    const txtRitmo = document.getElementById('txtMetaUnificadaRitmo');
    if (!btnDia || !btnSem || !txtInfo || !barra || !txtRitmo) return;

    const modo = this.abaMetaAtiva || 'dia';
    btnDia.classList.toggle('active', modo === 'dia');
    btnDia.setAttribute('aria-pressed', String(modo === 'dia'));
    btnSem.classList.toggle('active', modo === 'semana');
    btnSem.setAttribute('aria-pressed', String(modo === 'semana'));
    if (btnMes) {
      btnMes.classList.toggle('active', modo === 'mes');
      btnMes.setAttribute('aria-pressed', String(modo === 'mes'));
    }
    btnEditar.textContent = modo === 'semana' ? 'Editar sem.' : (modo === 'mes' ? 'Editar mês' : 'Editar dia');

    if (modo === 'dia') {
      const pctDia = metaDiaria > 0 ? Math.min(100, Math.max(0, (lucroHoje / metaDiaria) * 100)) : 0;
      const faltaDia = Math.max(0, metaDiaria - lucroHoje);
      const bateuDia = lucroHoje >= metaDiaria && metaDiaria > 0;

      barra.className = 'goal-fill';
      barra.style.width = `${pctDia}%`;

      txtInfo.innerHTML = bateuDia
        ? `🏆 Meta de Hoje Batida! <strong>${FinanceEngine.moeda(lucroHoje)} / ${FinanceEngine.moeda(metaDiaria)}</strong>`
        : `🎯 Meta Hoje: <strong>${FinanceEngine.moeda(metaDiaria)}</strong> <span class="text-muted-sm">(Falta ${FinanceEngine.moeda(faltaDia)})</span>`;

      txtRitmo.innerHTML = this.obterTextoPrevisaoMetaDiaria(turnos, faltaDia, bateuDia);
      return;
    }

    if (modo === 'mes') {
      const infoM = this.periodoAtual === 'mes' && infoMesSelecionado
        ? infoMesSelecionado
        : CalendarEngine.obterMesPorOffset(0);

      const turnosMes = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoM));
      const resumoMes = FinanceEngine.resumirLista(turnosMes);
      const metaMensal = StorageService.obterNumero(KEYS.META_MENSAL, DEFAULTS.META_MENSAL);
      const lucroMes = resumoMes.somaLucro;
      const diasRodadosMes = resumoMes.diasTrabalhados;
      const pctMes = metaMensal > 0 ? Math.min(100, Math.max(0, (lucroMes / metaMensal) * 100)) : 0;
      const bateuMes = lucroMes >= metaMensal && metaMensal > 0;
      const faltaMes = Math.max(0, metaMensal - lucroMes);

      barra.className = `goal-fill weekly ${bateuMes ? 'hit' : ''}`;
      barra.style.width = `${pctMes}%`;

      txtInfo.innerHTML = bateuMes
        ? `🏆 Meta de ${infoM.nomeMes} Batida! <strong>${FinanceEngine.moedaCurta(lucroMes)} / ${FinanceEngine.moedaCurta(metaMensal)}</strong>`
        : `🗓️ ${infoM.nomeMes}: <strong>${FinanceEngine.moedaCurta(lucroMes)} / ${FinanceEngine.moedaCurta(metaMensal)}</strong> <span class="text-muted-sm">(${diasRodadosMes}d)</span>`;

      if (bateuMes) {
        txtRitmo.innerHTML = `🔥 <b>Meta mensal concluída!</b> Excedente livre: +${FinanceEngine.moeda(lucroMes - metaMensal)}.`;
      } else if (diasRodadosMes > 0) {
        const mediaDiaMes = lucroMes / diasRodadosMes;
        const projecao26d = mediaDiaMes * 26;
        txtRitmo.innerHTML = `📈 Ritmo: <b>${FinanceEngine.moedaCurta(mediaDiaMes)}/dia</b> • Projeção p/ 26 dias: <b class="text-green">${FinanceEngine.moedaCurta(projecao26d)}</b> (Faltam ${FinanceEngine.moedaCurta(faltaMes)}).`;
      } else {
        txtRitmo.innerHTML = `Meta de ${infoM.nomeMes}: ${FinanceEngine.moeda(metaMensal)} (~${FinanceEngine.moedaCurta(metaMensal / 26)}/dia em 26 dias).`;
      }
      return;
    }

    // Modo Meta da Semana (Segunda a Domingo)
    const infoSem = this.periodoAtual === '7dias'
      ? infoSemanaSelecionada
      : CalendarEngine.obterSemanaPorOffset(0);

    const turnosSemana = turnos.filter(t => CalendarEngine.pertenceASemana(this.parseData(t), infoSem));
    const resumoSemana = FinanceEngine.resumirLista(turnosSemana);

    const metaSemanal = StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL);
    const lucroSem = resumoSemana.somaLucro;
    const diasRodados = resumoSemana.diasTrabalhados;
    const pctSem = metaSemanal > 0 ? Math.min(100, Math.max(0, (lucroSem / metaSemanal) * 100)) : 0;
    const bateuSem = lucroSem >= metaSemanal && metaSemanal > 0;
    const faltaSem = Math.max(0, metaSemanal - lucroSem);

    barra.className = `goal-fill weekly ${bateuSem ? 'hit' : ''}`;
    barra.style.width = `${pctSem}%`;

    txtInfo.innerHTML = bateuSem
      ? `🏆 Semana ${infoSem.numStr} Batida! <strong>${FinanceEngine.moedaCurta(lucroSem)} / ${FinanceEngine.moedaCurta(metaSemanal)}</strong> <span class="status-badge status-good">${diasRodados}d rodados</span>`
      : `📅 Semana ${infoSem.numStr}: <strong>${FinanceEngine.moedaCurta(lucroSem)} / ${FinanceEngine.moedaCurta(metaSemanal)}</strong> <span class="text-muted-sm">(${diasRodados}d rodados)</span>`;

    if (bateuSem) {
      txtRitmo.innerHTML = `🔥 <b>Meta da Semana ${infoSem.numStr} concluída!</b> Lucro excedente: +${FinanceEngine.moeda(lucroSem - metaSemanal)}.`;
    } else if (infoSem.ehSemanaAtual) {
      const hoje = new Date();
      const diaISO = hoje.getDay() === 0 ? 7 : hoje.getDay();
      const diasRestantesAteDom = Math.max(1, 7 - diaISO + 1);
      const porDiaRestante = faltaSem / diasRestantesAteDom;
      txtRitmo.innerHTML = `Faltam <b>${FinanceEngine.moeda(faltaSem)}</b> na Semana ${infoSem.numStr} (~<b>${FinanceEngine.moedaCurta(porDiaRestante)}/dia</b> nos ${diasRestantesAteDom} dia(s) até domingo).`;
    } else {
      txtRitmo.innerHTML = `Semana ${infoSem.numStr} (${infoSem.intervaloCurto}): faltaram ${FinanceEngine.moeda(faltaSem)} para a meta semanal.`;
    }
  },

  obterTextoPrevisaoMetaDiaria(turnos, falta, bateuMeta) {
    if (bateuMeta) {
      return `🔥 <b>Parabéns!</b> Tudo o que você rodar hoje agora é lucro extra acima da meta diária.`;
    }
    if (turnos.length === 0) {
      return 'Salve seu primeiro turno para ver a previsão de horas e corridas para bater a meta.';
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

    return partes.length > 0
      ? `⚡ No seu ritmo médio: faltam ${partes.join(' ou ')} para bater a meta de hoje.`
      : `Continue registrando horas e corridas para calcular seu ritmo automático.`;
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

  async editarMetaMensal() {
    const atual = StorageService.obterNumero(KEYS.META_MENSAL, DEFAULTS.META_MENSAL);
    const val = await Sheet.pedirValor({
      icone: '🗓️',
      titulo: 'Meta líquida do mês',
      subtitulo: 'Quanto você quer tirar livre no mês, já descontando todos os custos operacionais?',
      valorInicial: String(atual),
      prefixo: 'R$',
      atalhos: [4000, 5000, 6000, 7500],
      modoAtalho: 'definir',
      textoOk: 'Salvar meta mensal',
      variante: 'blue'
    });
    if (val === null || val <= 0) return;

    StorageService.salvarValor(KEYS.META_MENSAL, val.toFixed(2));
    this.atualizarPainel();
    this.notificar('Meta mensal atualizada!');
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
      const partes = [`Média: <b>${FinanceEngine.moedaCurta(d.mediaDia)}/dia</b>`];
      if (d.mediaHora > 0) partes.push(`<b>${FinanceEngine.moedaCurta(d.mediaHora)}/h</b>`);
      return partes.join(' • ');
    };

    container.style.display = 'block';

    if (ativos.length === 1) {
      container.innerHTML = `
        <div class="weekday-box highlight-green">
          <span class="weekday-box-tag text-green">🔥 Inteligência da Semana</span>
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
        <div class="weekday-box highlight-green">
          <span class="weekday-box-tag text-green">🔥 Melhor p/ Rodar</span>
          <div class="weekday-box-day">${melhor.nome}</div>
          <div class="weekday-box-meta">${formatarResumoDia(melhor)}</div>
        </div>
        <div class="weekday-box">
          <span class="weekday-box-tag text-yellow">🛠️ Ideal p/ Folga</span>
          <div class="weekday-box-day">${pior.nome}</div>
          <div class="weekday-box-meta">${formatarResumoDia(pior)}</div>
        </div>
      </div>
    `;
  },

  /* --- Gráfico Adaptativo (7 dias, Semanas do Mês ou Últimos 6 Meses) --- */
  montarDiasGrafico(turnos, infoSemanaSelecionada, infoMesSelecionado) {
    // Modo MÊS: mostra as Semanas ISO que compõem o mês selecionado
    if (this.periodoAtual === 'mes' && infoMesSelecionado) {
      const ano = infoMesSelecionado.ano;
      const mes = infoMesSelecionado.mes;
      const ultimoDia = new Date(ano, mes + 1, 0).getDate();
      const mapaSemanas = new Map();

      for (let dia = 1; dia <= ultimoDia; dia++) {
        const dt = new Date(ano, mes, dia, 12, 0, 0);
        const infoSem = CalendarEngine.obterInfoSemanaISO(dt);
        if (!mapaSemanas.has(infoSem.chaveSemana)) {
          mapaSemanas.set(infoSem.chaveSemana, infoSem);
        }
      }

      const semAtualChave = CalendarEngine.obterSemanaPorOffset(0).chaveSemana;
      return Array.from(mapaSemanas.values()).map(sem => {
        const turnosSem = turnos.filter(t => {
          const dt = this.parseData(t);
          return CalendarEngine.pertenceAoMes(dt, infoMesSelecionado) && CalendarEngine.pertenceASemana(dt, sem);
        });
        const resumo = FinanceEngine.resumirLista(turnosSem);
        return {
          rotulo: `S${sem.numStr}`,
          dataCompleta: `Semana ${sem.numStr} (${sem.intervaloCurto})`,
          valor: resumo.somaLucro,
          km: resumo.somaKm,
          horas: resumo.somaHoras,
          qtdTurnos: turnosSem.length,
          ehHoje: sem.chaveSemana === semAtualChave
        };
      });
    }

    // Modo TOTAL: mostra a evolução dos últimos 6 meses
    if (this.periodoAtual === 'tudo') {
      return Array.from({ length: 6 }, (_, i) => {
        const offset = -(5 - i);
        const infoM = CalendarEngine.obterMesPorOffset(offset);
        const turnosM = turnos.filter(t => CalendarEngine.pertenceAoMes(this.parseData(t), infoM));
        const resumo = FinanceEngine.resumirLista(turnosM);
        return {
          rotulo: CalendarEngine.MESES_CURTOS[infoM.mes].toUpperCase(),
          dataCompleta: infoM.rotuloMes,
          valor: resumo.somaLucro,
          km: resumo.somaKm,
          horas: resumo.somaHoras,
          qtdTurnos: turnosM.length,
          ehHoje: offset === 0
        };
      });
    }

    // Modo HOJE / SEMANA: mostra 7 dias
    const hojeStr = new Date().toLocaleDateString('pt-BR');
    const nomesDias = CalendarEngine.DIAS_CURTOS;

    let datas;
    if (this.periodoAtual === '7dias' && infoSemanaSelecionada) {
      datas = infoSemanaSelecionada.diasDaSemana.map(d => d.dataObj);
    } else {
      const hoje = new Date();
      datas = Array.from({ length: 7 }, (_, i) =>
        new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (6 - i), 12, 0, 0)
      );
    }

    return datas.map(dt => {
      const dataBR = dt.toLocaleDateString('pt-BR');
      const turnosDia = turnos.filter(t => t.data === dataBR);
      const resumo = FinanceEngine.resumirLista(turnosDia);
      const ehHoje = dataBR === hojeStr;
      const nome = nomesDias[dt.getDay()];
      return {
        rotulo: ehHoje ? 'Hoje' : nome,
        dataCompleta: `${nome}, ${CalendarEngine.formatarDiaMesCurto(dt)}`,
        valor: resumo.somaLucro,
        km: resumo.somaKm,
        horas: resumo.somaHoras,
        qtdTurnos: turnosDia.length,
        ehHoje
      };
    });
  },

  renderizarGrafico7Dias(turnos, metaDiaria, infoSemanaSelecionada, infoMesSelecionado) {
    const container = document.getElementById('grafico7Dias');
    if (!container) return;

    const meta = this.periodoAtual === 'mes'
      ? StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL)
      : (this.periodoAtual === 'tudo'
          ? StorageService.obterNumero(KEYS.META_MENSAL, DEFAULTS.META_MENSAL)
          : metaDiaria);

    const dias = this.montarDiasGrafico(turnos, infoSemanaSelecionada, infoMesSelecionado);
    this.ultimosDiasGrafico = dias;
    this.metaGraficoAtual = meta;
    container.style.gridTemplateColumns = `repeat(${dias.length}, 1fr)`;

    if (this.indiceBarraSelecionada !== null && !dias[this.indiceBarraSelecionada]) {
      this.indiceBarraSelecionada = null;
    }

    const titulo = document.getElementById('tituloGrafico');
    if (titulo) {
      if (this.periodoAtual === 'mes' && infoMesSelecionado) {
        titulo.textContent = `Semanas • ${infoMesSelecionado.nomeMes}`;
      } else if (this.periodoAtual === 'tudo') {
        titulo.textContent = 'Últimos 6 meses';
      } else if (this.periodoAtual === '7dias' && infoSemanaSelecionada) {
        titulo.textContent = `Semana ${infoSemanaSelecionada.numStr} • Seg–Dom`;
      } else {
        titulo.textContent = 'Últimos 7 dias';
      }
    }
    const legendaMeta = document.getElementById('legendaMetaValor');
    if (legendaMeta) {
      legendaMeta.textContent = meta > 0 ? `Meta ${FinanceEngine.moedaCurta(meta)}` : 'Sem meta';
    }

    // Escala com 18% de folga: a linha de meta e as barras nunca encostam nos rótulos de valor
    const maiorValor = Math.max(0, ...dias.map(d => d.valor));
    const escala = Math.max(meta || 0, maiorValor, 50) * 1.18;

    const linhaMetaHTML = meta > 0
      ? `<div class="chart-goal-line" style="bottom: calc(var(--chart-day-h) + var(--chart-bar-h) * ${(meta / escala).toFixed(4)});"></div>`
      : '';

    const colunasHTML = dias.map((d, idx) => {
      let classesBarra = 'chart-bar';
      let alturaPct = 0;

      if (d.valor > 0) {
        alturaPct = Math.max(6, Math.round((d.valor / escala) * 100));
        if (meta > 0 && d.valor >= meta) classesBarra += ' hit-goal';
        else if (d.ehHoje) classesBarra += ' today';
      } else if (d.valor < 0) {
        alturaPct = 6;
        classesBarra += ' negative';
      } else {
        classesBarra += ' empty';
      }

      // Dias sem turno não mostram rótulo (antes era "—", poluía o gráfico)
      const rotuloValor = d.valor !== 0
        ? (FinanceEngine.ocultarValores
            ? '•••'
            : `${d.valor < 0 ? '-' : ''}R$${Math.abs(Math.round(d.valor)).toLocaleString('pt-BR')}`)
        : '';
      const selecionado = this.indiceBarraSelecionada === idx;
      const aria = `${d.dataCompleta}: ${d.qtdTurnos > 0 ? FinanceEngine.moeda(d.valor) : 'sem turno'}`;

      return `
        <button type="button" class="chart-col ${selecionado ? 'selected' : ''}" data-idx="${idx}"
                aria-pressed="${selecionado}" aria-label="${aria}" onclick="UIController.selecionarBarraGrafico(${idx})">
          <span class="chart-val ${d.valor < 0 ? 'neg' : ''}">${rotuloValor}</span>
          <span class="chart-bar-wrap"><span class="${classesBarra}" style="height:${alturaPct}%"></span></span>
          <span class="chart-day ${d.ehHoje ? 'today-label' : ''}">${d.rotulo}</span>
        </button>
      `;
    }).join('');

    container.innerHTML = linhaMetaHTML + colunasHTML;
    container.classList.toggle('has-selection', this.indiceBarraSelecionada !== null);
    this.renderizarRodapeGrafico();
  },

  renderizarRodapeGrafico() {
    const rodape = document.getElementById('rodapeGrafico');
    if (!rodape) return;

    const dias = this.ultimosDiasGrafico || [];
    const meta = this.metaGraficoAtual || 0;
    const sel = this.indiceBarraSelecionada !== null ? dias[this.indiceBarraSelecionada] : null;

    // Modo detalhe: dia tocado
    if (sel) {
      rodape.classList.add('is-detail');
      if (sel.qtdTurnos === 0) {
        rodape.innerHTML = `<span>📅 <b>${sel.dataCompleta}</b></span><span>Sem turno registrado</span>`;
        return;
      }
      const partes = [`<b class="${sel.valor >= 0 ? 'text-green' : 'text-red'}">${FinanceEngine.moeda(sel.valor)}</b>`];
      if (sel.km > 0) partes.push(`${sel.km.toFixed(0)} km`);
      if (sel.horas > 0) partes.push(`${FinanceEngine.numeroBR(sel.horas, 1)}h`);
      if (meta > 0) partes.push(`${Math.round((sel.valor / meta) * 100)}% da meta`);

      rodape.innerHTML = `
        <span>📅 <b>${sel.dataCompleta}</b></span>
        <span class="dot-list">${partes.map(p => `<span>${p}</span>`).join('')}</span>
      `;
      return;
    }

    // Modo resumo (padrão): total das barras ativas + quantas bateram a meta
    rodape.classList.remove('is-detail');
    const diasRodados = dias.filter(d => d.qtdTurnos > 0);
    const nomeUnidade = this.periodoAtual === 'mes'
      ? (diasRodados.length === 1 ? 'semana' : 'semanas')
      : (this.periodoAtual === 'tudo'
          ? (diasRodados.length === 1 ? 'mês' : 'meses')
          : (diasRodados.length === 1 ? 'dia' : 'dias'));

    if (diasRodados.length === 0) {
      rodape.innerHTML = `<span>Nenhum turno neste período</span><span>Toque numa barra p/ ver detalhes</span>`;
      return;
    }

    const total = diasRodados.reduce((acc, d) => acc + d.valor, 0);
    const naMeta = meta > 0 ? diasRodados.filter(d => d.valor >= meta).length : 0;
    rodape.innerHTML = `
      <span>Total: <b>${FinanceEngine.moeda(total)}</b> em ${diasRodados.length} ${nomeUnidade}</span>
      <span>🎯 <b>${naMeta}/${diasRodados.length}</b> na meta</span>
    `;
  },

  /** Seleciona/desmarca um dia SEM redesenhar o gráfico (evita repetir a animação das barras) */
  selecionarBarraGrafico(idx) {
    this.indiceBarraSelecionada = this.indiceBarraSelecionada === idx ? null : idx;

    const container = document.getElementById('grafico7Dias');
    if (!container) return;

    container.querySelectorAll('.chart-col').forEach(col => {
      const ativo = Number(col.dataset.idx) === this.indiceBarraSelecionada;
      col.classList.toggle('selected', ativo);
      col.setAttribute('aria-pressed', String(ativo));
    });
    container.classList.toggle('has-selection', this.indiceBarraSelecionada !== null);

    this.renderizarRodapeGrafico();
    if (navigator.vibrate) navigator.vibrate(8);
  },

  /* ==========================================================================
     FERRAMENTAS DE PISTA: VALE A CORRIDA?, TROCA DE ÓLEO E CUSTOS FIXOS
     ========================================================================== */
  renderizarFerramentasPista(turnos) {
    const kmProxOleo = StorageService.obterNumero(KEYS.KM_PROX_OLEO, 0);
    const custoFixoMes = StorageService.obterNumero(KEYS.CUSTO_FIXO_MES, 0);
    const baixaManut = StorageService.obterNumero(KEYS.BAIXA_MANUT, 0);
    const ultimoComKm = turnos.find(t => t.kmFinal && t.kmFinal > 0);
    const kmAtual = ultimoComKm ? Number(ultimoComKm.kmFinal) : 0;

    const totalProvisao = turnos.reduce((acc, t) => acc + (parseFloat(t.provisaoManut) || 0), 0);
    const saldoCaixaManut = Math.max(0, totalProvisao - baixaManut);

    const badge = document.getElementById('badgeOleoStatus');
    const info = document.getElementById('infoManutencaoFixo');
    const kpisBox = document.getElementById('kpisManutencaoOleo');
    if (!badge || !info) return;

    const linhasInfo = [];
    let txtOleoKpi = 'Definir KM';
    let corOleoKpi = 'text-yellow';

    if (kmProxOleo > 0 && kmAtual > 0) {
      const faltaKm = kmProxOleo - kmAtual;
      if (faltaKm <= 0) {
        badge.className = 'status-badge status-bad';
        badge.textContent = '🛢️ Trocar Óleo!';
        txtOleoKpi = `Vencido (${Math.abs(faltaKm)} km)`;
        corOleoKpi = 'text-red';
        linhasInfo.push(`⚠️ <b class="text-red">Troca de óleo vencida há ${Math.abs(faltaKm)} km!</b> (Meta: ${kmProxOleo} km)`);
      } else if (faltaKm <= 600) {
        badge.className = 'status-badge status-warn';
        badge.textContent = `🛢️ Óleo: ${faltaKm} km`;
        txtOleoKpi = `Faltam ${faltaKm} km`;
        corOleoKpi = 'text-yellow';
        linhasInfo.push(`🔔 Faltam <b class="text-yellow">${faltaKm} km</b> para a troca de óleo (${kmProxOleo} km).`);
      } else {
        badge.className = 'status-badge status-good';
        badge.textContent = `🛢️ Óleo: ${faltaKm} km`;
        txtOleoKpi = `Faltam ${faltaKm} km`;
        corOleoKpi = 'text-green';
      }
    } else if (kmProxOleo > 0) {
      badge.className = 'status-badge status-good';
      badge.textContent = `🛢️ ${kmProxOleo} km`;
      txtOleoKpi = `Em ${kmProxOleo} km`;
      corOleoKpi = '';
    } else {
      badge.className = 'status-badge status-warn';
      badge.textContent = '🛢️ Definir Óleo';
    }

    if (kpisBox) {
      kpisBox.innerHTML = `
        <button type="button" class="kpi-tile clickable" onclick="UIController.gerenciarCaixaManutencao()" title="Toque para registrar gasto com oficina/peças">
          <span>🛠️ Caixa Manutenção</span>
          <strong class="text-green">${FinanceEngine.moeda(saldoCaixaManut)}</strong>
        </button>
        <button type="button" class="kpi-tile clickable" onclick="UIController.configurarTrocaOleo()" title="Toque para ajustar KM da próxima troca de óleo">
          <span>🛢️ Próxima Troca</span>
          <strong class="${corOleoKpi}">${txtOleoKpi}</strong>
        </button>
      `;
    }

    if (custoFixoMes > 0) {
      const custoDia = custoFixoMes / 26;
      linhasInfo.push(`📅 Custo fixo: <b>${FinanceEngine.moedaCurta(custoFixoMes)}/mês</b> (~<b>${FinanceEngine.moeda(custoDia)}/dia</b> p/ 26 dias).`);
      const campoDiaria = document.getElementById('diariaCarro');
      if (campoDiaria && !campoDiaria.value) {
        campoDiaria.placeholder = `Sugerido: ${custoDia.toFixed(2)}`;
      }
    }

    info.innerHTML = linhasInfo.join('<br>') || 'Toque em <b>Caixa Manutenção</b> quando usar a reserva na oficina.';
  },

  async gerenciarCaixaManutencao() {
    const turnos = StorageService.obterTurnos();
    const totalProvisao = turnos.reduce((acc, t) => acc + (parseFloat(t.provisaoManut) || 0), 0);
    const baixaAtual = StorageService.obterNumero(KEYS.BAIXA_MANUT, 0);
    const saldo = Math.max(0, totalProvisao - baixaAtual);

    const gastoOficina = await Sheet.pedirValor({
      icone: '🛠️',
      titulo: 'Caixa de Manutenção',
      subtitulo: `Você já acumulou <b>${FinanceEngine.moeda(saldo, true)}</b> livres na reserva por KM. Digite quanto gastou na oficina/peças para abater do caixa (ou 0 p/ cancelar):`,
      placeholder: '0,00',
      prefixo: 'R$',
      atalhos: [50, 100, 200, 350],
      modoAtalho: 'somar',
      permitirVazio: true,
      textoOk: 'Dar baixa no caixa',
      variante: 'green'
    });
    if (gastoOficina === null || gastoOficina <= 0) return;

    StorageService.salvarValor(KEYS.BAIXA_MANUT, (baixaAtual + gastoOficina).toFixed(2));
    this.atualizarPainel();
    this.notificar(`${FinanceEngine.moeda(gastoOficina)} abatidos do Caixa de Manutenção!`);
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
      <div class="sim-verdict-box" style="border-left-color:${cor};">
        <div class="sim-verdict-title" style="color:${cor};">${veredito}</div>
        <div class="sim-verdict-main">
          Lucro Livre: ${FinanceEngine.moeda(lucroCorrida)} • Líq: ${FinanceEngine.moeda(reaisPorKmLiq)}/km
          ${min > 0 ? ` • ${FinanceEngine.moedaCurta(ganhoHoraLiq)}/h` : ''}
        </div>
        <div class="sim-verdict-sub">
          Bruto: ${FinanceEngine.moeda(reaisPorKmBruto)}/km • Custo estimado da corrida: ${FinanceEngine.moeda(custoTotalCorrida)}
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
      this.notificar(`Custo fixo diário (${FinanceEngine.moeda(diaria)}/dia) preenchido!`);
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
    card.setAttribute('aria-expanded', String(abriu));
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
        <div class="empty-state">
          Nenhum turno salvo ainda. Inicie ou feche seu dia para ver suas estatísticas!
        </div>
      `;
      return;
    }

    const todosGruposSemana = CalendarEngine.agruparTurnosPorSemana(turnos);

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
      const txtTurnosTotal = `${turnos.length} turno${turnos.length === 1 ? '' : 's'}`;
      const opcoesSemana = todosGruposSemana.map(g =>
        `<option value="SEM:${g.chaveSemana}" ${this.filtroHistorico === `SEM:${g.chaveSemana}` ? 'selected' : ''}>` +
        `📅 Semana ${g.numStr}/${g.anoISO} (${g.intervaloCurto}) — ${FinanceEngine.moedaCurta(g.somaLucro)}` +
        `</option>`
      ).join('');

      const opcoesMes = Array.from(mapaMeses.values()).map(m =>
        `<option value="${m.chave}" ${this.filtroHistorico === m.chave ? 'selected' : ''}>` +
        `🗓️ Mês: ${m.rotulo} — ${FinanceEngine.moedaCurta(m.lucro)}` +
        `</option>`
      ).join('');

      selectFiltro.innerHTML = `
        <option value="todos" ${this.filtroHistorico === 'todos' ? 'selected' : ''}>📋 Todas as Semanas (${txtTurnosTotal})</option>
        <optgroup label="Filtrar por Semana do Ano (Seg–Dom)">
          ${opcoesSemana}
        </optgroup>
        <optgroup label="Filtrar por Mês">
          ${opcoesMes}
        </optgroup>
      `;
    }

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
      const qtdDias = grupo.diasUnicos.size;
      const txtDias = `${qtdDias} dia${qtdDias === 1 ? '' : 's'}`;

      const cardsHTML = grupo.turnos.map(item => {
        const dt = this.parseData(item);
        const diaSem = diasCurto[dt.getDay()];
        const dataCurta = CalendarEngine.formatarDiaMesCurto(dt);
        const fatNum = Number(item.faturamento || 0);
        const cusNum = Number(item.custosTotais || 0);
        const combNum = Number(item.combustivel || 0);
        const alimNum = Number(item.alimentacao || 0);
        const diarNum = Number(item.diariaCarro || 0);
        const outrNum = Number(item.outrosGastos || 0);
        const manutNum = Number(item.provisaoManut || 0);
        const horasFormatada = item.horas > 0 ? `${FinanceEngine.numeroBR(item.horas, 1).replace(/,0$/, '')}h` : '';

        const textoOdometro = (item.kmInicial > 0 && item.kmFinal > 0)
          ? `${item.kmInicial} → ${item.kmFinal} km (${item.kmTotal} km)`
          : `${item.kmTotal} km rodados`;

        const textoCorridas = item.corridas > 0
          ? `${item.corridas} (${item.ticketMedio ? `${FinanceEngine.moeda(item.ticketMedio)}/corr.` : ''})`
          : 'Não informado';

        const uberNum = Number(item.ganhoUber || 0);
        const pop99Num = Number(item.ganho99 || 0);
        const pixNum = Number(item.ganhoOutros || 0);
        const temApps = (uberNum + pop99Num + pixNum) > 0;
        const linhaAppsHTML = temApps
          ? `<div class="act-detail-row">
               <span>📱 Por App</span>
               <span>${[
                 uberNum > 0 ? `Uber ${FinanceEngine.moedaCurta(uberNum)}` : '',
                 pop99Num > 0 ? `99 ${FinanceEngine.moedaCurta(pop99Num)}` : '',
                 pixNum > 0 ? `Pix ${FinanceEngine.moedaCurta(pixNum)}` : ''
               ].filter(Boolean).join(' • ')}</span>
             </div>`
          : '';

        const listaTags = Array.isArray(item.tags) ? item.tags : [];
        const obsLimpa = item.obs ? StorageService.escaparHTML(item.obs.trim()) : '';
        const temTagsOuObs = listaTags.length > 0 || obsLimpa !== '';
        const tagsHTML = temTagsOuObs
          ? `<div class="act-tags-row">
               ${listaTags.map(tg => `<span class="act-tag-badge">${StorageService.escaparHTML(tg)}</span>`).join('')}
               ${obsLimpa ? `<span class="act-tag-badge">📝 ${obsLimpa}</span>` : ''}
             </div>`
          : '';

        const idSeguro = StorageService.escaparHTML(item.id);
        const dataSegura = StorageService.escaparHTML(item.data);

        return `
          <div id="card-turno-${idSeguro}" class="activity-item" role="button" tabindex="0" aria-expanded="false"
               onclick="UIController.toggleDetalhesTurno('${idSeguro}')"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();UIController.toggleDetalhesTurno('${idSeguro}');}">
            <div class="act-header">
              <div class="act-title-wrap">
                <span class="act-title">${diaSem}, ${dataCurta}</span>
                <span class="act-km-badge">${item.kmTotal} km</span>
              </div>
              <div class="act-header-right">
                <span class="act-net">${FinanceEngine.moeda(item.lucroLiquido)}</span>
                <span id="hint-turno-${idSeguro}" class="act-toggle-hint">▾ Raio-X</span>
              </div>
            </div>
            <div class="kpi-row">
              <div class="kpi-tile">
                <span>Bruto</span>
                <strong>${FinanceEngine.moeda(fatNum)}</strong>
              </div>
              <div class="kpi-tile">
                <span>Custos</span>
                <strong>${FinanceEngine.moeda(cusNum)}</strong>
              </div>
              <div class="kpi-tile">
                <span>${horasFormatada ? `Líq/KM • ${horasFormatada}` : 'R$/KM Líq.'}</span>
                <strong class="text-green">${FinanceEngine.moeda(item.liquidoKm)}</strong>
              </div>
            </div>
            ${tagsHTML}

            <div class="act-details-panel" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
              <div class="act-detail-section-title">🛣️ Operação e Eficiência (${dataSegura})</div>
              <div class="detail-box">
                <div class="act-detail-row">
                  <span>Odômetro</span>
                  <span>${textoOdometro}</span>
                </div>
                <div class="act-detail-row">
                  <span>Horas líquidas na pista</span>
                  <span>${horasFormatada ? `${horasFormatada} (${FinanceEngine.moeda(item.liquidoHora)}/h)` : 'Não informado'}</span>
                </div>
                <div class="act-detail-row">
                  <span>Viagens / Ticket médio</span>
                  <span>${textoCorridas}</span>
                </div>
                ${linhaAppsHTML}
                <div class="act-detail-row">
                  <span>Ganho Bruto vs. Líquido / KM</span>
                  <span>${FinanceEngine.moeda(item.brutoKm || 0)}/km → <b class="text-green">${FinanceEngine.moeda(item.liquidoKm)}/km</b></span>
                </div>
              </div>

              <div class="act-detail-section-title">💸 Raio-X dos Custos (Total: ${FinanceEngine.moeda(cusNum)})</div>
              <div class="detail-box">
                <div class="act-detail-row">
                  <span>⛽ Combustível</span>
                  <span>${FinanceEngine.moeda(combNum)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🛠️ Reserva de Manutenção (KM)</span>
                  <span>${FinanceEngine.moeda(manutNum)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🍽️ Alimentação / Água</span>
                  <span>${FinanceEngine.moeda(alimNum)}</span>
                </div>
                <div class="act-detail-row">
                  <span>🚗 Diária / Aluguel / Fixo</span>
                  <span>${FinanceEngine.moeda(diarNum)}</span>
                </div>
                <div class="act-detail-row">
                  <span>📦 Outros (Pedágio, Lavagem...)</span>
                  <span>${FinanceEngine.moeda(outrNum)}</span>
                </div>
              </div>

              <!-- Barra Padronizada e Ergonômica de 3 Ações -->
              <div class="act-actions-bar">
                <button type="button" class="act-action-btn" onclick="UIController.compartilharTurnoId('${idSeguro}')">
                  📲 WhatsApp
                </button>
                <button type="button" class="act-action-btn" onclick="UIController.editarTurno('${idSeguro}')">
                  ✏️ Editar
                </button>
                <button type="button" class="act-action-btn danger" onclick="UIController.excluirTurno('${idSeguro}')">
                  🗑️ Excluir
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="week-group-header">
          <div class="week-group-top">
            <span class="week-group-title">📅 Semana ${grupo.numStr}/${totalAno} • ${grupo.intervaloCurto}</span>
            <span class="week-group-net">${FinanceEngine.moeda(grupo.somaLucro)}</span>
          </div>
          <div class="week-group-bottom">
            <span class="week-group-sub dot-list">
              <span>${txtDias}</span>
              <span>Bruto: ${FinanceEngine.moeda(grupo.somaBruto)}</span>
              <span>${grupo.somaKm.toFixed(0)} km</span>
            </span>
            <button type="button" class="chip-btn" onclick="UIController.compartilharSemana('${grupo.chaveSemana}')" title="Copiar Resumo da Semana p/ WhatsApp">📲 Copiar</button>
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

    const liqKm = g.somaKm > 0 ? (g.somaLucro / g.somaKm) : 0;
    const liqHora = g.somaHoras > 0 ? (g.somaLucro / g.somaHoras) : 0;

    const texto =
      `🖤 *FECHAMENTO SEMANA ${g.numStr}/${g.anoISO} (${g.intervaloCurto})*\n` +
      `🗓️ *Dias Rodados:* ${g.diasUnicos.size} dia(s) (${g.turnos.length} turnos)\n` +
      `💰 *Faturamento Bruto:* ${FinanceEngine.moeda(g.somaBruto, true)}\n` +
      `⛽ *Custos Totais:* ${FinanceEngine.moeda(g.somaCustos, true)}\n` +
      `✅ *LUCRO LÍQUIDO LIVRE:* ${FinanceEngine.moeda(g.somaLucro, true)}\n` +
      `🛣️ *KM Total:* ${g.somaKm.toFixed(0)} km (Líq: ${FinanceEngine.moeda(liqKm, true)}/km)` +
      (g.somaHoras > 0 ? `\n⏱️ *Horas:* ${g.somaHoras.toFixed(1)}h (Líq: ${FinanceEngine.moeda(liqHora, true)}/h)` : '');

    navigator.clipboard.writeText(texto).then(() => {
      this.notificar(`Resumo da Semana ${g.numStr} copiado p/ WhatsApp!`);
    });
  },

  compartilharTurnoId(id) {
    const reg = StorageService.obterTurnos().find(t => String(t.id) === String(id));
    if (!reg) return;
    const texto =
      `🖤 *FECHAMENTO MEU TURNO (${reg.data})*\n` +
      `💰 *Bruto:* ${FinanceEngine.moeda(reg.faturamento || 0, true)}\n` +
      `⛽ *Custos Totais:* ${FinanceEngine.moeda(reg.custosTotais || 0, true)}\n` +
      `✅ *LUCRO LÍQUIDO:* ${FinanceEngine.moeda(reg.lucroLiquido, true)}\n` +
      `🛣️ *KM:* ${reg.kmTotal} km (Líq: ${FinanceEngine.moeda(reg.liquidoKm, true)}/km)` +
      (reg.horas > 0 ? `\n⏱️ *Horas:* ${reg.horas}h (Líq: ${FinanceEngine.moeda(reg.liquidoHora, true)}/h)` : '');

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
    document.getElementById('ganhoUber').value = reg.ganhoUber || '';
    document.getElementById('ganho99').value = reg.ganho99 || '';
    document.getElementById('ganhoOutros').value = reg.ganhoOutros || '';
    document.getElementById('faturamento').value = reg.faturamento || '';
    document.getElementById('combustivel').value = reg.combustivel || '';
    document.getElementById('alimentacao').value = reg.alimentacao || '';
    document.getElementById('diariaCarro').value = reg.diariaCarro || '';
    document.getElementById('outrosGastos').value = reg.outrosGastos || '';
    if (document.getElementById('obsTurno')) document.getElementById('obsTurno').value = reg.obs || '';
    this.tagsSelecionadas = Array.isArray(reg.tags) ? [...reg.tags] : [];
    this.sincronizarPillsTags();

    this.navegarAba('fechar');
    this.notificar(`Editando turno de ${reg.data}. Altere e toque em Salvar!`);
  },

  cancelarEdicaoTurno(mostrarAviso = true) {
    this.idTurnoEditando = null;
    const banner = document.getElementById('bannerModoEdicao');
    if (banner) banner.style.display = 'none';
    Rascunho.limpar();
    this.tagsSelecionadas = [];
    this.sincronizarPillsTags();
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
      subtitulo: `${alvo.data} • ${alvo.kmTotal} km • Lucro <b>${FinanceEngine.moeda(alvo.lucroLiquido)}</b><br>Se errar, dá pra desfazer em <b>Pontos de restauração</b>.`,
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
    if (lblTotal) {
      lblTotal.textContent = `${turnos.length} registro${turnos.length === 1 ? '' : 's'}`;
    }

    const textoUltimoBackup = infoBackup
      ? infoBackup.dataFormatada
      : 'Pendente';

    const elInfo = document.getElementById('infoSegurancaDados');
    if (elInfo) {
      elInfo.innerHTML = `
        <div class="kpi-tile">
          <span>🔒 Cofre Duplo</span>
          <strong>${turnos.length} turno${turnos.length === 1 ? '' : 's'}</strong>
        </div>
        <div class="kpi-tile">
          <span>☁️ Último Backup</span>
          <strong class="${infoBackup ? '' : 'text-yellow'}">${textoUltimoBackup}</strong>
        </div>
      `;
    }

    const banner = document.getElementById('bannerBackup');
    if (banner) {
      const turnosSemBackup = infoBackup ? (turnos.length - (infoBackup.qtdTurnos || 0)) : turnos.length;
      if (turnos.length > 0 && turnosSemBackup >= 5) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <div class="banner-row">
            <div>
              <strong class="text-yellow">🛡️ Proteja seus ganhos</strong><br>
              <span class="text-muted-sm">Você tem ${turnosSemBackup} turnos novos sem backup externo.</span>
            </div>
            <button type="button" class="chip-btn chip-warning" onclick="UIController.exportarBackupJSON()">
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
      contPontos.innerHTML = `<div class="text-muted-sm">Os pontos de restauração aparecem aqui automaticamente antes de qualquer exclusão.</div>`;
      return;
    }

    contPontos.innerHTML = pontos.map(p => `
      <div class="restore-point-row">
        <div>
          <b class="text-white">${StorageService.escaparHTML(p.motivo)}</b><br>
          <span class="text-muted-sm">${StorageService.escaparHTML(p.dataHora)} • ${Number(p.qtdTurnos) || 0} turno(s)</span>
        </div>
        <button type="button" class="chip-btn" onclick="UIController.restaurarPonto(${Number(p.id) || 0})">Restaurar</button>
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
      versao: 4,
      exportadoEm: new Date().toISOString(),
      configuracoes: {
        metaDiaria: StorageService.obterNumero(KEYS.META_DIARIA, DEFAULTS.META_DIARIA),
        metaSemanal: StorageService.obterNumero(KEYS.META_SEMANAL, DEFAULTS.META_SEMANAL),
        metaMensal: StorageService.obterNumero(KEYS.META_MENSAL, DEFAULTS.META_MENSAL),
        custoKm: StorageService.obterNumero(KEYS.CUSTO_KM, DEFAULTS.CUSTO_KM),
        consumoKmL: StorageService.obterNumero(KEYS.CONSUMO_KML, 0),
        precoLitro: StorageService.obterNumero(KEYS.PRECO_LITRO, 0),
        kmProxOleo: StorageService.obterNumero(KEYS.KM_PROX_OLEO, 0),
        custoFixoMes: StorageService.obterNumero(KEYS.CUSTO_FIXO_MES, 0),
        baixaManut: StorageService.obterNumero(KEYS.BAIXA_MANUT, 0)
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
      const listaBruta = Array.isArray(dados) ? dados : (Array.isArray(dados.turnos) ? dados.turnos : null);
      const listaImportada = Array.isArray(listaBruta)
        ? listaBruta.map((t, idx) => StorageService.sanitizarTurno(t, idx)).filter(Boolean)
        : [];

      if (listaImportada.length === 0) {
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

      if (dados.configuracoes && typeof dados.configuracoes === 'object') {
        const cfg = dados.configuracoes;
        if (cfg.metaDiaria > 0) StorageService.salvarValor(KEYS.META_DIARIA, Number(cfg.metaDiaria).toFixed(2));
        if (cfg.metaSemanal > 0) StorageService.salvarValor(KEYS.META_SEMANAL, Number(cfg.metaSemanal).toFixed(2));
        if (cfg.metaMensal > 0) StorageService.salvarValor(KEYS.META_MENSAL, Number(cfg.metaMensal).toFixed(2));
        if (cfg.custoKm >= 0) StorageService.salvarValor(KEYS.CUSTO_KM, Number(cfg.custoKm));
        if (cfg.consumoKmL > 0) StorageService.salvarValor(KEYS.CONSUMO_KML, Number(cfg.consumoKmL));
        if (cfg.precoLitro > 0) StorageService.salvarValor(KEYS.PRECO_LITRO, Number(cfg.precoLitro));
        if (cfg.kmProxOleo > 0) StorageService.salvarValor(KEYS.KM_PROX_OLEO, Math.round(Number(cfg.kmProxOleo)));
        if (cfg.custoFixoMes >= 0) StorageService.salvarValor(KEYS.CUSTO_FIXO_MES, Number(cfg.custoFixoMes));
        if (cfg.baixaManut >= 0) StorageService.salvarValor(KEYS.BAIXA_MANUT, Number(cfg.baixaManut).toFixed(2));
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
      subtitulo: `Restaurar <b>${Number(alvo.qtdTurnos) || 0} turno(s)</b> do ponto <i>"${StorageService.escaparHTML(alvo.motivo)}"</i> (${StorageService.escaparHTML(alvo.dataHora)})?`,
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
  let recarregandoSW = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregandoSW) return;
    recarregandoSW = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  });
}
