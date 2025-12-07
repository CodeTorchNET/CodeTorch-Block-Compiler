const DB_NAME = 'ai-integration-db';
const DB_VERSION = 2;
const SESSIONS_STORE = 'sessions';
const METADATA_STORE = 'metadata';

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("Error opening DB");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const transaction = event.target.transaction;
      let sessionsStore;

      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        sessionsStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      } else {
        sessionsStore = transaction.objectStore(SESSIONS_STORE);
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
      }

      if (event.oldVersion < 2) {
        if (!sessionsStore.indexNames.contains('projectId')) {
          sessionsStore.createIndex('projectId', 'projectId', { unique: false });
        }
        // Migrate existing data from v1 to have a default projectId
        sessionsStore.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const record = cursor.value;
            if (typeof record.projectId === 'undefined') {
              record.projectId = '0'; // Assign default project ID
              cursor.update(record);
            }
            cursor.continue();
          }
        };
      }
    };
  });
}

export async function saveSession(sessionData) {
  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
  const store = transaction.objectStore(SESSIONS_STORE);
  
  store.put(sessionData);
  return transaction.complete;
}

export async function deleteSession(sessionId) {
  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
  const store = transaction.objectStore(SESSIONS_STORE);
  store.delete(sessionId);
  return transaction.complete;
}

export async function loadSessionsForProject(projectId) {
  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readonly');
  const store = transaction.objectStore(SESSIONS_STORE);
  const index = store.index('projectId');
  return new Promise((resolve, reject) => {
    const request = index.getAll(projectId);
    request.onerror = event => reject("Error loading sessions for project " + projectId);
    request.onsuccess = event => resolve(event.target.result);
  });
}

export async function saveMetadata(key, value) {
    const db = await openDB();
    const transaction = db.transaction(METADATA_STORE, 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    store.put({ key, value });
    return transaction.complete;
}

export async function loadMetadata(key) {
    const db = await openDB();
    const transaction = db.transaction(METADATA_STORE, 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onerror = event => reject(`Error loading metadata for key: ${key}`);
        request.onsuccess = event => resolve(event.target.result ? event.target.result.value : undefined);
    });
}
