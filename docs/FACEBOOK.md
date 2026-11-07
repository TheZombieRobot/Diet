# Setting up "Continue with Facebook"

The app can fill in each person's name and profile photo from Facebook (then share the
photo with their friends, encrypted). It's built in but **hidden until you connect a Meta
app**. About 15 minutes:

1. Go to **developers.facebook.com** → My Apps → **Create app** → use case
   "Authenticate and request data from users with Facebook Login" → app type Consumer.
2. In the app: **Facebook Login → Quickstart → Android**:
   - Package name: `nz.waveformlabs.moshpoint`
   - Default activity: `nz.waveformlabs.moshpoint.MainActivity`
   - **Key hashes:** add the hash of every key that signs the app:
     - Test builds (the public download link): **`/4J7dOPAF4EOlNsopWu1d8/hipg=`**
       (from the fixed test key `app/debug.keystore`).
     - Release: `keytool -exportcert -alias upload -keystore upload.jks | openssl sha1 -binary | openssl base64`
       (and, once on Play, the **app signing key** SHA-1 from Play Console → App integrity,
       converted the same way).
3. **App settings → Basic:** copy the **App ID**; **App settings → Advanced → Security:**
   copy the **Client token**. Also on Basic:
   - Privacy policy URL: `https://github.com/TheZombieRobot/Diet/blob/ccr-5839ed7c-1q0ztj/docs/PRIVACY.md`
   - User data deletion → instructions URL: the same link with `#deleting-your-data` on the end
   - App icon: `docs/store/icon-1024.png`; category: Social
4. Put them in `gradle.properties` (`moshpoint.fb.appId`, `moshpoint.fb.clientToken`), or as
   GitHub Actions variables `MOSHPOINT_FACEBOOK_APP_ID` / `MOSHPOINT_FACEBOOK_CLIENT_TOKEN`
   (those win when set). Both values are embedded in the app anyway, so they're fine in the
   repo. **Never** commit or share the App Secret.
5. Switch the Meta app to **Live** mode (top of the dashboard) so anyone can log in. In
   Development mode only people you add under App roles can.

Only the `public_profile` permission is used (name + photo), which doesn't need Meta's
app review. The SDK's analytics, advertising ID and auto-initialisation are switched off.

**Not possible:** Instagram (Meta closed the API that gave profile photos) and friends'
photos (Facebook doesn't give apps friends' pictures). Each person logs in for their own.
