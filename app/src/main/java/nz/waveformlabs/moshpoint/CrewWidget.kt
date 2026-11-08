package nz.waveformlabs.moshpoint

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Home-screen widget: "Bevan 40 m · Jo 1.2 km" and a Find crew button. Updated quietly
 * whenever the crew's whereabouts change (see CrewStatus), so a glance is enough.
 */
class CrewWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = render(context)

    companion object {
        private const val PREFS = "crew_widget"

        /** Remember the lines (the widget can be redrawn when the app isn't running) and redraw. */
        fun update(c: Context, lines: List<String>) {
            val text = lines.joinToString("\n")
            val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (p.getString("lines", null) == text) return
            p.edit().putString("lines", text).apply()
            render(c)
        }

        fun render(c: Context) {
            val manager = AppWidgetManager.getInstance(c) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(c, CrewWidget::class.java))
            if (ids.isEmpty()) return
            val text = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lines", null)
            val views = RemoteViews(c.packageName, R.layout.widget_crew)
            views.setTextViewText(R.id.widget_lines, text?.ifBlank { null } ?: c.getString(R.string.widget_empty))
            val group = GroupSync.group.value?.name
            if (group != null) views.setTextViewText(R.id.widget_title, group)
            val find = PendingIntent.getActivity(
                c, 3,
                Intent(c, MainActivity::class.java).putExtra(MainActivity.EXTRA_FIND_CREW, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val open = PendingIntent.getActivity(c, 4, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_find, find)
            views.setOnClickPendingIntent(R.id.widget_root, open)
            manager.updateAppWidget(ids, views)
        }
    }
}
