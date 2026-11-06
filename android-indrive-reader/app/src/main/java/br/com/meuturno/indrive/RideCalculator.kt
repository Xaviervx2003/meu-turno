package br.com.meuturno.indrive

import kotlin.math.ceil
import kotlin.math.roundToInt

enum class RideVerdict {
    GOOD,    // 🟢 Boa
    REGULAR, // 🟡 Regular / Contraproposta
    BAD      // 🔴 Ruim / Prejuízo
}

data class DriverConfig(
    val consumoKmL: Double = 10.0,
    val precoLitroCombustivel: Double = 6.50,
    val custoManutencaoPorKm: Double = 0.15,
    val metaLiquidaPorKm: Double = 1.00,
    val metaBrutaPorKm: Double = 1.50,
    val metaLiquidaPorHora: Double = 30.0,
    val buscaMaximaKm: Double = 2.5,
    val notaMinimaPassageiro: Double = 4.70,
    val avaliacoesMinimasConfiaveis: Int = 25,
    val falarAvisoPorVoz: Boolean = true
)

data class RideAnalysis(
    val oferta: InDriveOffer,
    val kmTotal: Double,
    val tempoTotalMin: Int,
    val tempoFoiEstimado: Boolean,
    val reaisPorKmReal: Double,
    val reaisPorKmLiquido: Double,
    val reaisPorHoraBruto: Double,
    val reaisPorHoraLiquido: Double,
    val custoCombustivel: Double,
    val custoManutencao: Double,
    val lucroLiquido: Double,
    val contrapropostaMinima: Double,
    val melhorBotaoContraproposta: Double?,
    val temVoltaVazia: Boolean,
    val alertas: List<String>,
    val veredito: RideVerdict,
    val textoVoz: String
)

object RideCalculator {
    private val BAIRROS_VOLTA_VAZIA_MANAUS = listOf(
        "tarumã", "taruma", "nova cidade", "puraquequara", "santa etelvina",
        "lago azul", "viver melhor", "colônia antônio aleixo", "colonia antonio aleixo",
        "distrito", "br-174", "am-010", "ramal", "barreira"
    )

    fun analisar(oferta: InDriveOffer, config: DriverConfig = DriverConfig()): RideAnalysis {
        val kmTotal = oferta.kmBusca + oferta.kmCorrida

        // Se o balão verde de minutos estiver cortado na tela do inDrive, estima ~1.65 min/km
        val tempoTotalMin: Int
        val tempoFoiEstimado: Boolean
        if (oferta.minCorrida != null && oferta.minCorrida > 0) {
            tempoTotalMin = (oferta.minBusca ?: 5) + oferta.minCorrida
            tempoFoiEstimado = false
        } else {
            tempoTotalMin = (kmTotal * 1.65).roundToInt().coerceAtLeast(6)
            tempoFoiEstimado = true
        }

        val custoCombPorKm = if (config.consumoKmL > 0) {
            config.precoLitroCombustivel / config.consumoKmL
        } else {
            0.65
        }
        val custoCombustivel = kmTotal * custoCombPorKm
        val custoManutencao = kmTotal * config.custoManutencaoPorKm
        val custoOperacionalTotal = custoCombustivel + custoManutencao
        val lucroLiquido = oferta.valorOferecido - custoOperacionalTotal

        val reaisPorKmReal = if (kmTotal > 0) oferta.valorOferecido / kmTotal else 0.0
        val reaisPorKmLiquido = if (kmTotal > 0) lucroLiquido / kmTotal else 0.0
        val horas = tempoTotalMin / 60.0
        val reaisPorHoraBruto = if (horas > 0) oferta.valorOferecido / horas else 0.0
        val reaisPorHoraLiquido = if (horas > 0) lucroLiquido / horas else 0.0

        val destinoLower = (oferta.enderecoDestinoB ?: "").lowercase()
        val temVoltaVazia = BAIRROS_VOLTA_VAZIA_MANAUS.any { destinoLower.contains(it) }

        // Meta de contraproposta (soma margem extra se o bairro tiver risco de volta vazia)
        val metaBrutoKmAlvo = if (temVoltaVazia) config.metaBrutaPorKm + 0.30 else config.metaBrutaPorKm
        val contrapropostaMinima = ceil(
            maxOf(
                kmTotal * metaBrutoKmAlvo,
                custoOperacionalTotal + (kmTotal * config.metaLiquidaPorKm)
            )
        )

        val melhorBotao = oferta.contrapropostas.minByOrNull { kotlin.math.abs(it - contrapropostaMinima) }

        val alertas = mutableListOf<String>()
        if (temVoltaVazia) {
            alertas.add("⚠️ Volta Vazia provável no destino")
        }
        if (oferta.kmBusca > config.buscaMaximaKm) {
            alertas.add("📍 Busca longa (${String.format("%.1f", oferta.kmBusca)} km)")
        }
        if (oferta.qtdAvaliacoes != null && oferta.qtdAvaliacoes < config.avaliacoesMinimasConfiaveis) {
            alertas.add("👤 Poucas avaliações (${oferta.qtdAvaliacoes})")
        }
        if (oferta.notaPassageiro != null && oferta.notaPassageiro < config.notaMinimaPassageiro) {
            alertas.add("⭐ Nota baixa (${oferta.notaPassageiro})")
        }
        if (oferta.tempoPedidoMin != null && oferta.tempoPedidoMin >= 5) {
            alertas.add("⏳ Pedido parado há ${oferta.tempoPedidoMin} min")
        }

        val veredito = when {
            reaisPorKmLiquido < (if (temVoltaVazia) 1.05 else 0.85) || reaisPorHoraLiquido < 22.0 -> RideVerdict.BAD
            reaisPorKmLiquido < (if (temVoltaVazia) 1.45 else 1.25) || reaisPorHoraLiquido < config.metaLiquidaPorHora -> RideVerdict.REGULAR
            else -> RideVerdict.GOOD
        }

        val prefixoVoz = when (veredito) {
            RideVerdict.GOOD -> "Corrida boa"
            RideVerdict.REGULAR -> "Corrida regular"
            RideVerdict.BAD -> "Corrida ruim"
        }
        val centavosKm = (reaisPorKmReal * 100).roundToInt()
        val falaKm = if (centavosKm < 100) {
            "$centavosKm centavos por quilômetro"
        } else {
            String.format("%.2f reais por quilômetro", reaisPorKmReal).replace(".", " e ")
        }
        val textoVoz = "$prefixoVoz, $falaKm. Sobra livre ${lucroLiquido.roundToInt()} reais. " +
            if (oferta.valorOferecido < contrapropostaMinima) {
                "Contraproposta mínima: ${contrapropostaMinima.roundToInt()} reais."
            } else {
                "Bateu a meta."
            }

        return RideAnalysis(
            oferta = oferta,
            kmTotal = kmTotal,
            tempoTotalMin = tempoTotalMin,
            tempoFoiEstimado = tempoFoiEstimado,
            reaisPorKmReal = reaisPorKmReal,
            reaisPorKmLiquido = reaisPorKmLiquido,
            reaisPorHoraBruto = reaisPorHoraBruto,
            reaisPorHoraLiquido = reaisPorHoraLiquido,
            custoCombustivel = custoCombustivel,
            custoManutencao = custoManutencao,
            lucroLiquido = lucroLiquido,
            contrapropostaMinima = contrapropostaMinima,
            melhorBotaoContraproposta = melhorBotao,
            temVoltaVazia = temVoltaVazia,
            alertas = alertas,
            veredito = veredito,
            textoVoz = textoVoz
        )
    }
}
