package nz.waveformlabs.moshpoint

import android.content.Context
import android.util.Base64
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Who this phone is, and to whom.
 *
 * - Your **permanent identity** (your secret) is only for friends you chose: added by your
 *   friend QR, or "keep as friend" (sent privately, see [CrewChat]).
 * - Each crew gets a **crew pass**: a separate identity worked out from your secret and that
 *   crew. It's what invites and intros carry, so a crew mate (or anyone who saw a screenshot
 *   of a crew QR) can only find you in that crew, and never at a later gig.
 * - While a crew is on (gig day, not following from home), finding (Bluetooth, the relay,
 *   UWB, Wi-Fi) uses that crew's pass; otherwise your permanent identity. Friends you've kept
 *   who are at the gig just join the crew, like everyone else.
 * - Each crew also gets a **signing key**, so nobody can post as you.
 */
object Identity {
    fun permanent(c: Context): ByteArray = VisibilityPrefs.mySecret(c.applicationContext)

    /** Your identity in crew [g] (32 bytes). */
    fun crewPass(c: Context, g: GigGroup): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(permanent(c), "HmacSHA256")) }
            .doFinal("moshpoint-crew-pass".toByteArray() + g.key)

    /** The identity finding uses right now. */
    fun current(c: Context): ByteArray {
        val g = GroupSync.group.value
        return if (g != null && !GroupSync.following && !g.dormant(System.currentTimeMillis())) crewPass(c, g) else permanent(c)
    }

    /** Is [secret] one of ours (permanent, or our pass in any crew we're in)? */
    fun isMine(c: Context, secret: ByteArray): Boolean =
        secret.contentEquals(permanent(c)) || ChatSync.allCrews(c).any { crewPass(c, it).contentEquals(secret) }

    private fun keys(c: Context) = c.applicationContext.getSharedPreferences("crewkeys", Context.MODE_PRIVATE)
    private val cache = HashMap<String, CrewKeys.Signer>()

    /** Our signing key for crew [g], made the first time it's needed. */
    @Synchronized
    fun signer(c: Context, g: GigGroup): CrewKeys.Signer {
        val id = GigArchive.idFor(g)
        cache[id]?.let { return it }
        val p = keys(c)
        val saved = p.getString(id, null)?.split(':')?.takeIf { it.size == 2 }?.let { (priv, pub) ->
            CrewKeys.restore(Base64.decode(priv, Base64.NO_WRAP), Base64.decode(pub, Base64.NO_WRAP))
        }
        val s = saved ?: CrewKeys.generate().also {
            p.edit().putString(id, Base64.encodeToString(it.encodedPrivate(), Base64.NO_WRAP) + ":" + Base64.encodeToString(it.pub, Base64.NO_WRAP)).apply()
        }
        cache[id] = s
        return s
    }

    /** Our signing key for the crew with id [id], if we have one (for re-sending after a key change). */
    @Synchronized
    fun signerById(c: Context, id: String): CrewKeys.Signer? {
        cache[id]?.let { return it }
        return keys(c).getString(id, null)?.split(':')?.takeIf { it.size == 2 }?.let { (priv, pub) ->
            CrewKeys.restore(Base64.decode(priv, Base64.NO_WRAP), Base64.decode(pub, Base64.NO_WRAP))
        }?.also { cache[id] = it }
    }

    /**
     * The crew moved to a new key: we keep the same signing key there (so mates still know it's
     * us). The old entry stays, under its old id, for re-sending the new key for a few days.
     */
    @Synchronized
    fun migrate(c: Context, old: GigGroup, fresh: GigGroup) {
        val oldId = GigArchive.idFor(old)
        val v = keys(c).getString(oldId, null) ?: return
        keys(c).edit().putString(GigArchive.idFor(fresh), v).apply()
        cache.remove(GigArchive.idFor(fresh))
    }

    /** Our sender tag in crew [g]. */
    fun tag(c: Context, g: GigGroup): Long = signer(c, g).tag

    /** The crew ended or we left: its key goes. */
    @Synchronized
    fun forget(c: Context, g: GigGroup) {
        val id = GigArchive.idFor(g)
        cache.remove(id)
        keys(c).edit().remove(id).apply()
    }

    /** Our intro for crew [g]: our pass there, name and signing key. */
    fun intro(c: Context, g: GigGroup, name: String) = g.signedIntro(crewPass(c, g), name, signer(c, g))
}
