package dev.viki.app;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
final class BackupPolicy {
    static final long WEEK=604800000L;
    static boolean due(boolean enabled,boolean folder,long lastCheck,long now){return enabled&&folder&&now-lastCheck>=WEEK;}
    static boolean shouldWrite(boolean force,String previous,String current){return force||!current.equals(previous);}
    static String sha256(byte[] data)throws java.security.NoSuchAlgorithmException{
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder text=new StringBuilder();for(byte b:hash)text.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return text.toString();
    }
    static List<String> expiredNames(List<String> names,int keep){
        ArrayList<String> owned=new ArrayList<>();
        for(String name:names)if(name.matches("viki-weekly-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-[a-f0-9]{8}\\.json"))owned.add(name);
        owned.sort(Comparator.reverseOrder());return new ArrayList<>(owned.subList(Math.min(Math.max(1,keep),owned.size()),owned.size()));
    }
}
