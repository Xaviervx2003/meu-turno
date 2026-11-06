package br.com.meuturno.indrive

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.roundToInt

/**
 * Janela Flutuante (Overlay HUD) no padrão Uber OLED Dark (#000000) com semáforo 🟢🟡🔴.
 * Fica sobre o inDrive sem roubar o foco e pode ser arrastada com o dedo.
 */
class OverlayHudService : Service() {

    private var windowManager: WindowManager? = null
    private var containerView: LinearLayout? = null
    private var tvTituloSemaforo: TextView? = null
    private var tvMetricasPrincipais: TextView? = null
    private var tvContraproposta: TextView? = null
    private var tvAlertas: TextView? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        criarJanelaFlutuante()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_FECHAR) {
            stopSelf()
            return START_NOT_STICKY
        }
        ultimaAnalise?.let { atualizarConteudo(it) }
        return START_STICKY
    }

    private fun criarJanelaFlutuante() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val bg = GradientDrawable().apply {
            setColor(Color.parseColor("#141414"))
            cornerRadius = 32f
            setStroke(3, Color.parseColor("#292929"))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            setPadding(32, 24, 32, 24)
        }

        tvTituloSemaforo = TextView(this).apply {
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            text = "🟢 MEU TURNO • LEITOR ATIVO"
        }

        tvMetricasPrincipais = TextView(this).apply {
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(0, 6, 0, 4)
        }

        tvContraproposta = TextView(this).apply {
            textSize = 12.5f
            setTextColor(Color.parseColor("#FFC043"))
        }

        tvAlertas = TextView(this).apply {
            textSize = 11.5f
            setTextColor(Color.parseColor("#A6A6A6"))
            visibility = View.GONE
        }

        root.addView(tvTituloSemaforo)
        root.addView(tvMetricasPrincipais)
        root.addView(tvContraproposta)
        root.addView(tvAlertas)

        val tipoOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            tipoOverlay,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 140
        }

        // Permite arrastar a janela flutuante com 1 dedo e fechar com toque duplo
        var initialX = 0
        var initialY = 0
        var touchX = 0f
        var touchY = 0f
        root.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - touchX).toInt()
                    params.y = initialY + (event.rawY - touchY).toInt()
                    windowManager?.updateViewLayout(root, params)
                    true
                }
                else -> false
            }
        }

        containerView = root
        windowManager?.addView(root, params)
    }

    private fun atualizarConteudo(a: RideAnalysis) {
        val (icone, rotulo, corHex) = when (a.veredito) {
            RideVerdict.GOOD -> Triple("🟢", "BOA • ACEITAR", "#06C167")
            RideVerdict.REGULAR -> Triple("🟡", "MÉDIA • CONTRAPROPOR", "#FFC043")
            RideVerdict.BAD -> Triple("🔴", "RUIM • PREJUÍZO", "#E11900")
        }

        val bg = GradientDrawable().apply {
            setColor(Color.parseColor("#141414"))
            cornerRadius = 32f
            setStroke(4, Color.parseColor(corHex))
        }
        containerView?.background = bg

        tvTituloSemaforo?.text =
            "$icone $rotulo  |  Sobra: R$ ${a.lucroLiquido.roundToInt()}"
        tvTituloSemaforo?.setTextColor(Color.parseColor(corHex))

        val txtMin = if (a.tempoFoiEstimado) "~${a.tempoTotalMin}m" else "${a.tempoTotalMin}m"
        tvMetricasPrincipais?.text = String.format(
            "R$ %.2f/km real (Líq R$ %.2f/km) • R$ %d/h • %.1f km (%s)",
            a.reaisPorKmReal,
            a.reaisPorKmLiquido,
            a.reaisPorHoraLiquido.roundToInt(),
            a.kmTotal,
            txtMin
        )

        tvContraproposta?.text = if (a.oferta.valorOferecido < a.contrapropostaMinima) {
            "✏️ Peça no mínimo R$ ${a.contrapropostaMinima.roundToInt()} na canetinha"
        } else {
            "✅ Oferta de R$ ${a.oferta.valorOferecido.roundToInt()} atinge sua meta"
        }

        if (a.alertas.isNotEmpty()) {
            tvAlertas?.visibility = View.VISIBLE
            tvAlertas?.text = a.alertas.joinToString(" • ")
        } else {
            tvAlertas?.visibility = View.GONE
        }
    }

    override fun onDestroy() {
        containerView?.let { windowManager?.removeView(it) }
        containerView = null
        super.onDestroy()
    }

    companion object {
        private const val ACTION_FECHAR = "br.com.meuturno.indrive.FECHAR_HUD"
        private var ultimaAnalise: RideAnalysis? = null

        fun exibirAnalise(context: Context, analise: RideAnalysis) {
            if (!Settings.canDrawOverlays(context)) return
            ultimaAnalise = analise
            val intent = Intent(context, OverlayHudService::class.java)
            context.startService(intent)
        }

        fun fechar(context: Context) {
            val intent = Intent(context, OverlayHudService::class.java).apply {
                action = ACTION_FECHAR
            }
            context.startService(intent)
        }
    }
}
