package dev.viki.app;
import static org.junit.Assert.*;
import java.time.Instant;
import org.junit.Test;
public class RecurrenceTest {
    private long time(String value){return Instant.parse(value).toEpochMilli();}
    @Test public void missedDailyOccurrencesCollapseToLatest(){
        long anchor=time("2026-01-01T16:00:00Z"),now=time("2026-01-10T17:00:00Z");
        assertEquals(time("2026-01-10T16:00:00Z"),Recurrence.occurrence(anchor,"daily",now));
        assertEquals(time("2026-01-11T16:00:00Z"),Recurrence.next(anchor,"daily",now));
    }
    @Test public void monthEndKeepsOriginalDayRatherThanDrifting(){
        long anchor=time("2026-01-31T16:00:00Z");
        assertEquals(time("2026-02-28T16:00:00Z"),Recurrence.next(anchor,"monthly",time("2026-02-01T00:00:00Z")));
        assertEquals(time("2026-03-31T16:00:00Z"),Recurrence.next(anchor,"monthly",time("2026-02-28T16:00:00Z")));
    }
    @Test public void localDailyTimeSurvivesSpringDst(){
        java.util.TimeZone original=java.util.TimeZone.getDefault();
        try{
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("America/New_York"));
            assertEquals(time("2026-03-08T13:00:00Z"),Recurrence.nextLocal("09:00",time("2026-03-07T15:00:00Z")));
            assertEquals(time("2026-03-08T13:00:00Z"),Recurrence.localOccurrence("09:00",time("2026-03-08T14:00:00Z")));
        }finally{java.util.TimeZone.setDefault(original);}
    }
    @Test public void nonRepeatingHasNoNext(){assertEquals(-1,Recurrence.next(100,"none",200));}
    @Test public void futureAnchorRemainsUnchanged(){assertEquals(200,Recurrence.occurrence(200,"daily",100));}
}
