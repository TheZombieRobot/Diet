package nz.waveformlabs.moshpoint

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.chat.ChatSync

class ChatCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        ChatSync.runInBackground(context) { pending.finish() }
    }
}
