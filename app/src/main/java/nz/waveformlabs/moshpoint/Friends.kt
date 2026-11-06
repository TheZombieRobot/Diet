package nz.waveformlabs.moshpoint

import androidx.compose.runtime.mutableStateListOf
import nz.waveformlabs.moshpoint.core.EphemeralId

/**
 * A friend we can find. [secret] is the shared key that lets us recognise their rotating
 * broadcast code (see [EphemeralId]); it's exchanged when you add them or join a gig group.
 */
data class Friend(
    val id: String,
    val name: String,
    /** ARGB colour their arrow fades into as you get close. */
    val color: Int,
    val secret: ByteArray,
    /** True for a one-night gig group member, false for the permanent friends list. */
    val gigGroupOnly: Boolean = false,
) {
    val ephemeralId by lazy { EphemeralId(secret) }
    override fun equals(other: Any?) = other is Friend && other.id == id
    override fun hashCode() = id.hashCode()
}

/**
 * In-memory friends + gig group store.
 *
 * TODO: persist (Room / DataStore with keys in Android Keystore), add friend by
 *  username/QR, gig group create/join by code/QR, sync via the server.
 */
object FriendsRepository {
    val friends = mutableStateListOf<Friend>()

    fun byId(id: String) = friends.firstOrNull { it.id == id }
}
