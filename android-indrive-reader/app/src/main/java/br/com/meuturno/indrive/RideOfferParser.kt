package br.com.meuturno.indrive

/**
 * Representa todos os dados extraídos da tela "Pedido de viagem" do inDrive.
 */
data class InDriveOffer(
    val valorOferecido: Double,
    val reaisPorKmExibidoPeloApp: Double?,
    val kmBusca: Double,
    val minBusca: Int?,
    val kmCorrida: Double,
    val minCorrida: Int?,
    val passageiro: String?,
    val notaPassageiro: Double?,
    val qtdAvaliacoes: Int?,
    val tempoPedidoMin: Int?,
    val enderecoOrigemA: String?,
    val enderecoDestinoB: String?,
    val formaPagamento: String?,
    val contrapropostas: List<Double>
)

object RideOfferParser {
    private val REGEX_ACEITAR_POR = Regex("""Aceitar\s+por\s+R\$\s*(\d+(?:[.,]\d+)?)""", RegexOption.IGNORE_CASE)
    private val REGEX_REAIS_KM_APP = Regex("""R\$\s*(\d+(?:[.,]\d+)?)\s*/\s*km""", RegexOption.IGNORE_CASE)
    private val REGEX_VALOR_REAIS = Regex("""^R\$\s*(\d+(?:[.,]\d+)?)$""", RegexOption.IGNORE_CASE)
    private val REGEX_KM_BUSCA_TIL = Regex("""~\s*(\d+(?:[.,]\d+)?)\s*km""", RegexOption.IGNORE_CASE)
    private val REGEX_KM_QUALQUER = Regex("""(\d+(?:[.,]\d+)?)\s*km""", RegexOption.IGNORE_CASE)
    private val REGEX_MIN_ROTA = Regex("""^(\d+)\s*min$""", RegexOption.IGNORE_CASE)
    private val REGEX_MIN_PEDIDO = Regex("""^(\d+)\s*min\.$""", RegexOption.IGNORE_CASE)
    private val REGEX_NOTA_AVAL = Regex("""(\d+[.,]\d+)\s*\(?(\d+)\)?""")
    private val REGEX_APENAS_AVAL = Regex("""^\((\d+)\)$""")

    private fun parseDoubleBR(raw: String): Double =
        raw.trim().replace(",", ".").toDoubleOrNull() ?: 0.0

    /**
     * Recebe a lista de textos visíveis capturados da tela do inDrive pelo AccessibilityService
     * e reconstrói o objeto [InDriveOffer].
     */
    fun extrairOferta(textosNaTela: List<String>): InDriveOffer? {
        val limpos = textosNaTela.map { it.trim() }.filter { it.isNotEmpty() }
        if (limpos.isEmpty()) return null

        val ehTelaPedido = limpos.any {
            it.contains("Pedido de viagem", ignoreCase = true) ||
                it.contains("Aceitar por R$", ignoreCase = true) ||
                it.contains("Ofereça sua tarifa", ignoreCase = true)
        }
        if (!ehTelaPedido) return null

        var valorPrincipal = 0.0
        var reaisKmApp: Double? = null
        var kmBusca = 0.0
        val kmsEncontrados = mutableListOf<Double>()
        val minsRota = mutableListOf<Int>()
        var tempoPedidoMin: Int? = null
        var nota: Double? = null
        var avaliacoes: Int? = null
        var pagamento: String? = null
        val valoresIsolados = mutableListOf<Double>()

        for (item in limpos) {
            REGEX_ACEITAR_POR.find(item)?.let {
                valorPrincipal = parseDoubleBR(it.groupValues[1])
            }
            REGEX_REAIS_KM_APP.find(item)?.let {
                reaisKmApp = parseDoubleBR(it.groupValues[1])
            }
            REGEX_KM_BUSCA_TIL.find(item)?.let {
                kmBusca = parseDoubleBR(it.groupValues[1])
            }
            REGEX_KM_QUALQUER.findAll(item).forEach { m ->
                val v = parseDoubleBR(m.groupValues[1])
                if (v > 0) kmsEncontrados.add(v)
            }
            REGEX_MIN_ROTA.find(item)?.let {
                minsRota.add(it.groupValues[1].toInt())
            }
            REGEX_MIN_PEDIDO.find(item)?.let {
                tempoPedidoMin = it.groupValues[1].toInt()
            }
            REGEX_NOTA_AVAL.find(item)?.let {
                nota = parseDoubleBR(it.groupValues[1])
                avaliacoes = it.groupValues[2].toIntOrNull()
            }
            REGEX_APENAS_AVAL.find(item)?.let {
                avaliacoes = it.groupValues[1].toIntOrNull()
            }
            REGEX_VALOR_REAIS.find(item)?.let {
                val v = parseDoubleBR(it.groupValues[1])
                if (v > 0) valoresIsolados.add(v)
            }
            if (item.equals("PIX", ignoreCase = true) || item.equals("Dinheiro", ignoreCase = true)) {
                pagamento = item.uppercase()
            }
        }

        if (valorPrincipal <= 0.0 && valoresIsolados.isNotEmpty()) {
            valorPrincipal = valoresIsolados.first()
        }
        if (valorPrincipal <= 0.0) return null

        val contrapropostas = valoresIsolados.filter { it > valorPrincipal }.distinct().sorted()

        val kmCorrida = kmsEncontrados.maxOrNull() ?: 0.0
        if (kmBusca <= 0.0 && kmsEncontrados.size >= 2) {
            val menor = kmsEncontrados.minOrNull() ?: 0.0
            if (menor < kmCorrida) kmBusca = menor
        }
        if (kmCorrida <= 0.0) return null

        val minBusca = minsRota.minOrNull()
        val minCorrida = if (minsRota.size >= 2) minsRota.maxOrNull() else null

        // Identifica endereços A (Origem) e B (Destino)
        val candidatosEndereco = limpos.filter { txt ->
            txt.length >= 10 &&
                !txt.contains("Pedido de viagem", ignoreCase = true) &&
                !txt.contains("Ofereça sua tarifa", ignoreCase = true) &&
                !txt.contains("Preço justo", ignoreCase = true) &&
                !txt.contains("Aceitar por", ignoreCase = true) &&
                !txt.contains("R$")
        }
        val origemA = candidatosEndereco.getOrNull(0)
        val destinoB = candidatosEndereco.getOrNull(1)

        return InDriveOffer(
            valorOferecido = valorPrincipal,
            reaisPorKmExibidoPeloApp = reaisKmApp,
            kmBusca = kmBusca,
            minBusca = minBusca,
            kmCorrida = kmCorrida,
            minCorrida = minCorrida,
            passageiro = null,
            notaPassageiro = nota,
            qtdAvaliacoes = avaliacoes,
            tempoPedidoMin = tempoPedidoMin,
            enderecoOrigemA = origemA,
            enderecoDestinoB = destinoB,
            formaPagamento = pagamento,
            contrapropostas = contrapropostas
        )
    }
}
