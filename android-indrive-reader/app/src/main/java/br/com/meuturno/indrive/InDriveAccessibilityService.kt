package br.com.meuturno.indrive

import android.accessibilityservice.AccessibilityService
import android.speech.tts.TextToSpeech
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

/**
 * Lê de forma passiva e segura os textos expostos pelo card "Pedido de viagem" do inDrive,
 * calcula os indicadores reais e exibe na Janela Flutuante (OverlayHudService).
 *
 * IMPORTANTE: Nunca executa cliques automáticos (respeita os termos das plataformas).
 */
class InDriveAccessibilityService : AccessibilityService(), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var ttsPronto = false
    private var ultimaAssinaturaLida: String = ""
    private var ultimoTimestampMs: Long = 0L

    override fun onCreate() {
        super.onCreate()
        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val res = tts?.setLanguage(Locale("pt", "BR"))
            ttsPronto = res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED
            tts?.setSpeechRate(1.12f)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val rootNode = rootInActiveWindow ?: return
        val textos = mutableListOf<String>()
        coletarTextosRecursivo(rootNode, textos)

        val oferta = RideOfferParser.extrairOferta(textos) ?: return
        val assinatura = "${oferta.valorOferecido}|${oferta.kmBusca}|${oferta.kmCorrida}|${oferta.enderecoDestinoB}"
        val agora = System.currentTimeMillis()

        // Evita recalcular/repetir voz para o mesmo pedido na tela
        if (assinatura == ultimaAssinaturaLida && (agora - ultimoTimestampMs) < 8000L) {
            return
        }
        ultimaAssinaturaLida = assinatura
        ultimoTimestampMs = agora

        val prefs = getSharedPreferences("meu_turno_indrive_prefs", MODE_PRIVATE)
        val config = DriverConfig(
            consumoKmL = prefs.getFloat("consumo_kml", 10.0f).toDouble(),
            precoLitroCombustivel = prefs.getFloat("preco_litro", 6.50f).toDouble(),
            custoManutencaoPorKm = prefs.getFloat("custo_manut_km", 0.15f).toDouble(),
            metaBrutaPorKm = prefs.getFloat("meta_bruta_km", 1.50f).toDouble(),
            falarAvisoPorVoz = prefs.getBoolean("falar_voz", true)
        )

        val analise = RideCalculator.analisar(oferta, config)
        OverlayHudService.exibirAnalise(this, analise)

        if (config.falarAvisoPorVoz && ttsPronto) {
            tts?.speak(analise.textoVoz, TextToSpeech.QUEUE_FLUSH, null, "indrive_verdict")
        }
    }

    private fun coletarTextosRecursivo(node: AccessibilityNodeInfo?, saida: MutableList<String>) {
        if (node == null) return
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let { saida.add(it) }
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let { saida.add(it) }
        for (i in 0 until node.childCount) {
            coletarTextosRecursivo(node.getChild(i), saida)
        }
    }

    override fun onInterrupt() {
        tts?.stop()
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }
}
