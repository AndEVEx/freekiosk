package com.freekiosk

import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * MediaCacheModule - keeps the media of the Media Player on the device.
 *
 * The player reads a video or an image from its URL, so a network drop stops the playlist.
 * With the cache, each http(s) item is downloaded once to the app's private storage and the
 * player is handed the local file instead.
 *
 * - A file is written as `<name>.part` and renamed only once complete, so a download that is
 *   cut (network, app killed) never leaves a half file that would be played.
 * - It is checked again with a conditional request (ETag / Last-Modified), so a file replaced
 *   on the server is downloaded again and an unchanged one is not.
 * - A failed check (offline, server down) keeps the file that is already there.
 * - Files that are no longer in the playlist are deleted, and only those.
 */
class MediaCacheModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "MediaCacheModule"
        private const val TAG = "MediaCacheModule"
        private const val DIR = "media_cache"
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 30_000
        // Free space that must remain after a download, so the cache never fills the device
        private const val MIN_FREE_BYTES = 100L * 1024 * 1024

        /** File name for a URL: a hash (so any URL is a safe name) and the URL's extension. */
        fun cacheName(url: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(url.toByteArray(Charsets.UTF_8))
            val hash = digest.joinToString("") { "%02x".format(it) }.take(32)
            val path = try { Uri.parse(url).path ?: "" } catch (e: Exception) { "" }
            val ext = path.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.take(8)
            // ".meta" and ".part" are the names of the files kept next to a download
            if (ext == "meta" || ext == "part") return hash
            return if (ext.isNotEmpty()) "$hash.$ext" else hash
        }

        fun isCacheable(url: String): Boolean =
            url.startsWith("http://", ignoreCase = true) || url.startsWith("https://", ignoreCase = true)
    }

    // One download at a time: sequential keeps the bandwidth for the playlist that is playing
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = NAME

    private fun cacheDir(): File = File(reactApplicationContext.filesDir, DIR).apply { mkdirs() }

    private fun metaFile(dir: File, name: String) = File(dir, "$name.meta")

    /** Local file URIs of the items that are already on the device. No network. */
    @ReactMethod
    fun getCached(urls: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                val dir = cacheDir()
                val result = Arguments.createMap()
                for (i in 0 until urls.size()) {
                    val url = urls.getString(i) ?: continue
                    if (!isCacheable(url)) continue
                    val file = File(dir, cacheName(url))
                    if (file.isFile && file.length() > 0) {
                        result.putString(url, Uri.fromFile(file).toString())
                    } else {
                        result.putNull(url)
                    }
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Brings the cache in line with [urls]: downloads what is missing or changed, then deletes
     * what is no longer wanted. Resolves with the local file URI of each item (null when it is
     * not on the device, for instance offline on the first run).
     */
    @ReactMethod
    fun sync(urls: ReadableArray, promise: Promise) {
        executor.execute {
            try {
                val dir = cacheDir()
                val wanted = ArrayList<String>()
                for (i in 0 until urls.size()) {
                    val url = urls.getString(i) ?: continue
                    if (isCacheable(url) && url !in wanted) wanted.add(url)
                }

                val result = Arguments.createMap()
                for (url in wanted) {
                    val file = File(dir, cacheName(url))
                    try {
                        refresh(dir, url, file)
                    } catch (e: Exception) {
                        // Offline or server error: what is already there stays
                        Log.w(TAG, "Could not refresh ${cacheName(url)}: ${e.message}")
                    }
                    if (file.isFile && file.length() > 0) {
                        result.putString(url, Uri.fromFile(file).toString())
                    } else {
                        result.putNull(url)
                    }
                }

                prune(dir, wanted.map { cacheName(it) }.toSet())
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    /** Number of cached files and their total size, for the settings. */
    @ReactMethod
    fun getStats(promise: Promise) {
        executor.execute {
            try {
                val files = cacheDir().listFiles { f -> f.isFile && !f.name.endsWith(".meta") && !f.name.endsWith(".part") }
                    ?: emptyArray()
                val map = Arguments.createMap()
                map.putInt("files", files.size)
                map.putDouble("bytes", files.sumOf { it.length() }.toDouble())
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    /** Empties the cache. */
    @ReactMethod
    fun clear(promise: Promise) {
        executor.execute {
            try {
                cacheDir().listFiles()?.forEach { it.delete() }
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }
    }

    /** Downloads [url] to [file] unless the copy that is there is still current. */
    private fun refresh(dir: File, url: String, file: File) {
        val name = file.name
        val meta = metaFile(dir, name)
        val known: JSONObject? = if (file.isFile && meta.isFile) {
            try { JSONObject(meta.readText()) } catch (e: Exception) { null }
        } else null

        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = true
            // Ask the server whether the file changed: nothing is downloaded when it did not
            if (known != null) {
                known.optString("etag").takeIf { it.isNotEmpty() }?.let { connection.setRequestProperty("If-None-Match", it) }
                known.optString("lastModified").takeIf { it.isNotEmpty() }?.let { connection.setRequestProperty("If-Modified-Since", it) }
            }

            val code = connection.responseCode
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) return
            if (code != HttpURLConnection.HTTP_OK) throw IllegalStateException("HTTP $code")

            val length = connection.contentLengthLong
            if (length > 0 && dir.usableSpace - length < MIN_FREE_BYTES) {
                throw IllegalStateException("not enough free space for $length bytes")
            }

            val part = File(dir, "$name.part")
            var written = 0L
            connection.inputStream.use { input ->
                FileOutputStream(part).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        written += n
                    }
                    output.fd.sync()
                }
            }
            if (written == 0L || (length > 0 && written != length)) {
                part.delete()
                throw IllegalStateException("incomplete download ($written of $length bytes)")
            }

            if (!part.renameTo(file)) {
                part.delete()
                throw IllegalStateException("could not move the download in place")
            }
            val info = JSONObject()
                .put("url", url)
                .put("etag", connection.getHeaderField("ETag") ?: "")
                .put("lastModified", connection.getHeaderField("Last-Modified") ?: "")
                .put("size", written)
            meta.writeText(info.toString())
            Log.i(TAG, "Cached $name ($written bytes)")
        } finally {
            connection.disconnect()
        }
    }

    /** Deletes every file of the cache whose name is not in [keep] (and any leftover .part). */
    private fun prune(dir: File, keep: Set<String>) {
        dir.listFiles()?.forEach { f ->
            val base = f.name.removeSuffix(".meta")
            val stale = f.name.endsWith(".part") || base !in keep
            if (stale && f.delete()) Log.i(TAG, "Removed ${f.name}")
        }
    }
}
