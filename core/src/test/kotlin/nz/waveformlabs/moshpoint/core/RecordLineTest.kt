package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals

class RecordLineTest {
    @Test fun columnsLineUp() {
        val line = RecordLine.of(1000, "fix", friend = "Sam", method = "UWB", distanceM = 12.345, bearingDeg = 90.0, confidence = 0.95)
        assertEquals(RecordLine.HEADER.split(",").size, line.split(",").size)
        assertEquals("1000,fix,Sam,UWB,12.35,90.0,,,,,,0.950,", line)
    }

    @Test fun escapesNotes() {
        assertEquals("\"Sam, 20 m \"\"north\"\"\"", RecordLine.csv("Sam, 20 m \"north\""))
        assertEquals("plain", RecordLine.csv("plain"))
    }
}
