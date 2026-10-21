/* ==========================================================================
   MÓDULO 3: FINANCE ENGINE (REGRAS DE NEGÓCIO, FÓRMULAS & FORMATAÇÃO PT-BR)
   ========================================================================== */
const FinanceEngine = {
  /**
   * Formata número no padrão monetário brasileiro: R$ 1.420,50
   */
  moeda(valor) {
    const num = Number(valor) || 0;
    const absFormatado = Math.abs(num).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return num < 0 ? `-R$ ${absFormatado}` : `R$ ${absFormatado}`;
  },

  /**
   * Formata número em moeda sem centavos para espaços compactos: R$ 1.420
   */
  moedaCurta(valor) {
    const num = Math.round(Number(valor) || 0);
    const absFormatado = Math.abs(num).toLocaleString('pt-BR');
    return num < 0 ? `-R$ ${absFormatado}` : `R$ ${absFormatado}`;
  },

  /**
   * Formata decimal com vírgula no padrão brasileiro: 1,45
   */
  numeroBR(valor, casas = 2) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas
    });
  },

  calcularTurno(entrada) {
    const kmTotal = entrada.kmFim > entrada.kmIni
      ? (entrada.kmFim - entrada.kmIni)
      : Math.max(0, entrada.kmDireto);

    const provisaoManut = kmTotal * entrada.custoKm;
    const gastosDiretos = entrada.combustivel + entrada.alimentacao + entrada.diariaCarro + entrada.outrosGastos;
    const custosTotais = gastosDiretos + provisaoManut;
    const lucroLiquido = entrada.faturamento - custosTotais;

    const brutoKm = kmTotal > 0 ? (entrada.faturamento / kmTotal).toFixed(2) : '0.00';
    const liquidoKm = kmTotal > 0 ? (lucroLiquido / kmTotal).toFixed(2) : '0.00';
    const ticketMedio = entrada.corridas > 0 ? (entrada.faturamento / entrada.corridas).toFixed(2) : '0.00';
    const brutoHora = entrada.horas > 0 ? (entrada.faturamento / entrada.horas).toFixed(2) : '0.00';
    const liquidoHora = entrada.horas > 0 ? (lucroLiquido / entrada.horas).toFixed(2) : '0.00';
    const margemLiquida = entrada.faturamento > 0
      ? Math.round((lucroLiquido / entrada.faturamento) * 100)
      : 0;

    return {
      kmTotal: Number(kmTotal.toFixed(1)),
      provisaoManut: Number(provisaoManut.toFixed(2)),
      gastosDiretos: Number(gastosDiretos.toFixed(2)),
      custosTotais: Number(custosTotais.toFixed(2)),
      lucroLiquido: lucroLiquido.toFixed(2),
      brutoKm,
      liquidoKm,
      ticketMedio,
      brutoHora,
      liquidoHora,
      margemLiquida
    };
  },

  avaliarRentabilidade(calc) {
    const liq = parseFloat(calc.lucroLiquido);
    const liqKm = parseFloat(calc.liquidoKm);
    if (liq <= 0 || (calc.kmTotal > 0 && liqKm < 0.85)) {
      return { classe: 'status-bad', rotulo: '⚠️ Margem Baixa' };
    }
    if (calc.kmTotal > 0 && liqKm < 1.35) {
      return { classe: 'status-warn', rotulo: '👍 Turno Regular' };
    }
    return { classe: 'status-good', rotulo: '🔥 Alta Rentabilidade' };
  },

  resumirLista(turnos) {
    let somaLucro = 0, somaBruto = 0, somaCustos = 0, somaKm = 0, somaHoras = 0, somaManut = 0;
    let somaUber = 0, soma99 = 0, somaOutrosApps = 0;
    const diasUnicos = new Set();

    turnos.forEach(item => {
      const luc = parseFloat(item.lucroLiquido) || 0;
      const fat = parseFloat(item.faturamento) || 0;
      const cus = item.custosTotais !== undefined ? parseFloat(item.custosTotais) : Math.max(0, fat - luc);
      somaLucro += luc;
      somaBruto += fat;
      somaCustos += cus;
      somaKm += parseFloat(item.kmTotal) || 0;
      somaHoras += parseFloat(item.horas) || 0;
      somaManut += parseFloat(item.provisaoManut) || 0;
      somaUber += parseFloat(item.ganhoUber) || 0;
      soma99 += parseFloat(item.ganho99) || 0;
      somaOutrosApps += parseFloat(item.ganhoOutros) || 0;
      diasUnicos.add(item.dataISO || item.data);
    });

    const mediaKm = somaKm > 0 ? (somaLucro / somaKm) : 0;
    const mediaHora = somaHoras > 0 ? (somaLucro / somaHoras) : 0;

    return {
      somaLucro,
      somaBruto,
      somaCustos,
      somaKm,
      somaHoras,
      somaManut,
      somaUber,
      soma99,
      somaOutrosApps,
      mediaKm,
      mediaHora,
      diasTrabalhados: diasUnicos.size
    };
  }
};
