package br.com.meuturno.indrive

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Painel de Controle do Leitor Automático inDrive (Estilo Uber OLED Dark).
 * Permite:
 * 1. Conceder permissão de Janela Flutuante (SYSTEM_ALERT_WINDOW);
 * 2. Ativar o Serviço de Acessibilidade (InDriveAccessibilityService);
 * 3. Testar na hora o HUD Flutuante com os dados reais das Telas 1 e 2 de Manaus.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 64)
        }

        val titulo = TextView(this).apply {
            text = "🖤 Meu Turno — Leitor inDrive"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }

        val subtitulo = TextView(this).apply {
            text = "Ative as duas permissões abaixo para que o semáforo 🟢🟡🔴 apareça sozinho quando tocar corrida no inDrive."
            textSize = 14f
            setTextColor(Color.parseColor("#A6A6A6"))
            setPadding(0, 16, 0, 36)
        }

        val btnOverlay = criarBotao("1. Permitir Janela Flutuante (Sobreposição)", "#276EF1", Color.WHITE) {
            if (!Settings.canDrawOverlays(this)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivity(intent)
            } else {
                Toast.makeText(this, "✅ Janela Flutuante já autorizada!", Toast.LENGTH_SHORT).show()
            }
        }

        val btnAcessibilidade = criarBotao("2. Ativar Leitor de Tela (Acessibilidade)", "#06C167", Color.BLACK) {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        val btnSimularTela2 = criarBotao("🚦 Testar HUD (Tela 2: R$ 20 • Tarumã 21 km)", "#1F1F1F", Color.WHITE) {
            if (!Settings.canDrawOverlays(this)) {
                Toast.makeText(this, "Autorize a Janela Flutuante no botão 1 primeiro!", Toast.LENGTH_LONG).show()
                return@criarBotao
            }
            val textosTela2 = listOf(
                "Pedido de viagem",
                "18,6 km",
                "6 min",
                "2,4 km",
                "R$ 0,8/km",
                "~2,4 km",
                "R$ 20",
                "Timóteo",
                "4.72 (611)",
                "1 min.",
                "Rua Joaquim Sarmento 239 (Centro)",
                "Drogaria Riachuelo (Rua Marquês de Sapucáia - Tarumã, Manaus - State of Amazonas)",
                "PIX",
                "Aceitar por R$ 20",
                "R$ 22",
                "R$ 23,50"
            )
            val oferta = RideOfferParser.extrairOferta(textosTela2)
            if (oferta != null) {
                val analise = RideCalculator.analisar(oferta)
                OverlayHudService.exibirAnalise(this, analise)
                Toast.makeText(this, "HUD Flutuante exibido no topo da tela!", Toast.LENGTH_SHORT).show()
            }
        }

        val btnFecharHud = criarBotao("Fechar Janela Flutuante", "#141414", Color.parseColor("#E11900")) {
            OverlayHudService.fechar(this)
        }

        container.addView(titulo)
        container.addView(subtitulo)
        container.addView(btnOverlay)
        container.addView(btnAcessibilidade)
        container.addView(btnSimularTela2)
        container.addView(btnFecharHud)

        scroll.addView(container)
        setContentView(scroll)
    }

    private fun criarBotao(texto: String, corFundoHex: String, corTexto: Int, acao: () -> Unit): Button {
        return Button(this).apply {
            text = texto
            isAllCaps = false
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setBackgroundColor(Color.parseColor(corFundoHex))
            setTextColor(corTexto)
            gravity = Gravity.CENTER
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = 24
            }
            layoutParams = lp
            setPadding(24, 34, 24, 34)
            setOnClickListener { acao() }
        }
    }
}
