/* ==========================================================================
   MÓDULO 2: CALENDAR ENGINE (SEMANAS DO ANO 01–52/53, CICLOS SEG–DOM & MESES)
   Padrão de Ciclo Semanal: Segunda-feira a Domingo (igual Uber, 99 e Locadoras)
   ========================================================================== */
const CalendarEngine = {
  MESES_CURTOS: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  MESES_COMPLETOS: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],
  DIAS_CURTOS: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],

  parseData(item) {
    if (item && item.dataISO && item.dataISO.includes('-')) {
      const [y, m, d] = item.dataISO.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    if (item && item.data && item.data.includes('/')) {
      const [d, m, y] = item.data.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0);
  },

  formatarDiaMesCurto(dt) {
    const dia = String(dt.getDate()).padStart(2, '0');
    const mes = this.MESES_CURTOS[dt.getMonth()];
    return `${dia}/${mes}`;
  },

  totalSemanasNoAnoISO(ano) {
    // Um ano ISO tem 53 semanas se 1º de janeiro for Quinta-feira ou (ano bissexto e Quarta-feira)
    const d = new Date(ano, 11, 28, 12, 0, 0);
    return this.obterInfoSemanaISO(d).numeroSemana;
  },

  /**
   * Retorna todas as informações da Semana do Ano (Padrão ISO: Segunda a Domingo)
   */
  obterInfoSemanaISO(dataRef) {
    const d = new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate(), 12, 0, 0);
    // Na convenção ISO: Seg = 1 ... Dom = 7
    const diaISO = d.getDay() === 0 ? 7 : d.getDay();

    // Segunda-feira e Domingo da semana daquela data
    const segunda = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (diaISO - 1), 0, 0, 0, 0);
    const domingo = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 6, 23, 59, 59, 999);

    // Quinta-feira da semana define o ano e o número da semana ISO
    const quinta = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 3, 12, 0, 0);
    const anoISO = quinta.getFullYear();

    // Primeira quinta-feira do ano ISO (contém 4 de janeiro)
    const jan4 = new Date(anoISO, 0, 4, 12, 0, 0);
    const diaJan4 = jan4.getDay() === 0 ? 7 : jan4.getDay();
    const primeiraSegunda = new Date(anoISO, 0, 4 - (diaJan4 - 1), 12, 0, 0);

    const diffDias = Math.round((segunda.getTime() - primeiraSegunda.getTime()) / 86400000);
    const numeroSemana = Math.floor(diffDias / 7) + 1;

    const numStr = String(numeroSemana).padStart(2, '0');
    const chaveSemana = `${anoISO}-W${numStr}`;
    const intervaloCurto = `${this.formatarDiaMesCurto(segunda)} a ${this.formatarDiaMesCurto(domingo)}`;

    // Gera os 7 dias daquela semana (Segunda a Domingo)
    const diasDaSemana = [];
    const nomesSegADom = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    for (let i = 0; i < 7; i++) {
      const dtDia = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + i, 12, 0, 0);
      diasDaSemana.push({
        dataObj: dtDia,
        dataBR: dtDia.toLocaleDateString('pt-BR'),
        rotulo: nomesSegADom[i],
        diaMes: this.formatarDiaMesCurto(dtDia)
      });
    }

    return {
      anoISO,
      numeroSemana,
      numStr,
      chaveSemana,
      segunda,
      domingo,
      intervaloCurto,
      rotuloSemana: `Semana ${numStr} de ${anoISO}`,
      diasDaSemana
    };
  },

  obterSemanaPorOffset(offsetSemanas = 0) {
    const hoje = new Date();
    const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + (offsetSemanas * 7), 12, 0, 0);
    const info = this.obterInfoSemanaISO(alvo);
    const totalAno = this.totalSemanasNoAnoISO(info.anoISO);
    const anteriorAlvo = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate() - 7, 12, 0, 0);
    const infoAnterior = this.obterInfoSemanaISO(anteriorAlvo);

    return {
      ...info,
      totalAno,
      ehSemanaAtual: offsetSemanas === 0,
      anterior: infoAnterior
    };
  },

  obterMesPorOffset(offsetMeses = 0) {
    const hoje = new Date();
    const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1, 12, 0, 0);
    const ant = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses - 1, 1, 12, 0, 0);

    const ano = alvo.getFullYear();
    const mes = alvo.getMonth();
    const chaveMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;

    return {
      ano,
      mes,
      chaveMes,
      nomeMes: this.MESES_COMPLETOS[mes],
      rotuloMes: `${this.MESES_COMPLETOS[mes]} de ${ano}`,
      ehMesAtual: offsetMeses === 0,
      anterior: {
        ano: ant.getFullYear(),
        mes: ant.getMonth(),
        nomeMes: this.MESES_COMPLETOS[ant.getMonth()],
        rotuloCurto: `${this.MESES_CURTOS[ant.getMonth()]}/${ant.getFullYear()}`
      }
    };
  },

  pertenceASemana(dt, infoSemana) {
    const t = dt.getTime();
    return t >= infoSemana.segunda.getTime() && t <= infoSemana.domingo.getTime();
  },

  pertenceAoMes(dt, infoMes) {
    return dt.getFullYear() === infoMes.ano && dt.getMonth() === infoMes.mes;
  },

  /**
   * Agrupa uma lista de turnos por Semana do Ano ISO (ex: Semana 43 / 2026)
   */
  agruparTurnosPorSemana(turnos) {
    const mapa = new Map();

    turnos.forEach(t => {
      const dt = this.parseData(t);
      const info = this.obterInfoSemanaISO(dt);

      if (!mapa.has(info.chaveSemana)) {
        mapa.set(info.chaveSemana, {
          ...info,
          turnos: [],
          diasUnicos: new Set(),
          somaLucro: 0,
          somaBruto: 0,
          somaCustos: 0,
          somaKm: 0,
          somaHoras: 0
        });
      }

      const grupo = mapa.get(info.chaveSemana);
      grupo.turnos.push(t);
      grupo.diasUnicos.add(t.dataISO || t.data);
      const luc = parseFloat(t.lucroLiquido) || 0;
      const fat = parseFloat(t.faturamento) || 0;
      const cus = t.custosTotais !== undefined ? parseFloat(t.custosTotais) : Math.max(0, fat - luc);
      grupo.somaLucro += luc;
      grupo.somaBruto += fat;
      grupo.somaCustos += cus;
      grupo.somaKm += parseFloat(t.kmTotal) || 0;
      grupo.somaHoras += parseFloat(t.horas) || 0;
    });

    return Array.from(mapa.values()).sort((a, b) => b.segunda.getTime() - a.segunda.getTime());
  }
};
