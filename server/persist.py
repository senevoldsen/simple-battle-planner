import sqlite3

_SQ3_KEYVALUE_TABLE = '''
CREATE TABLE IF NOT EXISTS entries (
    key TEXT PRIMARY KEY,
    value BLOB
);'''


class SqliteKeyStore(object):
    """Stores blob for String keys"""
    def __init__(self, filename):
        super(SqliteKeyStore, self).__init__()
        self.filename = filename
        self.conn = None

    def open(self):
        self.conn = sqlite3.connect(self.filename)
        self._ensure_tables()

    def _ensure_tables(self):
        with self.conn as c:
            c.execute(_SQ3_KEYVALUE_TABLE)

    def _check_key(self, key):
        if not isinstance(key, str):
            raise ValueError('key must be a string')

    def close(self):
        if self.conn:
            self.conn.close()

    def store(self, key, data):
        self._check_key(key)
        with self.conn as c:
            # Since we set all columns we can use OR REPLACE
            c.execute('INSERT OR REPLACE INTO entries VALUES (?, ?)', (key, data))

    def load(self, key, fallback=None):
        self._check_key(key)
        # Cursor since we need fetchone
        c = self.conn.cursor()
        c.execute('SELECT value FROM entries WHERE key = ?;', [key])
        row = c.fetchone()
        c.close()
        if row is not None:
            return row[0]
        else:
            return fallback
