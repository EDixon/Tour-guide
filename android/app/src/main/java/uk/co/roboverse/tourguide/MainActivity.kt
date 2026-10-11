package uk.co.roboverse.tourguide

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The Tour Guide web app in a WebView, plus a JavaScript bridge (`window.TourLLMNative`) to the
 * on-phone language model. The web app is loaded from GitHub Pages and cached by its service worker,
 * so content updates arrive without reinstalling; the APK only changes when the native side does.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var llm: LlmBridge
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null

    private val locationPermission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result.values.any { it }
            pendingGeo?.let { (origin, cb) -> cb.invoke(origin, granted, false) }
            pendingGeo = null
        }

    private val pickModel =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            if (uri != null) llm.importFrom(uri) else llm.emitStatus()
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(true)

        // A WebView ignores its own padding, so it sits inside a container that keeps it clear of the
        // status bar, camera cut-out, navigation bar and keyboard. The container shows the brand colour
        // behind the system bars.
        val root = FrameLayout(this).apply { setBackgroundColor(0xFF1F4D3A.toInt()) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = false
        WindowCompat.getInsetsController(window, root).isAppearanceLightNavigationBars = false

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString TourGuideApp/${BuildConfig.VERSION_NAME}"
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                val fine = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION)
                if (fine == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeo = origin to callback
                    locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
            }
        }
        web.webViewClient = object : WebViewClient() {
            // Keep the guide in the app; open anything else (sources, operator pages) in the browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == BuildConfig.SITE_HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }
        }

        llm = LlmBridge(this, web) { pickModel.launch(arrayOf("*/*")) }
        web.addJavascriptInterface(llm.js, "TourLLMNative")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Let the web app close an open sheet first; otherwise go back or leave.
                web.evaluateJavascript("(window.TourApp && window.TourApp.back && window.TourApp.back()) ? 1 : 0") { r ->
                    if (r != "1") { if (web.canGoBack()) web.goBack() else finish() }
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(BuildConfig.SITE_URL)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        // Free the model (about 3 GB) if Android is short of memory while we're in the background.
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) llm.unload()
    }

    override fun onDestroy() {
        llm.close()
        web.destroy()
        super.onDestroy()
    }
}
