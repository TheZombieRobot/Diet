package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.FriendRecord
import java.io.File
import java.util.UUID

/**
 * A friend we can find. [secret] is the shared key that lets us recognise their rotating
 * broadcast code (see [EphemeralId]); it's exchanged when you add them.
 */
data class Friend(val record: FriendRecord) {
    val id get() = record.id
    val name get() = record.name
    /** ARGB colour their arrow fades into as you get close. */
    val color get() = record.color
    val secret: ByteArray get() = record.secret
    /** True for a one-night gig group member, false for the permanent friends list. */
    val gigGroupOnly get() = record.gigGroupOnly
    val ephemeralId by lazy { EphemeralId(record.secret) }
    /** Their finding key as hex: how the crew list refers to them. */
    val key: String get() = record.secret.joinToString("") { "%02x".format(it) }
}

/**
 * Friends + gig group, saved to app-private storage so they survive restarts.
 * Gig group members expire after [FriendRecord.GIG_GROUP_TTL_MS] (one night).
 *
 * Shared by the UI and the background visibility service (same process).
 * TODO: wrap the file with a Keystore key; sync with the server once accounts exist.
 */
object FriendsRepository {
    val friends = mutableStateListOf<Friend>()
    private var file: File? = null

    private val PALETTE = nz.waveformlabs.moshpoint.ui.Mosh.FriendColours

    @Synchronized
    fun init(context: Context) {
        if (file != null) return
        val f = File(context.applicationContext.filesDir, "friends.tsv")
        file = f
        val loaded = if (f.exists()) FriendRecord.parse(f.readText(), System.currentTimeMillis()) else emptyList()
        friends.clear()
        friends.addAll(loaded.map(::Friend))
    }

    fun byId(id: String) = friends.firstOrNull { it.id == id }

    /** Returns an error message, or null on success. */
    fun add(name: String, code: String, gigGroup: Boolean, mySecret: ByteArray): String? {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return "Give them a name"
        val secret = FriendRecord.secretFromCode(code) ?: return "That code doesn't look right"
        if (secret.contentEquals(mySecret)) return "That's your own code"
        val existing = friends.indexOfFirst { it.secret.contentEquals(secret) }
        val usedColours = friends.map { it.color }.toSet()
        val record = FriendRecord(
            id = if (existing >= 0) friends[existing].id else UUID.randomUUID().toString(),
            name = trimmed,
            color = PALETTE.firstOrNull { it !in usedColours } ?: PALETTE[friends.size % PALETTE.size],
            secret = secret,
            gigGroupOnly = gigGroup,
            addedAtMs = System.currentTimeMillis(),
        )
        if (existing >= 0) friends[existing] = Friend(record.copy(color = friends[existing].color)) else friends += Friend(record)
        save()
        return null
    }

    /**
     * A gig-group member introduced themselves (see GroupSync). Adds them to the gig group,
     * or updates their name. Returns true if they're new. Never downgrades a permanent friend.
     */
    fun addFromIntro(secret: ByteArray, name: String): Boolean {
        if (secret.toHexKey() in removedGig) return false
        val existing = friends.indexOfFirst { it.secret.contentEquals(secret) }
        if (existing >= 0) {
            val f = friends[existing]
            if (f.gigGroupOnly && f.name != name && name.isNotBlank()) {
                friends[existing] = Friend(f.record.copy(name = name))
                save()
            }
            return false
        }
        // Never match by name: two different people can share one ("Jo", "Mate"), and a crew
        // intro must never take over a friend's entry. A new key is a new person.
        val usedColours = friends.map { it.color }.toSet()
        friends += Friend(
            FriendRecord(
                id = UUID.randomUUID().toString(),
                name = name.ifBlank { "Mate" },
                color = PALETTE.firstOrNull { it !in usedColours } ?: PALETTE[friends.size % PALETTE.size],
                secret = secret,
                gigGroupOnly = true,
                addedAtMs = System.currentTimeMillis(),
            ),
        )
        save()
        return true
    }

