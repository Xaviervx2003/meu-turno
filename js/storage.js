/* ==========================================================================
   MÓDULO 1: CONSTANTES, STORAGE SERVICE, COFRE (INDEXEDDB) & STORAGE GUARD
   ========================================================================== */
const KEYS = {
  TURNOS: 'turnos_app',
  TURNO_ATIVO: 'meu_turno_ativo',
  META_DIARIA: 'meu_turno_meta_diaria',
  META_SEMANAL: 'meu_turno_meta_semanal',
  META_MENSAL: 'meu_turno_meta_mensal',
  CUSTO_KM: 'meu_turno_custo_km',
  CONSUMO_KML: 'meu_turno_consumo_kml',
  PRECO_LITRO: 'meu_turno_preco_litro',
  RASCUNHO_FORM: 'meu_turno_rascunho_form',
  ULTIMO_BACKUP: 'meu_turno_ultimo_backup',
  KM_PROX_OLEO: 'meu_turno_km_prox_oleo',
  CUSTO_FIXO_MES: 'meu_turno_custo_fixo_mes',
  BAIXA_MANUT: 'meu_turno_baixa_manut',
  MODO_PRIVACIDADE: 'meu_turno_privacidade'
};

const DEFAULTS = {
  CUSTO_KM: 0.15,
  META_DIARIA: 200.00,
  META_SEMANAL: 1200.00,
  META_MENSAL: 5000.00
};

const StorageService = {
  escaparHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  sanitizarTurno(t, idx = 0) {
    if (!t || typeof t !== 'object') return null;
    const num = (v, dec = 2) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? Number(n.toFixed(dec)) : 0;
    };
    const idBruto = t.id ? String(t.id) : `legacy_${idx}_${t.data || ''}`;
    const idLimpo = idBruto.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `legacy_${idx}`;
    const dataLimpa = String(t.data || '').replace(/[^0-9/]/g, '').slice(0, 10);
    const dataISOLimpa = String(t.dataISO || '').replace(/[^0-9-]/g, '').slice(0, 10);
    const tagsLimpas = Array.isArray(t.tags)
      ? t.tags.slice(0, 10).map(tg => String(tg || '').trim().slice(0, 30)).filter(Boolean)
      : [];
    const obsLimpa = String(t.obs || '').trim().slice(0, 60);

    return {
      ...t,
      id: idLimpo,
      data: dataLimpa || new Date().toLocaleDateString('pt-BR'),
      dataISO: dataISOLimpa,
      kmInicial: num(t.kmInicial, 1),
      kmFinal: num(t.kmFinal, 1),
      kmTotal: Math.max(0, num(t.kmTotal, 1)),
      horas: Math.max(0, num(t.horas, 1)),
      corridas: Math.max(0, Math.round(num(t.corridas, 0))),
      ganhoUber: Math.max(0, num(t.ganhoUber, 2)),
      ganho99: Math.max(0, num(t.ganho99, 2)),
      ganhoOutros: Math.max(0, num(t.ganhoOutros, 2)),
      faturamento: Math.max(0, num(t.faturamento, 2)),
      custosTotais: Math.max(0, num(t.custosTotais, 2)),
      combustivel: Math.max(0, num(t.combustivel, 2)),
      alimentacao: Math.max(0, num(t.alimentacao, 2)),
      diariaCarro: Math.max(0, num(t.diariaCarro, 2)),
      outrosGastos: Math.max(0, num(t.outrosGastos, 2)),
      provisaoManut: Math.max(0, num(t.provisaoManut, 2)),
      lucroLiquido: num(t.lucroLiquido, 2).toFixed(2),
      brutoKm: num(t.brutoKm, 2).toFixed(2),
      liquidoKm: num(t.liquidoKm, 2).toFixed(2),
      liquidoHora: num(t.liquidoHora, 2).toFixed(2),
      ticketMedio: num(t.ticketMedio, 2).toFixed(2),
      tags: tagsLimpas,
      obs: obsLimpa
    };
  },

  obterTurnos() {
    try {
      const lista = JSON.parse(localStorage.getItem(KEYS.TURNOS) || '[]');
      if (!Array.isArray(lista)) return [];
      return lista.map((t, idx) => this.sanitizarTurno(t, idx)).filter(Boolean);
    } catch {
      return [];
    }
  },
  salvarTurnos(lista) {
    try {
      const limpa = Array.isArray(lista)
        ? lista.map((t, idx) => this.sanitizarTurno(t, idx)).filter(Boolean)
        : [];
      localStorage.setItem(KEYS.TURNOS, JSON.stringify(limpa));
      Cofre.espelharTurnos(limpa);
      return true;
    } catch {
      if (typeof UIController !== 'undefined') {
        UIController.notificar('Memória do navegador cheia! Exporte um backup.');
      }
      return false;
    }
  },
  obterTurnoAtivo() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.TURNO_ATIVO) || 'null');
    } catch {
      return null;
    }
  },
  salvarTurnoAtivo(dados) {
    try {
      if (!dados) {
        localStorage.removeItem(KEYS.TURNO_ATIVO);
      } else {
        localStorage.setItem(KEYS.TURNO_ATIVO, JSON.stringify(dados));
      }
      Cofre.espelharTurnoAtivo(dados);
    } catch {}
  },
  obterNumero(chave, padrao) {
    const val = parseFloat(localStorage.getItem(chave));
    return isNaN(val) ? padrao : val;
  },
  salvarValor(chave, valor) {
    try {
      localStorage.setItem(chave, String(valor));
      Cofre.espelharConfigs();
    } catch {}
  }
};

