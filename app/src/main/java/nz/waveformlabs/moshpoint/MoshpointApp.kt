package nz.waveformlabs.moshpoint

import android.app.Application
import android.content.Context
import androidx.annotation.PluralsRes
import androidx.annotation.StringRes

/** Starts first in every process (app, service, alarms), so [Txt] always has a Context. */
class MoshpointApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Txt.init(this)
    }
}

/**
 * Translated text for code that isn't drawing UI (notifications, chat notes, background work).
 * In Compose, use stringResource() instead. All user-facing words live in res/values*.
 * Follows the phone's language, and the per-app language (Android 13+ Settings → Languages).
 */
object Txt {
    private lateinit var app: Context

    fun init(c: Context) {
        app = c.applicationContext
    }

    fun s(@StringRes id: Int, vararg args: Any): String = app.resources.getString(id, *args)

    /** Plural-aware ("1 new message", "3 new messages"); [count] is also the first argument unless others are given. */
    fun p(@PluralsRes id: Int, count: Int, vararg args: Any): String =
        app.resources.getQuantityString(id, count, *(if (args.isEmpty()) arrayOf<Any>(count) else args))
}