    /** Debug builds: a pretend friend driven by FriendSimulator (ids start with "sim-"). */
    fun addSimulated() {
        if (!DebugStatus.enabled) return
        val n = friends.count { isSimulated(it.id) } + 1
        val secret = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
        friends += Friend(
            FriendRecord(
                id = "sim-${UUID.randomUUID()}",
                name = "Sim $n",
                color = PALETTE[(friends.size) % PALETTE.size],
                secret = secret,
                gigGroupOnly = false,
                addedAtMs = System.currentTimeMillis(),
            ),
        )
        save()
    }

    fun isSimulated(id: String) = id.startsWith("sim-")

    /** Debug: clear every simulated friend in one go. */
    fun removeSimulated() {
        friends.filter { isSimulated(it.id) }.forEach { PhotoStore.remove(it.id) }
        friends.removeAll { isSimulated(it.id) }
        save()
    }

    /** A crew member you want to keep: move them to your friends list (stays after "End the night"). */
    /**
     * "Keep as friend" went through (they said yes, see Friendship): crew mate [crewId] becomes a
     * friend for every gig, under their permanent identity. Keeps their colour and photo.
     */
    fun makePermanent(crewId: String?, secret: ByteArray, name: String) {
        val already = friends.indexOfFirst { it.secret.contentEquals(secret) }
        val i = crewId?.let { id -> friends.indexOfFirst { it.id == id } } ?: -1
        when {
            already >= 0 -> friends[already] = Friend(friends[already].record.copy(gigGroupOnly = false, name = name.ifBlank { friends[already].name }))
            i >= 0 -> friends[i] = Friend(friends[i].record.copy(secret = secret, gigGroupOnly = false, name = name.ifBlank { friends[i].name }))
            else -> {
                val usedColours = friends.map { it.color }.toSet()
                friends += Friend(
                    FriendRecord(
                        id = UUID.randomUUID().toString(), name = name.ifBlank { "Mate" },
                        color = PALETTE.firstOrNull { it !in usedColours } ?: PALETTE[friends.size % PALETTE.size],
                        secret = secret, gigGroupOnly = false, addedAtMs = System.currentTimeMillis(),
                    ),
                )
            }
        }
        // The crew-pass entry for the same person isn't needed any more.
        if (already >= 0 && i >= 0 && friends.getOrNull(i)?.gigGroupOnly == true) friends.removeAt(i)
        save()
    }

    /** Gig members you removed tonight: don't let their intro add them straight back. */
    private val removedGig = mutableSetOf<String>()

    /** Scanning someone's QR again is a clear "yes, them": forget that you removed them. */
    fun unremove(secret: ByteArray) {
        removedGig -= secret.toHexKey()
    }

    fun remove(id: String) {
        friends.firstOrNull { it.id == id && it.gigGroupOnly }?.let { removedGig += it.secret.toHexKey() }
        friends.removeAll { it.id == id }
        PhotoStore.remove(id)
        save()
    }

    /** Same crew mate, new crew pass (the crew moved to a new key): keep their entry, colour and photo. */
    fun replaceSecret(old: ByteArray, new: ByteArray, name: String) {
        val i = friends.indexOfFirst { it.gigGroupOnly && it.secret.contentEquals(old) }
        if (i < 0 || friends.any { it.secret.contentEquals(new) }) return
        friends[i] = Friend(friends[i].record.copy(secret = new, name = name.ifBlank { friends[i].name }))
        save()
    }

    fun clearGigGroup() {
        removedGig.clear()
        friends.removeAll { it.gigGroupOnly }
        save()
    }

    private fun ByteArray.toHexKey() = joinToString("") { "%02x".format(it) }

    private fun save() {
        val f = file ?: return
        val tmp = File(f.parentFile, f.name + ".tmp")
        tmp.writeText(FriendRecord.serialize(friends.map { it.record }))
        tmp.renameTo(f)
    }
}
