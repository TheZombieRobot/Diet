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
 * <p>Delete this file when Paparazzi is upgraded to a version whose layoutlib knows Android 16
 * (2.0.0-alpha02 or later; docs/ANDROID_16.md).
 */
public class Build {
    public Build() {}

    private static String s() { return null; }
    private static String[] a() { return new String[0]; }
    private static long l() { return 0L; }

    public static final String UNKNOWN = "unknown";
    public static final String BOARD = s();
    public static final String BOOTLOADER = s();
    public static final String BRAND = s();
    @Deprecated public static final String CPU_ABI = s();
    @Deprecated public static final String CPU_ABI2 = s();
    public static final String DEVICE = s();
    public static final String DISPLAY = s();
    public static final String FINGERPRINT = s();
    public static final String HARDWARE = s();
    public static final String HOST = s();
    public static final String ID = s();
    public static final String MANUFACTURER = s();
    public static final String MODEL = s();
    public static final String ODM_SKU = s();
    public static final String PRODUCT = s();
    @Deprecated public static final String RADIO = s();
    @Deprecated public static final String SERIAL = s();
    public static final String SKU = s();
    public static final String SOC_MANUFACTURER = s();
    public static final String SOC_MODEL = s();
    public static final String[] SUPPORTED_32_BIT_ABIS = a();
    public static final String[] SUPPORTED_64_BIT_ABIS = a();
    public static final String[] SUPPORTED_ABIS = a();
    public static final String TAGS = s();
    public static final long TIME = l();
    public static final String TYPE = s();
    public static final String USER = s();

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

        private static int i() { return 0; }

        public static final String BASE_OS = s();
        public static final String CODENAME = s();
        public static final String INCREMENTAL = s();
        public static final int MEDIA_PERFORMANCE_CLASS = i();
        public static final int PREVIEW_SDK_INT = i();
        public static final String RELEASE = s();
        public static final String RELEASE_OR_CODENAME = s();
        public static final String RELEASE_OR_PREVIEW_DISPLAY = s();
        @Deprecated public static final String SDK = s();
        public static final int SDK_INT = i();
        public static final int SDK_INT_FULL = i();
        public static final String SECURITY_PATCH = s();
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
