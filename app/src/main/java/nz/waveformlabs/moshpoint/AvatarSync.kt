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
    private const val PUBLISH_EVERY_MS = 12L * 60 * 60 * 1000
    private const val FETCH_EVERY_MS = 6L * 60 * 60 * 1000

    private fun prefs(c: Context) = c.getSharedPreferences("avatars", Context.MODE_PRIVATE)

    /** Upload your photo for this week and next (so it's there when the id rolls over). */
    fun publishMine(context: Context, force: Boolean = false) {
        val c = context.applicationContext
        if (!RelayClient.enabled) return
        val p = prefs(c)
        val now = System.currentTimeMillis()
        if (!force && now - p.getLong("published", 0) < PUBLISH_EVERY_MS) return
        // No photo = share an empty one, so friends clear the copy they had.
        val jpeg = PhotoStore.jpeg(PhotoStore.ME) ?: ByteArray(0)
        if (jpeg.size > AvatarBox.MAX_PHOTO_BYTES) return
        val secret = VisibilityPrefs.mySecret(c)
        scope.launch {
            val week = AvatarBox.weekAt(now)
            var ok = true
            for (w in listOf(week, week + 1)) {
                ok = RelayClient.putAvatar(AvatarBox.idFor(secret, w), AvatarBox.seal(secret, jpeg)) && ok
            }
            if (ok) p.edit().putLong("published", now).apply()
            DebugStatus.log(if (ok) "Shared your photo with friends" else "Couldn't share your photo (no data?)")
        }
    }

    /** Fetch friends' shared photos (skipping any you've picked yourself). */
    fun fetchFriends(context: Context, force: Boolean = false) {
        val c = context.applicationContext
        if (!RelayClient.enabled) return
        val p = prefs(c)
        val now = System.currentTimeMillis()
        if (!force && now - p.getLong("fetched", 0) < FETCH_EVERY_MS) return
        p.edit().putLong("fetched", now).apply()
        val week = AvatarBox.weekAt(now)
        scope.launch {
            var got = 0
            for (f in FriendsRepository.friends.toList()) {
                if (FriendsRepository.isSimulated(f.id) || PhotoStore.isManual(f.id)) continue
                val sealed = RelayClient.getAvatar(AvatarBox.idFor(f.secret, week))
                    ?: RelayClient.getAvatar(AvatarBox.idFor(f.secret, week - 1))
                    ?: continue
                val jpeg = AvatarBox.open(f.secret, sealed) ?: continue
                if (jpeg.isEmpty()) {
                    if (!PhotoStore.isManual(f.id)) PhotoStore.remove(f.id) // they removed their photo
                    continue
                }
                if (PhotoStore.setShared(f.id, jpeg)) got++
            }
            if (got > 0) DebugStatus.log("Got $got friend photo(s)")
        }
    }
}
