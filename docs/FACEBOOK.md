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
     - Debug builds from GitHub Actions use a CI debug key that changes, so for testing
       build locally or add the hash Facebook shows in its login error.
     - Release: `keytool -exportcert -alias upload -keystore upload.jks | openssl sha1 -binary | openssl base64`
       (and, once on Play, the **app signing key** SHA-1 from Play Console → App integrity,
       converted the same way).
3. **App settings → Basic:** copy the **App ID**; **App settings → Advanced → Security:**
   copy the **Client token**. Add the privacy policy URL (host `docs/PRIVACY.md`) and a
   data deletion instructions URL (can be the same page; see "Deleting your data").
4. In GitHub → repo **Settings → Secrets and variables → Actions → Variables**, add
   `MOSHPOINT_FACEBOOK_APP_ID` and `MOSHPOINT_FACEBOOK_CLIENT_TOKEN`.
   (Locally: `-Pmoshpoint.facebookAppId=… -Pmoshpoint.facebookClientToken=…`.)
5. Switch the Meta app to **Live** mode when you're ready for people outside your test users.

Only the `public_profile` permission is used (name + photo), which doesn't need Meta's
app review. The SDK's analytics, advertising ID and auto-initialisation are switched off.

**Not possible:** Instagram (Meta closed the API that gave profile photos) and friends'
photos (Facebook doesn't give apps friends' pictures). Each person logs in for their own.
