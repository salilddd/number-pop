package com.numberpop.game

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * A shell around the web game and nothing else.
 *
 * No game logic lives on this side of the line. Everything here is one of four
 * things the browser cannot do for itself: serve the game from a real origin,
 * keep the screen awake, stay out from behind the system bars, and turn the
 * hardware back button into something the game understands.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    /**
     * Serving the game from a synthetic https origin rather than `file://` is
     * the entire reason this uses [WebViewAssetLoader].
     *
     * `ambience.js` fetches the jungle loop and decodes it so it can crossfade
     * the loop seam, and falls back to a bare `<audio>` element when fetch
     * refuses the origin -- which is exactly what `file://` does. A real
     * origin keeps the good path. It is also what makes `localStorage`
     * durable: `file://` pages get an opaque origin, and the highscores and
     * per-fact practice history in `storage.js` would not survive a relaunch.
     */
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw under the system bars and into the display cutout, so the
        // env(safe-area-inset-*) rules the stylesheet already uses get real
        // numbers instead of zeroes. index.html sets viewport-fit=cover,
        // which is the other half of this.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        // A child working out 7 x 8 is not idle, but the display server has no
        // way to tell the difference. Nothing in this app ever wants a timeout.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this).apply {
            // Painted under the canvas until the first frame lands, so the
            // launch does not flash white on the way into a dark game.
            setBackgroundColor(BACKDROP)
            webViewClient = GameClient()
            settings.run {
                javaScriptEnabled = true

                // storage.js silently falls back to an in-memory store without
                // this, which loses every highscore the moment the app closes.
                domStorageEnabled = true

                // audio.js unlocks the AudioContext on the first pointerdown
                // anyway; this stops the WebView blocking the ambience loop
                // before that gesture arrives.
                mediaPlaybackRequiresUserGesture = false

                // The page is served from assets by the loader above, so it
                // never needs either of these. Off by default on modern API
                // levels, set explicitly because they are worth being sure of.
                allowFileAccess = false
                allowContentAccess = false
            }
        }
        setContentView(webView)
        webView.loadUrl(START_URL)

        onBackPressedDispatcher.addCallback(this, backCallback)
        goImmersive()
    }

    private inner class GameClient : WebViewClient() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            val url = request.url
            if (url.host == ASSET_HOST) return assetLoader.shouldInterceptRequest(url)

            /* Everything else is refused outright rather than left to fail on
               its own. The app holds no INTERNET permission, so the one
               outbound request the page makes -- the Fredoka webfont linked in
               index.html -- cannot succeed regardless; answering it here means
               the CSS fallback stack takes over on the first paint instead of
               after the network stack gives up. */
            return if (url.scheme == "http" || url.scheme == "https") blocked() else null
        }
    }

    /** A fresh instance per call: a response's stream cannot be served twice. */
    private fun blocked() = WebResourceResponse(
        "text/plain",
        "utf-8",
        404,
        "Blocked",
        emptyMap(),
        ByteArrayInputStream(ByteArray(0))
    )

    /**
     * The web side decides what back means.
     *
     * `NP.app.back()` in `main.js` mirrors each screen's own back button and
     * returns false only from home, where leaving really does mean leaving.
     * Back is the one system gesture that can end a run outright, so from the
     * play field it pauses instead -- the same reasoning that keeps quitting
     * two taps deep on the pause card.
     */
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            webView.evaluateJavascript(BACK_JS) { handled ->
                if (handled != "true") finish()
            }
        }
    }

    private fun goImmersive() {
        WindowInsetsControllerCompat(window, window.decorView).run {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // The bars come back after a swipe or an app switch. Put them away
        // again, or the play field quietly loses its bottom strip for good.
        if (hasFocus) goImmersive()
    }

    override fun onPause() {
        super.onPause()
        // Stops rAF, timers and audio. main.js also pauses the run off
        // visibilitychange, which the WebView fires as the activity leaves --
        // so a child switching apps mid-question does not lose a life.
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        // Detach before destroy: a WebView torn down while still attached to
        // the view tree is a documented way to leak the activity.
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$ASSET_HOST/www/index.html"

        /** Guarded so a back press during the first paint cannot throw. */
        const val BACK_JS = "window.NP && NP.app ? NP.app.back() : false"

        /** The <meta name="theme-color"> from index.html. */
        val BACKDROP = 0xFF1B1C1A.toInt()
    }
}
