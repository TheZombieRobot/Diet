package nz.waveformlabs.moshpoint

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.AvatarBox
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Shares your photo with your friends and fetches theirs (see core [AvatarBox]): sealed
 * with your secret, filed under a weekly id on the relay server. Needs the server, so
 * it's a no-op in builds without one.
 */
object AvatarSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Own server keeps photos for a week. The public relay only keeps files a few hours, so
    // there we re-share every 2 h (while the app or Go live is running) and check often.
    private val publishEveryMs get() = if (RelayClient.ownServer) 12L * 3600_000 else 2L * 3600_000
    private val fetchEveryMs get() = if (RelayClient.ownServer) 6L * 3600_000 else 30L * 60_000

    private fun prefs(c: Context) = c.getSharedPreferences("avatars", Context.MODE_PRIVATE)

    /** Share your photo with friends and crew (sealed with your key, so only they can see it). */
    fun publishMine(context: Context, force: Boolean = false) {
        val c = context.applicationContext
        if (!RelayClient.avatarsEnabled && !RelayClient.filesEnabled) return
        val p = prefs(c)
        val now = System.currentTimeMillis()
        if (!force && now - p.getLong("published", 0) < publishEveryMs) return
        // No photo = share an empty one, so friends clear the copy they had.
        val jpeg = PhotoStore.jpeg(PhotoStore.ME) ?: ByteArray(0)
        if (jpeg.size > AvatarBox.MAX_PHOTO_BYTES) return
        if (jpeg.isEmpty() && !p.contains("published")) return // never shared one: nothing to clear
        val secret = VisibilityPrefs.mySecret(c)
        p.edit().putLong("published", now).apply()
        scope.launch {
            val week = AvatarBox.weekAt(now)
            val ok = if (RelayClient.ownServer) {
                listOf(week, week + 1).all { RelayClient.putAvatar(AvatarBox.idFor(secret, it), AvatarBox.seal(secret, jpeg)) }
            } else {
                RelayClient.putFile(AvatarBox.idFor(secret, week), AvatarBox.seal(secret, jpeg))
            }
            if (!ok) p.edit().remove("published").apply()
            DebugStatus.log(if (ok) "Shared your photo with friends" else "Couldn't share your photo (no data?)")
        }
    }

    /** Fetch friends' and crew's shared photos (skipping any you've picked yourself). */
    fun fetchFriends(context: Context, force: Boolean = false) {
        val c = context.applicationContext
        if (!RelayClient.avatarsEnabled && !RelayClient.filesEnabled) return
        val p = prefs(c)
        val now = System.currentTimeMillis()
        if (!force && now - p.getLong("fetched", 0) < fetchEveryMs) return
        p.edit().putLong("fetched", now).apply()
        val week = AvatarBox.weekAt(now)
        scope.launch {
            var got = 0
            val people = FriendsRepository.friends.toList().filter { !FriendsRepository.isSimulated(it.id) && !PhotoStore.isManual(it.id) }
            fun use(f: Friend, sealed: ByteArray?) {
                val jpeg = sealed?.let { AvatarBox.open(f.secret, it) } ?: return
                if (jpeg.isEmpty()) {
                    PhotoStore.remove(f.id) // they removed their photo
                } else if (PhotoStore.setShared(f.id, jpeg)) {
                    got++
                }
            }
            if (RelayClient.ownServer) {
                for (f in people) {
                    use(f, RelayClient.getAvatar(AvatarBox.idFor(f.secret, week)) ?: RelayClient.getAvatar(AvatarBox.idFor(f.secret, week - 1)))
                }
            } else {
                // One request for everyone, then download only photos that changed.
                for (chunk in people.chunked(30)) {
                    val urls = RelayClient.latestFiles(chunk.map { AvatarBox.idFor(it.secret, week) }) ?: break
                    chunk.forEachIndexed { i, f ->
                        val url = urls[i] ?: return@forEachIndexed
                        if (p.getString("url-${f.id}", null) == url) return@forEachIndexed
                        val sealed = RelayClient.download(url) ?: return@forEachIndexed
                        use(f, sealed)
                        p.edit().putString("url-${f.id}", url).apply()
                    }
                }
            }
            if (got > 0) DebugStatus.log("Got $got friend photo(s)")
        }
    }
}
