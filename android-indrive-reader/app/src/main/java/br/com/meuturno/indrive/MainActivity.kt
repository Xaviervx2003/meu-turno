package br.com.meuturno.indrive

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlin.math.roundToInt

/**
 * Tela de configuração da bolha (visual escuro estilo Uber):
 * 1. Permissão de janela flutuante; 2. Leitor de tela; 3. Custos do carro; 4. Teste e diagnóstico.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var statusOverlay: TextView
    private lateinit var statusLeitor: TextView
    private lateinit var statusLeituras: TextView
    private val prefs by lazy { getSharedPreferences(InDriveAccessibilityService.PREFS, MODE_PRIVATE) }

    private fun dp(v: Float) =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).roundToInt()

    private fun cartao(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply {
            setColor(Color.parseColor("#141414"))
            cornerRadius = dp(18f).toFloat()
            setStroke(dp(1f), Color.parseColor("#292929"))
        }
        setPadding(dp(16f), dp(16f), dp(16f), dp(16f))
    }

    private fun texto(t: String, tam: Float, cor: Int, negrito: Boolean = false) = TextView(this).apply {
        text = t
        setTextSize(TypedValue.COMPLEX_UNIT_SP, tam)
        setTextColor(cor)
        if (negrito) typeface = Typeface.DEFAULT_BOLD
    }

    private fun botao(t: String, fundo: String, corTexto: Int, acao: () -> Unit) = TextView(this).apply {
        text = t
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(corTexto)
        background = GradientDrawable().apply {
            setColor(Color.parseColor(fundo))
            cornerRadius = dp(14f).toFloat()
        }
        minHeight = dp(52f)
        setPadding(dp(12f), dp(12f), dp(12f), dp(12f))
        setOnClickListener { acao() }
    }

    private fun LinearLayout.add(v: android.view.View, topo: Float = 10f) {
        addView(v, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(topo) })
    }

    private fun campoNumero(rotulo: String, chave: String, padrao: Float): LinearLayout {
        val linha = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val lbl = texto(rotulo, 14f, Color.parseColor("#A6A6A6"))
        val input = EditText(this).apply {
            setText(prefs.getFloat(chave, padrao).toString())
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.END
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1F1F1F"))
                cornerRadius = dp(10f).toFloat()
            }
            setPadding(dp(12f), dp(10f), dp(12f), dp(10f))
            setOnFocusChangeListener { _, temFoco ->
                if (!temFoco) {
                    val v = text.toString().replace(",", ".").toFloatOrNull()
                    if (v != null && v > 0f) prefs.edit().putFloat(chave, v).apply()
                }
            }
        }
        linha.addView(lbl, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        linha.addView(input, LinearLayout.LayoutParams(dp(110f), LinearLayout.LayoutParams.WRAP_CONTENT))
        return linha
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18f), dp(28f), dp(18f), dp(40f))
        }

        col.add(texto("Meu Turno Bolha", 26f, Color.WHITE, true), 0f)
        col.add(texto("Mostra se a corrida do inDrive compensa assim que o pedido aparece. Só lê a tela, nunca aceita nada sozinho.", 14f, Color.parseColor("#A6A6A6")), 6f)

        // 1. Permissões
        val c1 = cartao()
        c1.add(texto("1. PERMISSÕES", 12f, Color.parseColor("#A6A6A6"), true), 0f)
        statusOverlay = texto("", 15f, Color.WHITE, true)
        c1.add(statusOverlay)
        c1.add(botao("Permitir janela flutuante", "#276EF1", Color.WHITE) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }, 8f)
        statusLeitor = texto("", 15f, Color.WHITE, true)
        c1.add(statusLeitor, 14f)
        c1.add(botao("Ativar leitor de tela", "#06C167", Color.BLACK) {
            Toast.makeText(this, "Procure \"Meu Turno Bolha\" em Apps instalados e ative", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }, 8f)
        c1.add(texto("Se o botão aparecer cinza (\"configuração restrita\"): Configurações › Apps › Meu Turno Bolha › ⋮ › Permitir configurações restritas.", 12f, Color.parseColor("#8A8A8A")), 8f)
        col.add(c1, 18f)

        // 2. Custos do carro
        val c2 = cartao()
        c2.add(texto("2. SEU CARRO", 12f, Color.parseColor("#A6A6A6"), true), 0f)
        c2.add(campoNumero("Consumo (km/l)", "consumo_kml", 10f))
        c2.add(campoNumero("Preço do litro (R$)", "preco_litro", 6.5f))
        c2.add(campoNumero("Manutenção por km (R$)", "custo_manut_km", 0.15f))
        c2.add(campoNumero("Meta bruta por km (R$)", "meta_bruta_km", 1.5f))
        val voz = Switch(this).apply {
            text = "Falar o resultado em voz alta"
            setTextColor(Color.WHITE)
            isChecked = prefs.getBoolean("falar_voz", true)
            setOnCheckedChangeListener { _, on -> prefs.edit().putBoolean("falar_voz", on).apply() }
        }
        c2.add(voz, 12f)
        col.add(c2, 14f)

        // 3. Teste e diagnóstico
        val c3 = cartao()
        c3.add(texto("3. TESTE", 12f, Color.parseColor("#A6A6A6"), true), 0f)
        c3.add(botao("Mostrar bolha de exemplo (R$ 20 · Tarumã)", "#1F1F1F", Color.WHITE) { testarBolha() })
        statusLeituras = texto("", 13f, Color.parseColor("#A6A6A6"))
        c3.add(statusLeituras, 12f)
        c3.add(botao("Copiar o que foi lido do inDrive", "#1F1F1F", Color.parseColor("#FFC043")) {
            val lido = prefs.getString(InDriveAccessibilityService.KEY_ULTIMOS_TEXTOS, null)
            if (lido.isNullOrBlank()) {
                Toast.makeText(this, "Nada lido ainda. Abra um pedido no inDrive primeiro.", Toast.LENGTH_LONG).show()
            } else {
                (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager)
                    .setPrimaryClip(ClipData.newPlainText("leitura inDrive", lido))
                Toast.makeText(this, "Copiado! Cole e envie para ajustar o leitor.", Toast.LENGTH_LONG).show()
            }
        }, 8f)
        c3.add(botao("Fechar bolha", "#141414", Color.parseColor("#FF4D3A")) {
            OverlayHudService.fechar(this)
        }, 8f)
        col.add(c3, 14f)

        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(col)
        })
    }

    override fun onResume() {
        super.onResume()
        val overlayOk = Settings.canDrawOverlays(this)
        statusOverlay.text = if (overlayOk) "✅ Janela flutuante liberada" else "⚪ Janela flutuante desligada"
        val leitorOk = leitorAtivo()
        statusLeitor.text = if (leitorOk) "✅ Leitor de tela ligado" else "⚪ Leitor de tela desligado"
        val n = prefs.getInt(InDriveAccessibilityService.KEY_PEDIDOS_LIDOS, 0)
        statusLeituras.text = if (n > 0) "Pedidos do inDrive reconhecidos até agora: $n"
        else "Nenhum pedido reconhecido ainda. Fique online no inDrive para testar."
    }

    private fun leitorAtivo(): Boolean {
        val ativos = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return ativos.contains("$packageName/") && ativos.contains("InDriveAccessibilityService")
    }

    private fun testarBolha() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Libere a janela flutuante primeiro", Toast.LENGTH_LONG).show()
            return
        }
        val textosExemplo = listOf(
            "Pedido de viagem", "18,6 km", "6 min", "2,4 km", "R$ 0,8/km", "~2,4 km", "R$ 20",
            "Timóteo", "4.72", "(611)", "1 min.",
            "Rua Joaquim Sarmento 239 (Centro)",
            "Drogaria Riachuelo (Rua Marquês de Sapucáia - Tarumã, Manaus - State of Amazonas)",
            "PIX", "Aceitar por R$ 20", "R$ 22", "R$ 23,50"
        )
        val oferta = RideOfferParser.extrairOferta(textosExemplo) ?: return
        val config = DriverConfig(
            consumoKmL = prefs.getFloat("consumo_kml", 10f).toDouble(),
            precoLitroCombustivel = prefs.getFloat("preco_litro", 6.5f).toDouble(),
            custoManutencaoPorKm = prefs.getFloat("custo_manut_km", 0.15f).toDouble(),
            metaBrutaPorKm = prefs.getFloat("meta_bruta_km", 1.5f).toDouble()
        )
        OverlayHudService.exibirAnalise(this, RideCalculator.analisar(oferta, config))
        Toast.makeText(this, "Bolha exibida no topo da tela", Toast.LENGTH_SHORT).show()
    }
}
