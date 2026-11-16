# Release builds only (app/build.gradle.kts). R8 removes every verbose, debug and info log call,
# and the strings built for them: they can carry a friend's name (UwbResponder) and other
# details nobody needs in a shipped app. Warnings and errors stay. audit/release.md, P2.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
