package dev.viki.app;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Recurrences follow VIKI's documented Tucson time zone, which has no DST. */
final class Recurrence {
    private static final ZoneId ZONE = ZoneId.of("America/Phoenix");
    static long occurrence(long anchor, String repeat, long now) {
        if (anchor >= now || !isRepeating(repeat)) return anchor;
        if ("daily".equals(repeat) || "weekly".equals(repeat)) {
            long interval = "daily".equals(repeat) ? 86_400_000L : 604_800_000L;
            return anchor + ((now - anchor) / interval) * interval;
        }
        ZonedDateTime first = Instant.ofEpochMilli(anchor).atZone(ZONE);
        ZonedDateTime current = Instant.ofEpochMilli(now).atZone(ZONE);
        long months = (current.getYear() - first.getYear()) * 12L + current.getMonthValue() - first.getMonthValue();
        long candidate = first.plusMonths(months).toInstant().toEpochMilli();
        return candidate > now ? first.plusMonths(Math.max(0, months - 1)).toInstant().toEpochMilli() : candidate;
    }
    static long next(long anchor, String repeat, long after) {
        if (!isRepeating(repeat)) return -1;
        if ("daily".equals(repeat) || "weekly".equals(repeat)) {
            long interval = "daily".equals(repeat) ? 86_400_000L : 604_800_000L;
            return anchor + (Math.max(-1, Math.floorDiv(after - anchor, interval)) + 1) * interval;
        }
        ZonedDateTime first = Instant.ofEpochMilli(anchor).atZone(ZONE);
        ZonedDateTime current = Instant.ofEpochMilli(after).atZone(ZONE);
        long months = Math.max(0, (current.getYear() - first.getYear()) * 12L + current.getMonthValue() - first.getMonthValue());
        ZonedDateTime next = first.plusMonths(months);
        if (next.toInstant().toEpochMilli() <= after) next = first.plusMonths(months + 1);
        return next.toInstant().toEpochMilli();
    }
    static long nextLocal(String time, long after) {
        java.time.ZoneId zone=java.time.ZoneId.systemDefault();
        java.time.ZonedDateTime current=Instant.ofEpochMilli(after).atZone(zone);
        java.time.LocalTime clock=java.time.LocalTime.parse(time);
        java.time.ZonedDateTime next=current.toLocalDate().atTime(clock).atZone(zone);
        if(next.toInstant().toEpochMilli()<=after)next=current.toLocalDate().plusDays(1).atTime(clock).atZone(zone);
        return next.toInstant().toEpochMilli();
    }
    static long localOccurrence(String time, long now) {
        java.time.ZoneId zone=java.time.ZoneId.systemDefault();
        java.time.ZonedDateTime current=Instant.ofEpochMilli(now).atZone(zone);
        java.time.ZonedDateTime value=current.toLocalDate().atTime(java.time.LocalTime.parse(time)).atZone(zone);
        if(value.toInstant().toEpochMilli()>now)value=current.toLocalDate().minusDays(1).atTime(java.time.LocalTime.parse(time)).atZone(zone);
        return value.toInstant().toEpochMilli();
    }
    static boolean isRepeating(String value) { return "daily".equals(value) || "weekly".equals(value) || "monthly".equals(value); }
}
