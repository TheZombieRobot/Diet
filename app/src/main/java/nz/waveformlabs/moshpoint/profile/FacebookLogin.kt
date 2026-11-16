package nz.waveformlabs.moshpoint.profile

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import com.facebook.AccessToken
import com.facebook.CallbackManager
import com.facebook.FacebookCallback
import com.facebook.FacebookException
import com.facebook.FacebookSdk
import com.facebook.GraphRequest
import com.facebook.login.LoginManager
import com.facebook.login.LoginResult
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt

/**
 * "Continue with Facebook": fills in your name and profile photo (public_profile only).
 * Your photo then reaches friends through [AvatarSync], encrypted, like any other photo.
 *
 * Off unless the build has a Meta app configured (BuildConfig.FACEBOOK_ENABLED). Nothing reaches
 * Meta until someone taps "Continue with Facebook": the SDK's start-up provider is removed from
 * the manifest, and the SDK is started here, on that tap ([start]), never at app launch. Its
 * analytics, ad-ID collection and auto-init are switched off in the manifest (and again in
 * [start]). Nothing else in the app talks to Facebook. docs/FACEBOOK.md.
 */
class FacebookLogin(
    private val activity: ComponentActivity,
    private val onProfile: (name: String?, photo: android.graphics.Bitmap?) -> Unit,
    private val onFail: (String) -> Unit,
) {
    private var launcher: ActivityResultLauncher<Collection<String>>? = null
    private val callbacks = if (available) CallbackManager.Factory.create() else null

    /** The SDK's own login contract, made once the SDK is started (see [start]). */
    private var sdkContract: ActivityResultContract<Collection<String>, CallbackManager.ActivityResultParameters>? = null

    /**
     * Call from onCreate (before the activity is started): Android needs the result launcher
     * registered then. It starts nothing: the SDK is only started when the login runs ([start]),
     * or when its answer comes back to an activity Android re-created meanwhile.
     */
    fun register() {
        if (!available) return
        launcher = activity.registerForActivityResult(object : ActivityResultContract<Collection<String>, CallbackManager.ActivityResultParameters>() {
            override fun createIntent(context: Context, input: Collection<String>): Intent = start().createIntent(context, input)
            override fun parseResult(resultCode: Int, intent: Intent?) = start().parseResult(resultCode, intent)
        }) {}
    }

    /**
     * Starts the SDK the first time it's needed: only after the person chose to log in. The SDK
     * then fetches its settings from Meta; AutoInit is off in the manifest, so it also needs
     * [FacebookSdk.fullyInitialize] before any Graph request (the profile) can get an answer.
     */
    private fun start(): ActivityResultContract<Collection<String>, CallbackManager.ActivityResultParameters> {
        sdkContract?.let { return it }
        @Suppress("DEPRECATION")
        FacebookSdk.sdkInitialize(activity.applicationContext)
        FacebookSdk.setAutoLogAppEventsEnabled(false)
        FacebookSdk.setAdvertiserIDCollectionEnabled(false)
        FacebookSdk.fullyInitialize()
        val manager = LoginManager.getInstance()
        manager.registerCallback(callbacks, object : FacebookCallback<LoginResult> {
            override fun onSuccess(result: LoginResult) = fetchProfile(result.accessToken)
            override fun onCancel() = Unit
            override fun onError(error: FacebookException) = onFail(Txt.s(R.string.main_facebook_failed, error.message ?: Txt.s(R.string.main_facebook_unknown_error)))
        })
        return manager.createLogInActivityResultContract(callbacks, null).also { sdkContract = it }
    }

    fun login() {
        val l = launcher ?: return onFail(Txt.s(R.string.main_facebook_not_set_up))
        runCatching { l.launch(listOf("public_profile")) }
            .onFailure { onFail(Txt.s(R.string.main_facebook_failed, it.message ?: Txt.s(R.string.main_facebook_unknown_error))) }
    }

    private fun fetchProfile(token: AccessToken) {
        val request = GraphRequest.newMeRequest(token) { obj, _ ->
            val name = obj?.optString("name")?.takeIf { it.isNotBlank() }
            val url = obj?.optJSONObject("picture")?.optJSONObject("data")?.optString("url")
            activity.lifecycleScope.launch {
                val bmp = url?.let { downloadPhoto(it) }
                onProfile(name, bmp)
            }
        }
        request.parameters = Bundle().apply { putString("fields", "name,picture.width(512).height(512)") }
        request.executeAsync()
    }

    private suspend fun downloadPhoto(url: String) = withContext(Dispatchers.IO) {
        runCatching {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 8_000
            c.readTimeout = 8_000
            c.inputStream.use { BitmapFactory.decodeStream(it) }.also { c.disconnect() }
        }.getOrNull()
    }

    companion object {
        val available get() = BuildConfig.FACEBOOK_ENABLED
    }
}
