package uk.co.roboverse.tourguide

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Keeps the model file (a .litertlm, about 2.5 GB) in the app's own storage: downloaded from Hugging Face
 * with Android's download manager (Wi-Fi only, resumable, shows a notification) or imported from a file.
 */
class ModelStore(private val context: Context, private val onChange: () -> Unit) {
    private val tag = "TourLLM"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs = context.getSharedPreferences("model", Context.MODE_PRIVATE)
    private val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val dir: File get() = File(context.getExternalFilesDir(null), "models").apply { mkdirs() }

    @Volatile var lastError: String? = null
        private set
    @Volatile private var copyBytes = 0L
    @Volatile private var copyTotal = 0L
    @Volatile private var copying = false

    init { resumeWatching() }

    fun modelFile(): File? = dir.listFiles()?.firstOrNull { it.isFile && it.name.endsWith(".litertlm") && it.length() > 100_000_000 }

    fun downloading(): Boolean = copying || prefs.getLong("downloadId", -1L) >= 0

    fun progressJson(): JSONObject {
        if (copying) return JSONObject().put("kind", "import").put("bytes", copyBytes).put("total", copyTotal)
        val id = prefs.getLong("downloadId", -1L)
        if (id < 0) return JSONObject()
        dm.query(DownloadManager.Query().setFilterById(id))?.use { c ->
            if (c.moveToFirst()) {
                return JSONObject().put("kind", "download")
                    .put("bytes", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)))
                    .put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)))
                    .put("status", c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)))
            }
        }
        return JSONObject()
    }

    /** Finds the general-purpose .litertlm file in the Hugging Face repo and downloads it. */
    fun startDownload(repo: String) {
        if (downloading()) return
        lastError = null
        scope.launch {
            try {
                val name = pickFile(repo)
                val url = "https://huggingface.co/$repo/resolve/main/$name?download=true"
                File(dir, "$name.part").delete()
                val req = DownloadManager.Request(Uri.parse(url))
                    .setTitle("Tour Guide model")
                    .setDescription(name)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setAllowedOverMetered(false)
                    .setAllowedOverRoaming(false)
                    .setDestinationUri(Uri.fromFile(File(dir, "$name.part")))
                val id = dm.enqueue(req)
                prefs.edit().putLong("downloadId", id).putString("downloadName", name).apply()
                onChange()
                watch(id, name)
            } catch (t: Throwable) {
                Log.w(tag, "Download failed to start", t)
                lastError = "Download failed: ${t.message}. You can import the file instead."
                onChange()
            }
        }
    }

    private fun pickFile(repo: String): String {
        val conn = URL("https://huggingface.co/api/models/$repo").openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 15000
        if (conn.responseCode != 200) throw IllegalStateException("Hugging Face replied ${conn.responseCode}")
        val json = JSONObject(conn.inputStream.bufferedReader().readText())
        val files = json.getJSONArray("siblings").let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("rfilename") } }
        // Prefer the generic build over chip-specific (Qualcomm, MediaTek) or web builds.
        val candidates = files.filter { it.endsWith(".litertlm") && !it.contains('/') }
            .filterNot { Regex("qualcomm|sm\\d|mt\\d|mediatek|npu|web|tensor", RegexOption.IGNORE_CASE).containsMatchIn(it) }
        return candidates.minByOrNull { it.length } ?: throw IllegalStateException("No .litertlm file found in $repo")
    }

    private fun resumeWatching() {
        val id = prefs.getLong("downloadId", -1L)
        val name = prefs.getString("downloadName", null)
        if (id >= 0 && name != null) scope.launch { watch(id, name) }
    }

    private suspend fun watch(id: Long, name: String) {
        while (true) {
            var status = -1; var reason = 0
            dm.query(DownloadManager.Query().setFilterById(id))?.use { c ->
                if (c.moveToFirst()) {
                    status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                }
            }
            when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                    val part = File(dir, "$name.part")
                    val done = File(dir, name)
                    if (!part.renameTo(done)) lastError = "Couldn't finish saving the model."
                    prefs.edit().remove("downloadId").remove("downloadName").apply()
                    onChange(); return
                }
                DownloadManager.STATUS_FAILED, -1 -> {
                    lastError = if (status == -1) "Download was cancelled." else "Download failed (code $reason). Try again on Wi-Fi, or import the file."
                    prefs.edit().remove("downloadId").remove("downloadName").apply()
                    File(dir, "$name.part").delete()
                    onChange(); return
                }
                else -> { onChange(); delay(1500) }
            }
        }
    }

    /** Copies a .litertlm file the user picked (e.g. from Downloads) into the app's storage. */
    fun importFrom(uri: Uri) {
        if (copying) return
        lastError = null
        scope.launch {
            try {
                val (name, size) = context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    c.moveToFirst()
                    val n = c.getString(c.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME))
                    val s = c.getLong(c.getColumnIndexOrThrow(OpenableColumns.SIZE))
                    n to s
                } ?: ("model.litertlm" to 0L)
                if (!name.endsWith(".litertlm")) throw IllegalArgumentException("That isn't a .litertlm model file.")
                copying = true; copyBytes = 0; copyTotal = size; onChange()
                val tmp = File(dir, "$name.part")
                context.contentResolver.openInputStream(uri)!!.use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(1 shl 20)
                        var lastTick = 0L
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); copyBytes += n
                            if (copyBytes - lastTick > 50_000_000) { lastTick = copyBytes; onChange() }
                        }
                    }
                }
                dir.listFiles()?.filter { it.name.endsWith(".litertlm") }?.forEach { it.delete() }
                tmp.renameTo(File(dir, name))
            } catch (t: Throwable) {
                Log.w(tag, "Import failed", t)
                lastError = "Import failed: ${t.message}"
                dir.listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.delete() }
            } finally {
                copying = false; onChange()
            }
        }
    }

    fun delete() {
        prefs.getLong("downloadId", -1L).takeIf { it >= 0 }?.let { dm.remove(it) }
        prefs.edit().remove("downloadId").remove("downloadName").apply()
        dir.listFiles()?.forEach { it.delete() }
        lastError = null
    }

    fun close() = scope.cancel()
}
