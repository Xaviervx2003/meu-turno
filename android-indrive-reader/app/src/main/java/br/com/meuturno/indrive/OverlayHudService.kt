package br.com.meuturno.indrive

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Bolha flutuante (estilo Uber escuro) com semáforo 🟢🟡🔴 sobre o inDrive.
 * - Não rouba o foco do inDrive (FLAG_NOT_FOCUSABLE).
 * - Arrasta com o dedo, fecha no ✕ e some sozinha 40 s depois do último pedido.
 */
class OverlayHudService : Service() {

    private var wm: WindowManager? = null
    private var root: LinearLayout? = null
    private var params: WindowManager.LayoutParams? = null

    private lateinit var luz: View
    private lateinit var tvVeredito: TextView
    private lateinit var tvSobra: TextView
    private lateinit var tvKmReal: TextView
    private lateinit var tvHora: TextView
    private lateinit var tvKm: TextView
    private lateinit var tvContra: TextView
    private lateinit var tvAlertas: TextView

    private val handler = Handler(Looper.getMainLooper())
    private val esconder = Runnable { root?.visibility = View.GONE }
    private val ptBR = Locale("pt", "BR")

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        criarBolha()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_FECHAR) {
            stopSelf()
            return START_NOT_STICKY
        }
        ultimaAnalise?.let { mostrar(it) }
        return START_NOT_STICKY
    }

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).roundToInt()

    private fun fundo(cor: Int, raio: Float, borda: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            setColor(cor)
            cornerRadius = dp(raio).toFloat()
            if (borda != null) setStroke(dp(2f), borda)
        }

    private fun texto(tam: Float, cor: Int, negrito: Boolean = false): TextView =
        TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, tam)
            setTextColor(cor)
            if (negrito) typeface = Typeface.DEFAULT_BOLD
            includeFontPadding = false
        }

    private fun chip(rotulo: String): Pair<LinearLayout, TextView> {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = fundo(Color.parseColor("#1AFFFFFF"), 12f)
            setPadding(dp(9f), dp(7f), dp(9f), dp(7f))
        }
        val lbl = texto(9.5f, Color.parseColor("#A6A6A6"), true).apply { text = rotulo.uppercase(ptBR) }
        val valor = texto(14f, Color.WHITE, true).apply { text = "—"; setPadding(0, dp(3f), 0, 0) }
        box.addView(lbl)
        box.addView(valor)
        return box to valor
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun criarBolha() {
        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        val bolha = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = fundo(Color.parseColor("#F50A0A0A"), 20f, Color.parseColor("#06C167"))
            setPadding(dp(14f), dp(12f), dp(12f), dp(12f))
            elevation = dp(10f).toFloat()
        }

        // Linha do topo: luz • veredito/sobra • ✕
        val topo = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        luz = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#06C167"))
            }
        }
        topo.addView(luz, LinearLayout.LayoutParams(dp(14f), dp(14f)).apply { marginEnd = dp(10f) })

        val colunaTitulo = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        tvVeredito = texto(11f, Color.parseColor("#06C167"), true).apply { text = "LEITOR ATIVO" }
        tvSobra = texto(26f, Color.WHITE, true).apply { text = "R$ 0"; setPadding(0, dp(3f), 0, 0) }
        colunaTitulo.addView(tvVeredito)
        colunaTitulo.addView(tvSobra)
        topo.addView(colunaTitulo, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        val btnFechar = texto(15f, Color.WHITE, true).apply {
            text = "✕"
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1FFFFFFF"))
            }
            setOnClickListener {
                handler.removeCallbacks(esconder)
                root?.visibility = View.GONE
            }
        }
        topo.addView(btnFechar, LinearLayout.LayoutParams(dp(36f), dp(36f)))
        bolha.addView(topo)

        // Chips: R$/km real • líquido/hora • distância
        val linhaChips = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(10f), 0, 0)
        }
        val (c1, v1) = chip("R$/km real")
        val (c2, v2) = chip("Líq./hora")
        val (c3, v3) = chip("Distância")
        tvKmReal = v1; tvHora = v2; tvKm = v3
        listOf(c1, c2, c3).forEachIndexed { i, c ->
            linhaChips.addView(c, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                if (i < 2) marginEnd = dp(6f)
            })
        }
        bolha.addView(linhaChips)

        tvContra = texto(12.5f, Color.parseColor("#FFC043"), true).apply {
            background = fundo(Color.parseColor("#1AFFC043"), 12f)
            setPadding(dp(10f), dp(8f), dp(10f), dp(8f))
        }
        bolha.addView(tvContra, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(8f) })

        tvAlertas = texto(11.5f, Color.parseColor("#A6A6A6")).apply {
            setPadding(dp(2f), dp(7f), 0, 0)
            visibility = View.GONE
        }
        bolha.addView(tvAlertas)

        val tipo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val lp = WindowManager.LayoutParams(
            resources.displayMetrics.widthPixels - dp(20f),
            WindowManager.LayoutParams.WRAP_CONTENT,
            tipo,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(48f)
        }

        // Arrastar para cima/baixo
        var yInicial = 0
        var toqueY = 0f
        bolha.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { yInicial = lp.y; toqueY = e.rawY; true }
                MotionEvent.ACTION_MOVE -> {
                    lp.y = (yInicial + (e.rawY - toqueY)).toInt().coerceAtLeast(0)
                    wm?.updateViewLayout(bolha, lp)
                    true
                }
                else -> false
            }
        }

        bolha.visibility = View.GONE
        root = bolha
        params = lp
        wm?.addView(bolha, lp)
    }

    private fun moeda(v: Double, casas: Int = 2): String =
        String.format(ptBR, "R$ %,.${casas}f", v)

    private fun mostrar(a: RideAnalysis) {
        val bolha = root ?: return
        val (rotulo, corHex) = when (a.veredito) {
            RideVerdict.GOOD -> "BOA • PODE ACEITAR" to "#06C167"
            RideVerdict.REGULAR -> "REGULAR • CONTRAPROPONHA" to "#FFC043"
            RideVerdict.BAD -> "RUIM • RECUSE OU CONTRAPROPONHA" to "#FF4D3A"
        }
        val cor = Color.parseColor(corHex)

        bolha.background = fundo(Color.parseColor("#F50A0A0A"), 20f, cor)
        (luz.background as? GradientDrawable)?.setColor(cor)
        tvVeredito.text = rotulo
        tvVeredito.setTextColor(cor)
        tvSobra.text = "${moeda(a.lucroLiquido)}  "
        tvKmReal.text = moeda(a.reaisPorKmReal)
        tvHora.text = "${moeda(a.reaisPorHoraLiquido, 0)}/h"
        val min = if (a.tempoFoiEstimado) "~${a.tempoTotalMin}m" else "${a.tempoTotalMin}m"
        tvKm.text = String.format(ptBR, "%.1f km · %s", a.kmTotal, min)

        if (a.oferta.valorOferecido < a.contrapropostaMinima) {
            val botao = a.melhorBotaoContraproposta?.let { " · botão ${moeda(it)}" } ?: ""
            tvContra.text = "✏️ Peça no mínimo ${moeda(a.contrapropostaMinima, 0)}$botao"
            tvContra.setTextColor(Color.parseColor("#FFC043"))
            tvContra.background = fundo(Color.parseColor("#1AFFC043"), 12f)
        } else {
            tvContra.text = "✅ ${moeda(a.oferta.valorOferecido, 0)} já bate sua meta"
            tvContra.setTextColor(Color.parseColor("#06C167"))
            tvContra.background = fundo(Color.parseColor("#1A06C167"), 12f)
        }

        if (a.alertas.isNotEmpty()) {
            tvAlertas.visibility = View.VISIBLE
            tvAlertas.text = a.alertas.joinToString("   ")
        } else {
            tvAlertas.visibility = View.GONE
        }

        bolha.visibility = View.VISIBLE
        handler.removeCallbacks(esconder)
        handler.postDelayed(esconder, 40_000L)
    }

    override fun onDestroy() {
        handler.removeCallbacks(esconder)
        root?.let { runCatching { wm?.removeView(it) } }
        root = null
        super.onDestroy()
    }

    companion object {
        private const val ACTION_FECHAR = "br.com.meuturno.indrive.FECHAR_HUD"
        @Volatile private var ultimaAnalise: RideAnalysis? = null

        fun exibirAnalise(context: Context, analise: RideAnalysis) {
            if (!Settings.canDrawOverlays(context)) return
            ultimaAnalise = analise
            context.startService(Intent(context, OverlayHudService::class.java))
        }

        fun fechar(context: Context) {
            context.startService(Intent(context, OverlayHudService::class.java).apply { action = ACTION_FECHAR })
        }
    }
}
