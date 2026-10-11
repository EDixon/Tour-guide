package uk.co.roboverse.tourguide

import android.content.ContentValues
import android.net.Uri
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.ComponentActivity
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

/**
 * Runs the on-phone model (Gemma via LiteRT-LM) for the web app.
 *
 * JS → native: window.TourLLMNative.{status, download, importModel, deleteModel, load, ask, cancel, saveText, appVersion}
 * native → JS: window.TourLLM._event({type: 'status'|'token'|'done'|'error', ...})
 *
 * The web app builds the whole prompt (facts, notes, question); this side only runs the model.
 */
class LlmBridge(
    private val activity: ComponentActivity,
    private val web: WebView,
    private val requestImport: () -> Unit,
) {
    private val tag = "TourLLM"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val loadLock = Mutex()
    val store = ModelStore(activity) { emitStatus() }

    @Volatile private var engine: Engine? = null
    @Volatile private var backendName = ""
    @Volatile private var loadState = "idle" // idle | loading | loaded | error
    @Volatile private var loadError: String? = null
    @Volatile private var loadMs = 0L
    @Volatile private var current: Pair<String, Conversation>? = null

    val js = Js()

    inner class Js {
        @JavascriptInterface fun status(): String = statusJson().toString()
        @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun download() = store.startDownload(BuildConfig.MODEL_REPO)
        @JavascriptInterface fun importModel() = activity.runOnUiThread { requestImport() }
        @JavascriptInterface fun deleteModel() { unload(); store.delete(); emitStatus() }
        @JavascriptInterface fun load() { scope.launch { ensureLoaded() } }
        @JavascriptInterface fun ask(id: String, prompt: String, maxTokens: Int) { scope.launch { runAsk(id, prompt, maxTokens) } }
        @JavascriptInterface fun cancel(id: String) {
            val c = current
            if (c != null && c.first == id) runCatching { c.second.cancelProcess() }
        }
        /** Saves a text file (e.g. a GPX track) to Downloads. Returns true on success. */
        @JavascriptInterface fun saveText(name: String, mime: String, text: String): Boolean = runCatching {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
            }
            val uri = activity.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            activity.contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
            true
        }.getOrDefault(false)
    }

    fun importFrom(uri: Uri) = store.importFrom(uri)

    // ------------------------------------------------------------------ model lifecycle
    private suspend fun ensureLoaded(): Engine? = loadLock.withLock {
        engine?.let { return it }
        val file = store.modelFile() ?: run {
            loadState = "error"; loadError = "No model on the phone yet."; emitStatus(); return null
        }
        loadState = "loading"; loadError = null; emitStatus()
        val t0 = SystemClock.elapsedRealtime()
        // GPU first (much faster); fall back to CPU if the GPU path fails on this phone.
        val attempts = listOf("GPU" to { Backend.GPU() as Backend }, "CPU" to { Backend.CPU() as Backend })
        var lastError: Throwable? = null
        for ((name, backend) in attempts) {
            try {
                val e = Engine(EngineConfig(modelPath = file.absolutePath, backend = backend(), maxNumTokens = 4096, cacheDir = activity.cacheDir.path))
                e.initialize()
                engine = e; backendName = name; loadState = "loaded"; loadMs = SystemClock.elapsedRealtime() - t0
                Log.i(tag, "Model loaded on $name in ${loadMs} ms")
                emitStatus()
                return e
            } catch (t: Throwable) {
                Log.w(tag, "Loading on $name failed", t); lastError = t
            }
        }
        loadState = "error"; loadError = lastError?.message ?: "Couldn't load the model."
        emitStatus()
        null
    }

    fun unload() {
        runCatching { current?.second?.cancelProcess() }
        runCatching { engine?.close() }
        engine = null; loadState = "idle"; backendName = ""
    }

    fun close() { unload(); store.close(); scope.cancel() }

    // ------------------------------------------------------------------ asking
    private suspend fun runAsk(id: String, prompt: String, maxTokens: Int) {
        val e = ensureLoaded() ?: return emit(JSONObject().put("type", "error").put("id", id).put("message", loadError ?: "Model not available"))
        current?.let { runCatching { it.second.cancelProcess() } }
        val t0 = SystemClock.elapsedRealtime()
        var firstMs = -1L
        val conv = try {
            e.createConversation(
                ConversationConfig(
                    samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = 0.3),
                    maxOutputToken = maxTokens.coerceIn(32, 1024),
                )
            )
        } catch (t: Throwable) {
            return emit(JSONObject().put("type", "error").put("id", id).put("message", t.message ?: "Couldn't start"))
        }
        current = id to conv
        try {
            conv.sendMessageAsync(prompt, object : MessageCallback {
                override fun onMessage(message: Message) {
                    if (firstMs < 0) firstMs = SystemClock.elapsedRealtime() - t0
                    emit(JSONObject().put("type", "token").put("id", id).put("text", message.toString()))
                }
                override fun onDone() {
                    emit(JSONObject().put("type", "done").put("id", id)
                        .put("firstMs", firstMs).put("totalMs", SystemClock.elapsedRealtime() - t0).put("backend", backendName))
                    finish(id, conv)
                }
                override fun onError(throwable: Throwable) {
                    emit(JSONObject().put("type", "error").put("id", id).put("message", throwable.message ?: "Error"))
                    finish(id, conv)
                }
            })
        } catch (t: Throwable) {
            emit(JSONObject().put("type", "error").put("id", id).put("message", t.message ?: "Error"))
            finish(id, conv)
        }
    }

    private fun finish(id: String, conv: Conversation) {
        scope.launch {
            if (current?.first == id) current = null
            runCatching { conv.close() }
        }
    }

    // ------------------------------------------------------------------ to the web app
    fun statusJson(): JSONObject = JSONObject()
        .put("state", when {
            loadState == "loaded" -> "loaded"
            loadState == "loading" -> "loading"
            store.downloading() -> "downloading"
            store.modelFile() != null -> if (loadState == "error") "error" else "ready"
            else -> if (store.lastError != null) "error" else "none"
        })
        .put("error", loadError ?: store.lastError ?: JSONObject.NULL)
        .put("backend", backendName)
        .put("loadMs", loadMs)
        .put("model", store.modelFile()?.name ?: JSONObject.NULL)
        .put("modelBytes", store.modelFile()?.length() ?: 0)
        .put("progress", store.progressJson())
        .put("appVersion", BuildConfig.VERSION_NAME)

    fun emitStatus() = emit(JSONObject().put("type", "status").put("status", statusJson()))

    private fun emit(event: JSONObject) {
        val js = "window.TourLLM && window.TourLLM._event($event)"
        web.post { web.evaluateJavascript(js, null) }
    }
}