/* ==========================================================================
   MÓDULO 1.1: COFRE DUPLO (INDEXEDDB + PONTOS DE RESTAURAÇÃO AUTOMÁTICOS)
   Protege contra limpeza parcial de localStorage e exclusões acidentais.
   ========================================================================== */
const Cofre = {
  DB_NAME: 'meu_turno_cofre_db',
  DB_VERSION: 1,
  _dbPromise: null,

  abrirDB() {
    if (this._dbPromise) return this._dbPromise;
    if (!('indexedDB' in window)) return Promise.resolve(null);

    this._dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('espelho')) {
            db.createObjectStore('espelho', { keyPath: 'chave' });
          }
          if (!db.objectStoreNames.contains('pontos')) {
            db.createObjectStore('pontos', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this._dbPromise;
  },

  async espelharTurnos(lista) {
    const db = await this.abrirDB();
    if (!db) return;
    try {
      const tx = db.transaction('espelho', 'readwrite');
      tx.objectStore('espelho').put({
        chave: KEYS.TURNOS,
        valor: lista,
        atualizadoEm: Date.now()
      });
    } catch {}
  },

  async espelharTurnoAtivo(dados) {
    const db = await this.abrirDB();
    if (!db) return;
    try {
      const tx = db.transaction('espelho', 'readwrite');
      tx.objectStore('espelho').put({
        chave: KEYS.TURNO_ATIVO,
        valor: dados,
        atualizadoEm: Date.now()
      });
    } catch {}
  },

  async espelharConfigs() {
    const db = await this.abrirDB();
    if (!db) return;
    try {
      const chavesConfig = [
        KEYS.META_DIARIA, KEYS.META_SEMANAL, KEYS.META_MENSAL,
        KEYS.CUSTO_KM, KEYS.CONSUMO_KML, KEYS.PRECO_LITRO,
        KEYS.KM_PROX_OLEO, KEYS.CUSTO_FIXO_MES, KEYS.BAIXA_MANUT,
        KEYS.ULTIMO_BACKUP, KEYS.MODO_PRIVACIDADE
      ];
      const mapa = {};
      chavesConfig.forEach(k => {
        const v = localStorage.getItem(k);
        if (v !== null) mapa[k] = v;
      });
      const tx = db.transaction('espelho', 'readwrite');
      tx.objectStore('espelho').put({
        chave: 'meu_turno_configs',
        valor: mapa,
        atualizadoEm: Date.now()
      });
    } catch {}
  },

  async verificarAutoRecuperacao() {
    const db = await this.abrirDB();
    if (!db) return false;
    try {
      const turnosLocal = StorageService.obterTurnos();
      const espelhoTurnos = await new Promise((resolve) => {
        const tx = db.transaction('espelho', 'readonly');
        const req = tx.objectStore('espelho').get(KEYS.TURNOS);
        req.onsuccess = () => resolve(req.result?.valor || []);
        req.onerror = () => resolve([]);
      });

      const espelhoConfigs = await new Promise((resolve) => {
        const tx = db.transaction('espelho', 'readonly');
        const req = tx.objectStore('espelho').get('meu_turno_configs');
        req.onsuccess = () => resolve(req.result?.valor || null);
        req.onerror = () => resolve(null);
      });

      if (espelhoConfigs && typeof espelhoConfigs === 'object') {
        Object.entries(espelhoConfigs).forEach(([k, v]) => {
          if (localStorage.getItem(k) === null && v !== undefined) {
            localStorage.setItem(k, String(v));
          }
        });
      } else {
        await this.espelharConfigs();
      }

      if (turnosLocal.length === 0 && Array.isArray(espelhoTurnos) && espelhoTurnos.length > 0) {
        localStorage.setItem(KEYS.TURNOS, JSON.stringify(espelhoTurnos));
        return espelhoTurnos.length;
      }
      if (turnosLocal.length > 0 && espelhoTurnos.length === 0) {
        await this.espelharTurnos(turnosLocal);
      }
    } catch {}
    return 0;
  },

  async criarPonto(motivo) {
    const db = await this.abrirDB();
    if (!db) return;
    const turnosAtuais = StorageService.obterTurnos();
    if (turnosAtuais.length === 0) return;

    try {
      const agora = new Date();
      const ponto = {
        id: Date.now(),
        motivo,
        dataHora: agora.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        qtdTurnos: turnosAtuais.length,
        turnos: turnosAtuais
      };

      const tx = db.transaction('pontos', 'readwrite');
      const store = tx.objectStore('pontos');
      store.put(ponto);

      const todos = await this.listarPontos();
      if (todos.length > 8) {
        const txDel = db.transaction('pontos', 'readwrite');
        const stDel = txDel.objectStore('pontos');
        todos.slice(8).forEach(p => stDel.delete(p.id));
      }
    } catch {}
  },

  async listarPontos() {
    const db = await this.abrirDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('pontos', 'readonly');
        const req = tx.objectStore('pontos').getAll();
        req.onsuccess = () => {
          const lista = Array.isArray(req.result) ? req.result : [];
          resolve(lista.sort((a, b) => b.id - a.id));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }
};

/* ==========================================================================
   MÓDULO 1.2: RASCUNHO AUTOMÁTICO (SALVA CADA DÍGITO DO FORMULÁRIO)
   ========================================================================== */
const Rascunho = {
  CAMPOS: [
    'horasTrabalhadas', 'kmInicial', 'kmFinal', 'kmTotalInput', 'corridas',
    'ganhoUber', 'ganho99', 'ganhoOutros', 'faturamento',
    'combustivel', 'alimentacao', 'diariaCarro', 'outrosGastos', 'obsTurno'
  ],

  iniciarMonitoramento() {
    this.restaurar();
    this.CAMPOS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.salvar());
      }
    });
  },

  salvar() {
    try {
      const dados = {};
      let temValor = false;
      this.CAMPOS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value !== '') {
          dados[id] = el.value;
          temValor = true;
        }
      });
      if (temValor) {
        localStorage.setItem(KEYS.RASCUNHO_FORM, JSON.stringify(dados));
      } else {
        localStorage.removeItem(KEYS.RASCUNHO_FORM);
      }
    } catch {}
  },

  restaurar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(KEYS.RASCUNHO_FORM) || 'null');
      if (!salvo) return;
      Object.entries(salvo).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el && valor !== undefined) el.value = valor;
      });
    } catch {}
  },

  limpar() {
    localStorage.removeItem(KEYS.RASCUNHO_FORM);
    this.CAMPOS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }
};

/* ==========================================================================
   MÓDULO 1.3: STORAGE GUARD (PERSISTÊNCIA DO SISTEMA E ALERTA DE BACKUP)
   ========================================================================== */
const StorageGuard = {
  persistente: false,

  async pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        this.persistente = await navigator.storage.persist();
      }
    } catch {}
    return this.persistente;
  },

  async verificarStatusPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        this.persistente = await navigator.storage.persisted();
      }
    } catch {}
    return this.persistente;
  },

  registrarBackupExterno(qtdTurnos) {
    StorageService.salvarValor(KEYS.ULTIMO_BACKUP, JSON.stringify({
      timestamp: Date.now(),
      dataFormatada: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      qtdTurnos
    }));
  },

  obterInfoUltimoBackup() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.ULTIMO_BACKUP) || 'null');
    } catch {
      return null;
    }
  }
};
