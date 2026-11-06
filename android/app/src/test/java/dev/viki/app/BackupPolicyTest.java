package dev.viki.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
public class BackupPolicyTest {
    @Test public void weeklyChecksNeedConsentAndAFolder(){
        assertFalse(BackupPolicy.due(false,true,0,BackupPolicy.WEEK));assertFalse(BackupPolicy.due(true,false,0,BackupPolicy.WEEK));
        assertFalse(BackupPolicy.due(true,true,100,BackupPolicy.WEEK));assertTrue(BackupPolicy.due(true,true,100,BackupPolicy.WEEK+100));
    }
    @Test public void unchangedDataDoesNotCreateAutomaticFiles(){assertFalse(BackupPolicy.shouldWrite(false,"same","same"));assertTrue(BackupPolicy.shouldWrite(false,"old","new"));assertTrue(BackupPolicy.shouldWrite(true,"same","same"));}
    @Test public void retentionNeverDeletesManualOrForeignFiles(){
        String old="viki-weekly-2026-01-01_09-00-00-abcdef01.json",newer="viki-weekly-2026-02-01_09-00-00-abcdef02.json";
        assertEquals(Arrays.asList(old),BackupPolicy.expiredNames(Arrays.asList(newer,old,"viki-backup-2025-01-01_09-00-00-abcdef03.json","viki-weekly-important.json","notes.txt"),1));
    }
    @Test public void integrityHashMatchesKnownSha256()throws Exception{assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",BackupPolicy.sha256("abc".getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
}
