package com.freekiosk

import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
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
 * - A cut download is resumed where it stopped (Range, guarded by If-Range so a file that
 *   changed meanwhile starts again instead of being stitched together from two versions).
 * - A complete file is checked again with a conditional request (ETag / Last-Modified), so a
 *   file replaced on the server is downloaded again and an unchanged one is not.
 * - A failed check (offline, server down) keeps what is already there.
 * - Files that are no longer in the playlist are deleted, and only those.
 * - The cache never grows past a limit, and never takes the last of the free space.
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
        // Used when the caller gives no limit
        private const val DEFAULT_LIMIT_BYTES = 2L * 1024 * 1024 * 1024
        // A half download that nobody finished in this long is not worth keeping
        private const val STALE_PART_MS = 7L * 24 * 60 * 60 * 1000

        /**
         * The URL without its signature. A signed address (S3, "X-Amz-..." parameters) is a new string
         * at every manifest, but names the same file: the cache must keep its copy, not download again.
         * Any other parameter stays, since it may well tell two files apart.
         */
        fun withoutSignature(url: String): String {
            val queryStart = url.indexOf('?')
            if (queryStart < 0) return url
            val fragmentStart = url.indexOf('#', queryStart).let { if (it < 0) url.length else it }
            val kept = url.substring(queryStart + 1, fragmentStart).split('&')
                .filter { it.isNotEmpty() && !it.startsWith("X-Amz-", ignoreCase = true) }
            val query = if (kept.isEmpty()) "" else "?" + kept.joinToString("&")
            return url.substring(0, queryStart) + query + url.substring(fragmentStart)
        }

        /** File name for a URL: a hash (so any URL is a safe name) and the URL's extension. */
        fun cacheName(url: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(withoutSignature(url).toByteArray(Charsets.UTF_8))
            val hash = digest.joinToString("") { "%02x".format(it) }.take(32)
            val path = try { Uri.parse(url).path ?: "" } catch (e: Exception) { "" }
            val ext = path.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.take(8)
            // ".meta" and ".part" are the names of the files kept next to a download
            if (ext == "meta" || ext == "part") return hash
            return if (ext.isNotEmpty()) "$hash.$ext" else hash
        }

        fun isCacheable(url: String): Boolean =
            url.startsWith("http://", ignoreCase = true) || url.startsWith("https://", ignoreCase = true)

        /** The cache entry a file belongs to: its name without the .part / .meta suffixes. */
        fun entryName(fileName: String): String =
            fileName.removeSuffix(".meta").removeSuffix(".part")
    }

    // One download at a time: sequential keeps the bandwidth for the playlist that is playing
    private val executor = Executors.newSingleThreadExecutor()
    // Reading what is on the device must not wait behind a download, however long: a new playlist
    // would otherwise show a blank screen until the file being downloaded is done
    private val reader = Executors.newSingleThreadExecutor()

    override fun getName(): String = NAME

    private fun cacheDir(): File = File(reactApplicationContext.filesDir, DIR).apply { mkdirs() }

    private fun metaFile(dir: File, name: String) = File(dir, "$name.meta")
    private fun partFile(dir: File, name: String) = File(dir, "$name.part")
    private fun partMetaFile(dir: File, name: String) = File(dir, "$name.part.meta")

    private fun readMeta(file: File): JSONObject? =
        if (file.isFile) try { JSONObject(file.readText()) } catch (e: Exception) { null } else null

    /** Local file URIs of the items that are already on the device. No network. */
    @ReactMethod
    fun getCached(urls: ReadableArray, promise: Promise) {
        reader.execute {
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
     * what is no longer wanted. [limitBytes] caps the size of the whole cache (0 or negative:
     * the default). Resolves with the local file URI of each item (null when it is not on the
     * device, for instance offline on the first run, or because the limit was reached).
     */
    @ReactMethod
    fun sync(urls: ReadableArray, limitBytes: Double, promise: Promise) {
        executor.execute {
            try {
                val dir = cacheDir()
                val limit = if (limitBytes > 0) limitBytes.toLong() else DEFAULT_LIMIT_BYTES
                val wanted = ArrayList<String>()
                for (i in 0 until urls.size()) {
                    val url = urls.getString(i) ?: continue
                    if (isCacheable(url) && url !in wanted) wanted.add(url)
                }
                val keep = wanted.map { cacheName(it) }.toSet()
                // What is no longer wanted goes first: it must not count against the limit
                prune(dir, keep)

                val result = Arguments.createMap()
                for (url in wanted) {
                    val file = File(dir, cacheName(url))
                    try {
                        refresh(dir, url, file, limit)
                    } catch (e: Exception) {
                        // Offline, server error, limit: what is already there stays
                        Log.w(TAG, "Could not refresh ${cacheName(url)}: ${e.message}")
                    }
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

    /** Number of cached files, their total size, what is half downloaded, for the settings. */
    @ReactMethod
    fun getStats(promise: Promise) {
        reader.execute {
            try {
                val all = cacheDir().listFiles()?.filter { it.isFile } ?: emptyList()
                val files = all.filter { !it.name.endsWith(".meta") && !it.name.endsWith(".part") }
                val parts = all.filter { it.name.endsWith(".part") }
                val map = Arguments.createMap()
                map.putInt("files", files.size)
                map.putDouble("bytes", files.sumOf { it.length() }.toDouble())
                map.putDouble("partialBytes", parts.sumOf { it.length() }.toDouble())
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

    /** Size of the cache without [except] (a file about to be replaced does not count twice). */
    private fun sizeWithout(dir: File, except: String): Long =
        dir.listFiles()?.filter { it.isFile && entryName(it.name) != except && !it.name.endsWith(".meta") }
            ?.sumOf { it.length() } ?: 0L

    /** Downloads [url] to [file] unless the copy that is there is still current. */
    private fun refresh(dir: File, url: String, file: File, limit: Long, retried: Boolean = false) {
        val name = file.name
        val meta = metaFile(dir, name)
        val part = partFile(dir, name)
        val partMeta = partMetaFile(dir, name)

        val known = if (file.isFile) readMeta(meta) else null
        // A half download can be continued only when there is no finished copy to compare with
        // (a finished copy that changed is downloaded again from the start) and the half file
        // remembers which version of the file it comes from.
        val partInfo = if (known == null && part.isFile && part.length() > 0) readMeta(partMeta) else null
        val validator = partInfo?.let {
            it.optString("etag").takeIf { v -> v.isNotEmpty() } ?: it.optString("lastModified").takeIf { v -> v.isNotEmpty() }
        }
        val resumeFrom = if (partInfo != null && validator != null) part.length() else 0L
        if (resumeFrom == 0L) {
            // Nothing usable to continue: start clean
            part.delete()
            partMeta.delete()
        }

        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = true
            if (known != null) {
                // Ask the server whether the file changed: nothing is downloaded when it did not
                known.optString("etag").takeIf { it.isNotEmpty() }?.let { connection.setRequestProperty("If-None-Match", it) }
                known.optString("lastModified").takeIf { it.isNotEmpty() }?.let { connection.setRequestProperty("If-Modified-Since", it) }
            } else if (resumeFrom > 0) {
                connection.setRequestProperty("Range", "bytes=$resumeFrom-")
                connection.setRequestProperty("If-Range", validator!!)
            }

            val code = connection.responseCode
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) return
            if (code == 416 && resumeFrom > 0 && !retried) {
                // The server does not agree with the half file (changed, or already complete): start again
                part.delete(); partMeta.delete()
                Log.i(TAG, "Range refused for $name, starting again")
                connection.disconnect()
                return refresh(dir, url, file, limit, retried = true)
            }

            val resumed = code == HttpURLConnection.HTTP_PARTIAL
            if (code != HttpURLConnection.HTTP_OK && !resumed) throw IllegalStateException("HTTP $code")

            val length = connection.contentLengthLong
            var offset = 0L
            if (resumed) {
                // "bytes start-end/total": it must continue exactly where the half file stops
                val range = connection.getHeaderField("Content-Range") ?: ""
                val start = Regex("bytes (\\d+)-").find(range)?.groupValues?.get(1)?.toLongOrNull()
                if (start != resumeFrom) {
                    part.delete(); partMeta.delete()
                    throw IllegalStateException("unexpected Content-Range '$range'")
                }
                offset = resumeFrom
            } else {
                // A full response: whatever was half there is replaced
                part.delete()
            }
            val expectedTotal = if (length > 0) offset + length else -1L

            // The limit and the free space, counted for what is still to download
            val remaining = if (length > 0) length else 0L
            if (expectedTotal > 0 && sizeWithout(dir, name) + expectedTotal > limit) {
                throw IllegalStateException("cache limit reached ($expectedTotal bytes would pass $limit)")
            }
            if (remaining > 0 && dir.usableSpace - remaining < MIN_FREE_BYTES) {
                throw IllegalStateException("not enough free space for $remaining bytes")
            }

            // What the half file is a half of, so that a later run can ask for the rest
            val etag = connection.getHeaderField("ETag") ?: ""
            val lastModified = connection.getHeaderField("Last-Modified") ?: ""
            if (!resumed) {
                partMeta.writeText(
                    JSONObject().put("url", withoutSignature(url)).put("etag", etag).put("lastModified", lastModified).toString()
                )
            }

            var written = 0L
            connection.inputStream.use { input ->
                // Append when resuming; a fresh file starts empty
                RandomAccessFile(part, "rw").use { raf ->
                    raf.seek(offset)
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        raf.write(buffer, 0, n)
                        written += n
                        if (expectedTotal < 0 && sizeWithout(dir, name) + offset + written > limit) {
                            part.delete(); partMeta.delete()
                            throw IllegalStateException("cache limit reached while downloading")
                        }
                        // Without a length (chunked or compressed answer) the space cannot be checked
                        // beforehand: keep watching it, so a stream never fills the device
                        if (expectedTotal < 0 && dir.usableSpace < MIN_FREE_BYTES) {
                            part.delete(); partMeta.delete()
                            throw IllegalStateException("not enough free space while downloading")
                        }
                    }
                    raf.fd.sync()
                }
            }

            val total = offset + written
            if (written == 0L) {
                throw IllegalStateException("empty download")
            }
            if (expectedTotal > 0 && total != expectedTotal) {
                // Too short: keep the half file, the next run continues it. Too long: it is corrupt.
                if (total > expectedTotal) { part.delete(); partMeta.delete() }
                throw IllegalStateException("incomplete download ($total of $expectedTotal bytes)")
            }

            if (!part.renameTo(file)) {
                part.delete(); partMeta.delete()
                throw IllegalStateException("could not move the download in place")
            }
            partMeta.delete()
            val partVersion = partInfo
            val info = JSONObject()
                .put("url", withoutSignature(url))
                // A resumed response may omit the validators: the half file's own are the file's
                .put("etag", etag.ifEmpty { partVersion?.optString("etag") ?: "" })
                .put("lastModified", lastModified.ifEmpty { partVersion?.optString("lastModified") ?: "" })
                .put("size", total)
            meta.writeText(info.toString())
            Log.i(TAG, "Cached $name ($total bytes${if (resumed) ", resumed from $offset" else ""})")
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Deletes every file of the cache that belongs to no wanted entry, and the half downloads
     * nobody finished in a week. A half download of a wanted entry is kept: it is resumed.
     */
    private fun prune(dir: File, keep: Set<String>) {
        val now = System.currentTimeMillis()
        dir.listFiles()?.forEach { f ->
            val unwanted = entryName(f.name) !in keep
            val stalePart = f.name.endsWith(".part") && now - f.lastModified() > STALE_PART_MS
            if ((unwanted || stalePart) && f.delete()) {
                if (stalePart) partMetaFile(dir, entryName(f.name)).delete()
                Log.i(TAG, "Removed ${f.name}")
            }
        }
    }
}
