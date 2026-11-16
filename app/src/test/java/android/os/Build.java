package android.os;

import java.util.Collections;
import java.util.List;

/**
 * Screenshot tests only (Paparazzi), never in the app: Android 16's {@code android.os.Build}
 * without its new {@code VERSION_CODES_FULL} class.
 *
 * <p>Why: Paparazzi 1.3.5 copies the device's build values from layoutlib's own copy of this
 * class ({@code android.os._Original_Build}, Android 14) into the one on the test classpath,
 * matching every nested class by name. Since compileSdk 36 the SDK's copy has
 * {@code VERSION_CODES_FULL}, which layoutlib's doesn't, so every screenshot test failed with
 * "Array contains no element matching the predicate" (Renderer.configureBuildProperties). Test
 * classes come first on the classpath, so this class is the one Paparazzi and the app's code see
 * in tests: the same public fields as the SDK's, filled in by Paparazzi exactly as before, so the
 * screenshots don't change.
 *
 * <p>The fields are plain statics with no initial value, on purpose. Paparazzi writes the
 * values into {@code static final} fields with {@code Unsafe} before this class is initialised,
 * so a static initialiser would then put them back to null and 0 (no field would say Android 14,
 * and Compose would draw nothing). The SDK's own stub has no initialiser either. Constants
 * ({@code UNKNOWN}, the version codes) stay constants, as in the SDK.
 *
 * <p>Delete this file when Paparazzi is upgraded to a version whose layoutlib knows Android 16
 * (2.0.0-alpha02 or later; docs/ANDROID_16.md).
 */
public class Build {
    public Build() {}

    public static final String UNKNOWN = "unknown";
    public static String BOARD;
    public static String BOOTLOADER;
    public static String BRAND;
    @Deprecated public static String CPU_ABI;
    @Deprecated public static String CPU_ABI2;
    public static String DEVICE;
    public static String DISPLAY;
    public static String FINGERPRINT;
    public static String HARDWARE;
    public static String HOST;
    public static String ID;
    public static String MANUFACTURER;
    public static String MODEL;
    public static String ODM_SKU;
    public static String PRODUCT;
    @Deprecated public static String RADIO;
    @Deprecated public static String SERIAL;
    public static String SKU;
    public static String SOC_MANUFACTURER;
    public static String SOC_MODEL;
    public static String[] SUPPORTED_32_BIT_ABIS;
    public static String[] SUPPORTED_64_BIT_ABIS;
    public static String[] SUPPORTED_ABIS;
    public static String TAGS;
    public static long TIME;
    public static String TYPE;
    public static String USER;

    public static List<Partition> getFingerprintedPartitions() { return Collections.emptyList(); }
    public static int getMajorSdkVersion(int sdkIntFull) { return sdkIntFull / 100000; }
    public static int getMinorSdkVersion(int sdkIntFull) { return sdkIntFull % 100000; }
    public static String getRadioVersion() { return null; }
    public static String getSerial() { return UNKNOWN; }

    public static class Partition {
        public static final String PARTITION_NAME_SYSTEM = "system";
        private Partition() {}
        public String getName() { return PARTITION_NAME_SYSTEM; }
        public String getFingerprint() { return UNKNOWN; }
        public long getBuildTimeMillis() { return 0L; }
    }

    public static class VERSION {
        public VERSION() {}

        public static String BASE_OS;
        public static String CODENAME;
        public static String INCREMENTAL;
        public static int MEDIA_PERFORMANCE_CLASS;
        public static int PREVIEW_SDK_INT;
        public static String RELEASE;
        public static String RELEASE_OR_CODENAME;
        public static String RELEASE_OR_PREVIEW_DISPLAY;
        @Deprecated public static String SDK;
        public static int SDK_INT;
        public static int SDK_INT_FULL;
        public static String SECURITY_PATCH;
    }

    public static class VERSION_CODES {
        public VERSION_CODES() {}

        public static final int CUR_DEVELOPMENT = 10000;
        public static final int BASE = 1;
        public static final int BASE_1_1 = 2;
        public static final int CUPCAKE = 3;
        public static final int DONUT = 4;
        public static final int ECLAIR = 5;
        public static final int ECLAIR_0_1 = 6;
        public static final int ECLAIR_MR1 = 7;
        public static final int FROYO = 8;
        public static final int GINGERBREAD = 9;
        public static final int GINGERBREAD_MR1 = 10;
        public static final int HONEYCOMB = 11;
        public static final int HONEYCOMB_MR1 = 12;
        public static final int HONEYCOMB_MR2 = 13;
        public static final int ICE_CREAM_SANDWICH = 14;
        public static final int ICE_CREAM_SANDWICH_MR1 = 15;
        public static final int JELLY_BEAN = 16;
        public static final int JELLY_BEAN_MR1 = 17;
        public static final int JELLY_BEAN_MR2 = 18;
        public static final int KITKAT = 19;
        public static final int KITKAT_WATCH = 20;
        public static final int LOLLIPOP = 21;
        public static final int LOLLIPOP_MR1 = 22;
        public static final int M = 23;
        public static final int N = 24;
        public static final int N_MR1 = 25;
        public static final int O = 26;
        public static final int O_MR1 = 27;
        public static final int P = 28;
        public static final int Q = 29;
        public static final int R = 30;
        public static final int S = 31;
        public static final int S_V2 = 32;
        public static final int TIRAMISU = 33;
        public static final int UPSIDE_DOWN_CAKE = 34;
        public static final int VANILLA_ICE_CREAM = 35;
        public static final int BAKLAVA = 36;
    }
}
