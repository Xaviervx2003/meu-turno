/* ==========================================================================
   MÓDULO 4: SHEET (BOTTOM SHEET ESTILO UBER — SUBSTITUI prompt/confirm)
   Regra: o app NUNCA usa diálogos nativos do navegador (alert/prompt/confirm).
   ========================================================================== */
const Sheet = {
  _resolver: null,
  _coletar: null,

  el(id) { return document.getElementById(id); },

  abrir({ icone = '', titulo = '', subtitulo = '', corpoHTML = '', textoOk = 'Confirmar',
          textoCancelar = 'Cancelar', variante = 'primary', coletar = null, aoAbrir = null }) {
    if (this._resolver) this.fechar(null);

    return new Promise(resolve => {
      this._resolver = resolve;
      this._coletar = coletar;

      this.el('sheetIcone').textContent = icone;
      this.el('sheetIcone').style.display = icone ? 'flex' : 'none';
      this.el('sheetTitulo').textContent = titulo;
      this.el('sheetSubtitulo').innerHTML = subtitulo;
      this.el('sheetCorpo').innerHTML = corpoHTML;

      const btnOk = this.el('sheetBtnOk');
      btnOk.textContent = textoOk;
      btnOk.className = `sheet-btn sheet-btn-${variante}`;
      this.el('sheetBtnCancel').textContent = textoCancelar;

      document.body.classList.add('sheet-aberto');
      this.el('sheetOverlay').classList.add('open');
      this.el('sheet').classList.add('open');

      if (aoAbrir) setTimeout(aoAbrir, 180);
    });
  },

  confirmarOk() {
    if (!this._coletar) return this.fechar(true);
    const valor = this._coletar();
    if (valor === undefined) return;
    this.fechar(valor);
  },

  fechar(valor) {
    this.el('sheetOverlay').classList.remove('open');
    this.el('sheet').classList.remove('open');
    document.body.classList.remove('sheet-aberto');
    const resolver = this._resolver;
    this._resolver = null;
    this._coletar = null;
    if (resolver) resolver(valor);
  },

  confirmar(opcoes) {
    return this.abrir(opcoes).then(v => v === true);
  },

  pedirValor({ valorInicial = '', placeholder = '0', prefixo = '', sufixo = '', atalhos = [],
               modoAtalho = 'somar', inteiro = false, permitirVazio = false, ...resto }) {
    const chips = atalhos.length
      ? `<div class="sheet-chips">${atalhos.map(v =>
          `<button type="button" class="sheet-chip" data-valor="${v}">${modoAtalho === 'somar' ? '+' : ''}${prefixo ? prefixo + ' ' : ''}${v}</button>`
        ).join('')}</div>`
      : '';

    const corpoHTML = `
      <div class="sheet-input-wrap" id="sheetInputWrap">
        ${prefixo ? `<span class="sheet-affix">${prefixo}</span>` : ''}
        <input id="sheetInput" type="number" step="${inteiro ? '1' : '0.01'}"
               inputmode="${inteiro ? 'numeric' : 'decimal'}" placeholder="${placeholder}" value="${valorInicial}">
        ${sufixo ? `<span class="sheet-affix">${sufixo}</span>` : ''}
      </div>
      ${chips}
    `;

    const coletar = () => {
      const input = this.el('sheetInput');
      const bruto = String(input.value || '').replace(',', '.').trim();
      if (bruto === '') {
        if (permitirVazio) return 0;
        return this.tremer();
      }
      const num = parseFloat(bruto);
      if (isNaN(num) || num < 0) return this.tremer();
      return inteiro ? Math.round(num) : Number(num.toFixed(2));
    };

    const aoAbrir = () => {
      const input = this.el('sheetInput');
      input.focus();
      input.select();
      input.addEventListener('keydown', e => { if (e.key === 'Enter') this.confirmarOk(); });

      document.querySelectorAll('.sheet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const v = parseFloat(chip.dataset.valor);
          const atual = parseFloat(String(input.value).replace(',', '.')) || 0;
          input.value = modoAtalho === 'somar' ? (atual + v).toFixed(2).replace(/\.00$/, '') : v;
          if (navigator.vibrate) navigator.vibrate(12);
        });
      });
    };

    return this.abrir({ ...resto, corpoHTML, coletar, aoAbrir });
  },

  tremer() {
    const wrap = this.el('sheetInputWrap');
    if (wrap) {
      wrap.classList.remove('erro');
      void wrap.offsetWidth;
      wrap.classList.add('erro');
    }
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    return undefined;
  }
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && Sheet._resolver) Sheet.fechar(null);
});
