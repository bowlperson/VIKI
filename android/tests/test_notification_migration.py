"""Exercise the shipped v1->v2 migration SQL against SQLite on the build host.

Android framework execution remains a device check; these tests protect the
existing state, alarm schedules and deduplication rows during the schema change.
"""
from pathlib import Path
import re
import sqlite3
import unittest

SOURCE = (Path(__file__).resolve().parents[1] / 'app/src/main/java/dev/viki/app/VikiDatabase.java').read_text()

def statements(section):
    return re.findall(r'db\.execSQL\("([^"\\]*(?:\\.[^"\\]*)*)"\);', section)

class NotificationMigrationTest(unittest.TestCase):
    def test_upgrade_preserves_state_schedule_and_delivery_history(self):
        db = sqlite3.connect(':memory:')
        db.executescript('''
            CREATE TABLE app_state(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE events(id TEXT PRIMARY KEY, at INTEGER NOT NULL, value TEXT NOT NULL, snooze INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE history(event_id TEXT NOT NULL, occurrence INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(event_id,occurrence));
            INSERT INTO app_state VALUES(1,'{"inventory":[{"name":"eggs"}]}');
            INSERT INTO events VALUES('reminder-one',123,'{"title":"Test"}',0);
            INSERT INTO history VALUES('one',100,'posted'),('two',200,'seen'),('three',300,'snoozed');
        ''')
        old_state = db.execute('SELECT * FROM app_state').fetchall()
        old_events = db.execute('SELECT * FROM events').fetchall()
        migration = SOURCE.split('@Override public void onUpgrade',1)[1].split('synchronized String readState',1)[0]
        for sql in statements(migration):
            db.execute(sql)
        self.assertEqual(db.execute('SELECT * FROM app_state').fetchall(), old_state)
        self.assertEqual(db.execute('SELECT * FROM events').fetchall(), old_events)
        self.assertEqual(db.execute('SELECT event_id,occurrence,status,delivered_at,is_read FROM history ORDER BY occurrence').fetchall(), [
            ('one',100,'posted',100,0),('two',200,'seen',200,1),('three',300,'snoozed',300,1)])
        # Read/unread updates cannot remove the row used to suppress duplicates.
        db.execute("UPDATE history SET is_read=0 WHERE event_id='two' AND occurrence=200")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM history WHERE event_id='two' AND occurrence=200").fetchone()[0],1)
        self.assertEqual(db.execute("SELECT title,body FROM history WHERE event_id='two'").fetchone(),('', ''))

    def test_fresh_schema_supports_multiple_occurrences_and_archived_content(self):
        db = sqlite3.connect(':memory:')
        schema = SOURCE.split('@Override public void onCreate',1)[1].split('@Override public void onUpgrade',1)[0]
        for sql in statements(schema):
            db.execute(sql)
        db.executemany('INSERT INTO history(event_id,occurrence,status,title,body,delivered_at) VALUES(?,?,?,?,?,?)', [
            ('daily',100,'posted','Inventory','Milk expires soon',101),
            ('daily',200,'posted','Inventory','Eggs expire soon',201)])
        self.assertEqual(db.execute('SELECT title,body FROM history ORDER BY delivered_at DESC').fetchall(), [
            ('Inventory','Eggs expire soon'),('Inventory','Milk expires soon')])
        db.execute("UPDATE history SET status='removed',title='',body='',is_read=1 WHERE event_id='daily' AND occurrence=100")
        self.assertEqual(db.execute("SELECT COUNT(*) FROM history WHERE event_id='daily' AND occurrence=100").fetchone()[0],1)
        archive_source=SOURCE.split('synchronized JSONArray listNotificationHistory',1)[1].split('synchronized boolean clearNotificationContent',1)[0]
        archive_query=re.search(r'rawQuery\("([^"]+)"',archive_source).group(1)
        self.assertEqual([row[1] for row in db.execute(archive_query).fetchall()],[200], 'Clearing content keeps dedup keys but removes it from the archive view')

if __name__ == '__main__':
    unittest.main()
