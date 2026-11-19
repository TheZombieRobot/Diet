package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject

/**
 * The relay's side of Text my spot's links (docs/REMOVE_SAFETY.md, stage 5; docs/RELAY_API.md
 * section 13): `https://<relay>/spot#<lat>,<lon>[,<name>]`.
 *
 * The spot is after `#`, which browsers never send: the relay only ever sees `GET /spot` and
 * can't know where anyone is. Two routes need nothing from it:
 *  - `GET /.well-known/assetlinks.json` ([AppLinks]): lets Android open these links straight in
 *    the app (an App Link), for builds signed with the listed certificates;
 *  - `GET /spot` and `GET /spot.js` ([SpotPage]): for a phone without the app, a tiny page whose
 *    script reads the spot in the browser and opens it in Google Maps, with a "Get Moshpoint"
 *    line. Nothing on it loads from anywhere else, and it sends nothing back.
 */
class AppLinks(val appId: String, val certs: List<String>) {
    /** The Digital Asset Links statement: this site's links may open in [appId] signed with [certs]. */
    fun assetLinks(): String = JSONArray().put(
        JSONObject()
            .put("relation", JSONArray().put("delegate_permission/common.handle_all_urls"))
            .put(
                "target",
                JSONObject().put("namespace", "android_app").put("package_name", appId).put("sha256_cert_fingerprints", JSONArray(certs)),
            ),
    ).toString()

    companion object {
        const val APP_ID = "nz.waveformlabs.moshpoint"

        /**
         * The certificate of the public debug key in the repo (`app/debug.keystore`), which
         * signs every test build. Not a secret: it's a fingerprint of a public certificate.
         */
        const val DEBUG_CERT = "89:B4:37:7F:73:AB:77:7E:46:EF:31:37:6F:55:ED:E5:3E:CB:EA:D9:9A:33:18:64:C7:35:A7:17:40:26:1A:8D"

        private val CERT = Regex("([0-9A-F]{2}:){31}[0-9A-F]{2}")
        private val PACKAGE = Regex("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")

        /**
         * `MOSHPOINT_APP_CERTS`: the SHA-256 fingerprints (comma-separated, `AB:CD:...`) of every
         * certificate whose builds should open the links: Play's app signing key for store builds
         * (Play Console, App integrity), plus [DEBUG_CERT] for test builds if wanted. Not secret.
         * Unset: [DEBUG_CERT] only. `MOSHPOINT_APP_ID`: the app id, if it ever differs from [APP_ID].
         */
        fun fromEnv(env: (String) -> String? = System::getenv): AppLinks {
            val id = env("MOSHPOINT_APP_ID")?.trim()?.takeIf { PACKAGE.matches(it) } ?: APP_ID
            val certs = env("MOSHPOINT_APP_CERTS")?.split(',')?.map { it.trim().uppercase() }?.filter { CERT.matches(it) }?.distinct().orEmpty()
            return AppLinks(id, certs.ifEmpty { listOf(DEBUG_CERT) })
        }
    }
}

object SpotPage {
    /**
     * Only this page's own script runs, nothing loads from anywhere else, and following the
     * link to the map sends no referrer.
     */
    const val SECURITY = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

    /** The page (English: it's for people who don't have the app yet). [appId] is checked by [AppLinks]. */
    fun html(appId: String): String = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>A spot on the map</title>
<style>body{font:17px/1.5 system-ui,sans-serif;margin:2rem 1.25rem;background:#07050f;color:#f3eefc}a{color:#22e4ff}h1{font-size:1.5rem}</style>
</head>
<body>
<h1 id="title">A spot on the map</h1>
<p id="note">Opening the map&hellip;</p>
<p><a id="map" href="https://maps.google.com/">Open it in Google Maps</a></p>
<p>Find your mates at gigs, even with no signal: <a href="https://play.google.com/store/apps/details?id=$appId">Get Moshpoint</a></p>
<script src="/spot.js"></script>
</body>
</html>
"""

    /**
     * Reads the spot after `#` in the browser (never sent anywhere but Google Maps), with the
     * same checks as the app (core SpotLink): plain decimals in range, not 0,0, and a short name
     * of letters only, set as text, never as markup.
     */
    const val SCRIPT = """(function () {
  var parts = location.hash.slice(1).split(',');
  var plain = /^-?\d{1,3}(\.\d{1,8})?$/;
  var note = document.getElementById('note');
  var map = document.getElementById('map');
  function none() { note.textContent = "This link doesn't hold a spot."; map.style.display = 'none'; }
  if (parts.length < 2 || parts.length > 3 || !plain.test(parts[0]) || !plain.test(parts[1])) return none();
  var lat = Number(parts[0]), lon = Number(parts[1]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) return none();
  var name = '';
  try { name = decodeURIComponent(parts[2] || '').replace(/[^\p{L}\p{N}\p{M} '-]/gu, '').replace(/ +/g, ' ').trim().slice(0, 24).trim(); } catch (e) { name = ''; }
  if (name) document.getElementById('title').textContent = name + "'s spot";
  var url = 'https://maps.google.com/?q=' + lat.toFixed(5) + ',' + lon.toFixed(5);
  map.href = url;
  location.replace(url);
})();
"""
}
