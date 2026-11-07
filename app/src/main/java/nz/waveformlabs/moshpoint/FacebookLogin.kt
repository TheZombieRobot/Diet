package nz.waveformlabs.moshpoint

import android.content.Context
import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
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

/**
 * "Continue with Facebook": fills in your name and profile photo (public_profile only).
 * Your photo then reaches friends through [AvatarSync], encrypted, like any other photo.
 *
 * Off unless the build has a Meta app configured (BuildConfig.FACEBOOK_ENABLED). The SDK's
 * own analytics, ad-ID collection and auto-init are switched off in the manifest; it's only
 * initialised here, and only when configured. Nothing else in the app talks to Facebook.
 */
class FacebookLogin(
    private val activity: ComponentActivity,
    private val onProfile: (name: String?, photo: android.graphics.Bitmap?) -> Unit,
    private val onFail: (String) -> Unit,
) {
    private var launcher: ActivityResultLauncher<Collection<String>>? = null
    private val callbacks = if (available) CallbackManager.Factory.create() else null

    /** Call from onCreate (before the activity is started). */
    fun register() {
        if (!available) return
        @Suppress("DEPRECATION")
        FacebookSdk.sdkInitialize(activity.applicationContext)
        FacebookSdk.setAutoLogAppEventsEnabled(false)
        FacebookSdk.setAdvertiserIDCollectionEnabled(false)
        val manager = LoginManager.getInstance()
        manager.registerCallback(callbacks, object : FacebookCallback<LoginResult> {
            override fun onSuccess(result: LoginResult) = fetchProfile(result.accessToken)
            override fun onCancel() = Unit
            override fun onError(error: FacebookException) = onFail("Facebook login failed: ${error.message ?: "unknown"}")
        })
        launcher = activity.registerForActivityResult(manager.createLogInActivityResultContract(callbacks, null)) {}
    }

    fun login() {
        launcher?.launch(listOf("public_profile")) ?: onFail("Facebook login isn't set up in this build")
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

        /** Log out of Facebook in the app (doesn't remove your photo). */
        fun logout(context: Context) {
            if (available && FacebookSdk.isInitialized()) LoginManager.getInstance().logOut()
        }
    }
}
