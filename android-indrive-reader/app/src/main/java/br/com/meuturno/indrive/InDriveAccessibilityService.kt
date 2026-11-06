package br.com.meuturno.indrive

import android.accessibilityservice.AccessibilityService
import android.speech.tts.TextToSpeech
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

/**
 * Lê de forma passiva os textos do card "Pedido de viagem" do inDrive,
 * calcula se a corrida compensa e mostra na bolha (OverlayHudService).
 *
 * IMPORTANTE: nunca clica nem aceita corridas (respeita os termos do inDrive).
 */
class InDriveAccessibilityService : AccessibilityService(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var ttsPronto = false
    private var ultimaAssinatura = ""
    private var ultimoMs = 0L

    override fun onCreate() {
        super.onCreate()
        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val res = tts?.setLanguage(Locale("pt", "BR"))
            ttsPronto = res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED
            tts?.setSpeechRate(1.1f)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val raiz = rootInActiveWindow ?: return
        val textos = mutableListOf<String>()
        coletarTextos(raiz, textos, 0)
        if (textos.isEmpty()) return

        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)

        // Guarda o que foi lido (só no aparelho) para diagnóstico quando algum pedido não for reconhecido
        if (textos.any { it.contains("R$") }) {
            prefs.edit()
                .putString(KEY_ULTIMOS_TEXTOS, textos.joinToString("\n").take(4000))
                .putLong(KEY_ULTIMA_LEITURA_MS, System.currentTimeMillis())
                .apply()
        }

        val oferta = RideOfferParser.extrairOferta(textos) ?: return
        val assinatura = "${oferta.valorOferecido}|${oferta.kmBusca}|${oferta.kmCorrida}|${oferta.enderecoDestinoB}"
        val agora = System.currentTimeMillis()
        if (assinatura == ultimaAssinatura && agora - ultimoMs < 8000L) return
        ultimaAssinatura = assinatura
        ultimoMs = agora

        val config = DriverConfig(
            consumoKmL = prefs.getFloat("consumo_kml", 10.0f).toDouble(),
            precoLitroCombustivel = prefs.getFloat("preco_litro", 6.50f).toDouble(),
            custoManutencaoPorKm = prefs.getFloat("custo_manut_km", 0.15f).toDouble(),
            metaBrutaPorKm = prefs.getFloat("meta_bruta_km", 1.50f).toDouble(),
            falarAvisoPorVoz = prefs.getBoolean("falar_voz", true)
        )

        val analise = RideCalculator.analisar(oferta, config)
        prefs.edit().putInt(KEY_PEDIDOS_LIDOS, prefs.getInt(KEY_PEDIDOS_LIDOS, 0) + 1).apply()
        OverlayHudService.exibirAnalise(this, analise)

        if (config.falarAvisoPorVoz && ttsPronto) {
            tts?.speak(analise.textoVoz, TextToSpeech.QUEUE_FLUSH, null, "indrive_verdict")
        }
    }

    private fun coletarTextos(node: AccessibilityNodeInfo?, saida: MutableList<String>, nivel: Int) {
        if (node == null || nivel > 40) return
        node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { saida.add(it) }
        node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let {
            if (saida.lastOrNull() != it) saida.add(it)
        }
        for (i in 0 until node.childCount) {
            coletarTextos(node.getChild(i), saida, nivel + 1)
        }
    }

    override fun onInterrupt() {
        tts?.stop()
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    companion object {
        const val PREFS = "meu_turno_indrive_prefs"
        const val KEY_ULTIMOS_TEXTOS = "ultimos_textos_lidos"
        const val KEY_ULTIMA_LEITURA_MS = "ultima_leitura_ms"
        const val KEY_PEDIDOS_LIDOS = "pedidos_lidos"
    }
}
