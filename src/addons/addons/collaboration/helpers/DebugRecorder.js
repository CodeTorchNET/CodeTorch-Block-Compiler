// helpers/DebugRecorder.js
import * as constants from './constants.js';
import storage from '../../../../lib/storage';

export class DebugRecorder {
    constructor() {
        this.dbName = null; // Will be set per session: projectID_time
        this.dbVersion = 1;
        this.db = null;
        this.sessionId = null;
        this.projectId = null;
        this.ready = false;
        this.enabled = true;
        this._accessToken = null;
        
        // Batching
        this.writeBuffer = [];
        this.FLUSH_INTERVAL_MS = 2000; // Write to disk every 2 seconds
        this.flushInterval = null;
        this.isFlushing = false;

        // Inter-tab Locking / Heartbeat
        this.heartbeatInterval = null;
        this.HEARTBEAT_MS = 5000; // Update "I'm alive" status every 5s
        this.LOCK_EXPIRY_MS = 15000; // Consider a DB dead if no heartbeat for 15s
    }

    /**
     * Sets the enabled state. If disabled, stops current session and wipes all local data.
     */
    setEnableState(isEnabled) {
        this.enabled = isEnabled;
        if (!this.enabled) {
            this.stop();
            this.wipeAllSessions();
            console.log("[BlackBox] Recorder disabled. All stored sessions wiped.");
        }
    }

    /**
     * Deletes all IndexedDB databases related to the Flight Recorder immediately.
     */
    async wipeAllSessions() {
        if (!window.indexedDB || !window.indexedDB.databases) return;

        try {
            const dbs = await window.indexedDB.databases();
            const recordingDbPattern = /^(.*?)_(\d{4}-\d{2}-\d{2}T.*)$/;

            for (const dbInfo of dbs) {
                const name = dbInfo.name;
                if (name && recordingDbPattern.test(name)) {
                    
                    // If this is the currently active DB handle, close it explicitly
                    // to prevent the delete request from being blocked.
                    if (this.db && this.dbName === name) {
                        this.db.close();
                        this.db = null;
                    }

                    const req = window.indexedDB.deleteDatabase(name);
                    
                    req.onsuccess = () => {
                        console.log(`[BlackBox] Successfully wiped DB: ${name}`);
                    };
                    req.onerror = (e) => {
                        console.warn(`[BlackBox] Failed to wipe DB: ${name}`, e);
                    };

                    // Clean up lock
                    localStorage.removeItem(`blackbox_active_${name}`);
                }
            }
        } catch (e) {
            console.warn("[BlackBox] Error during session wipe:", e);
        }
    }

    /**
     * Opens the IndexedDB and handles upgrades.
     */
    async open() {
        if (!this.enabled) return false;
        if (!this.dbName) {
            console.error("DebugRecorder: Cannot open DB without dbName. Call startSession first.");
            return false;
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("BlackBox: Failed to open DB", event);
                resolve(false); 
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store for metadata about the session
                if (!db.objectStoreNames.contains('sessions')) {
                    db.createObjectStore('sessions', { keyPath: 'sessionId' });
                }
                // Store for console logs
                if (!db.objectStoreNames.contains('logs')) {
                    const logStore = db.createObjectStore('logs', { autoIncrement: true });
                    logStore.createIndex('sessionId', 'sessionId', { unique: false });
                }
                // Store for YJS events (structural data)
                if (!db.objectStoreNames.contains('yjs_events')) {
                    const yStore = db.createObjectStore('yjs_events', { autoIncrement: true });
                    yStore.createIndex('sessionId', 'sessionId', { unique: false });
                }
                // Store for Project Snapshots (VM JSON)
                if (!db.objectStoreNames.contains('snapshots')) {
                    const snapStore = db.createObjectStore('snapshots', { autoIncrement: true });
                    snapStore.createIndex('sessionId', 'sessionId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                this._startFlushLoop();
                resolve(true);
            };
        });
    }

    /**
     * Initializes a new recording session.
     */
    async startSession(projectId) {
        if (!this.enabled) return;

        this.projectId = projectId || 'unknown_project';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.dbName = `${this.projectId}_${timestamp}`;
        this.sessionId = `${this.projectId}_${timestamp}_${Math.floor(Math.random() * 1000)}`;

        // Clean up previous session references if existing
        this.stop();

        const opened = await this.open();
        if (!opened || !this.db) {
            console.error(`[BlackBox] Failed to open session DB: ${this.dbName}`);
            return;
        }

        // Start the heartbeat to tell other tabs "Do not touch my DB"
        this._startHeartbeat();

        const sessionData = {
            sessionId: this.sessionId,
            projectId: this.projectId,
            startTime: Date.now(),
            userAgent: navigator.userAgent
        };

        this._addToBuffer('sessions', sessionData);
        console.log(`[BlackBox] Recording started. DB: ${this.dbName}, Session ID: ${this.sessionId}`);
    }

    /**
     * Stops the current session, clears intervals, and removes the lock.
     */
    stop() {
        if (this.dbName) {
            // Remove the heartbeat lock immediately
            localStorage.removeItem(`blackbox_active_${this.dbName}`);
        }

        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.ready = false;
        
        if (this.flushInterval) clearInterval(this.flushInterval);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    }

    _startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        const updateHeartbeat = () => {
            if (this.dbName) {
                localStorage.setItem(`blackbox_active_${this.dbName}`, Date.now().toString());
            }
        };

        // Run immediately then interval
        updateHeartbeat();
        this.heartbeatInterval = setInterval(updateHeartbeat, this.HEARTBEAT_MS);
    }

    /**
     * Iterates through all IndexedDB databases to clean up and upload old ones.
     */
    async processOldSessions() {
        if (!this.enabled) return;
        if (!window.indexedDB.databases) return;

        try {
            const dbs = await window.indexedDB.databases();
            const recordingDbPattern = /^(.*?)_(\d{4}-\d{2}-\d{2}T.*)$/;

            for (const dbInfo of dbs) {
                const name = dbInfo.name;
                const match = name ? name.match(recordingDbPattern) : null;
                
                // Skip if not a blackbox DB or if it's the one specifically owned by this instance
                if (!match || name === this.dbName) continue;

                // LOCK CHECK: Check if another tab is updating the heartbeat for this DB
                const lastHeartbeat = localStorage.getItem(`blackbox_active_${name}`);
                if (lastHeartbeat) {
                    const timeSinceHeartbeat = Date.now() - parseInt(lastHeartbeat, 10);
                    if (timeSinceHeartbeat < this.LOCK_EXPIRY_MS) {
                        // It is active in another tab (heartbeat was less than 15s ago)
                        console.log(`[BlackBox] Skipping active DB from another tab: ${name}`);
                        continue;
                    } else {
                        // Heartbeat exists but is old (tab crashed?), safe to process
                        console.log(`[BlackBox] Found abandoned active-lock for ${name} (expired). Processing...`);
                        localStorage.removeItem(`blackbox_active_${name}`);
                    }
                }

                console.log(`[BlackBox] Found old session: ${name}. Initiating upload sequence...`);
                
                try {
                    const dumpBlob = await this._exportDatabaseToBlob(name);
                    if (dumpBlob) {
                        const uploaded = await this._uploadDump(dumpBlob, `${name}.json`);
                        if (uploaded) {
                            console.log(`[BlackBox] Upload successful. Deleting local DB: ${name}`);
                            window.indexedDB.deleteDatabase(name);
                            // Clean up lock just in case
                            localStorage.removeItem(`blackbox_active_${name}`);
                        } else {
                            console.warn(`[BlackBox] Upload failed for ${name}. Keeping data for retry later.`);
                        }
                    } else {
                        console.warn(`[BlackBox] Could not export ${name} (empty/corrupt). Deleting.`);
                        window.indexedDB.deleteDatabase(name);
                        localStorage.removeItem(`blackbox_active_${name}`);
                    }
                } catch (err) {
                    console.error(`[BlackBox] Error processing old session ${name}:`, err);
                }
            }
        } catch (e) {
            console.warn("[BlackBox] Failed to list databases for cleanup", e);
        }
    }

    /**
     * Exports a specific database (by name) to a JSON Blob.
     */
    async _exportDatabaseToBlob(dbName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            
            request.onerror = () => resolve(null);
            
            request.onsuccess = async (event) => {
                const tempDb = event.target.result;
                const storeNames = Array.from(tempDb.objectStoreNames);
                
                if (storeNames.length === 0) {
                    tempDb.close();
                    resolve(null);
                    return;
                }

                const blobParts = ['{'];
                let firstStore = true;

                const processStore = (storeIndex) => {
                    if (storeIndex >= storeNames.length) {
                        blobParts.push('}');
                        tempDb.close();
                        resolve(new Blob(blobParts, { type: 'application/json' }));
                        return;
                    }

                    const storeName = storeNames[storeIndex];
                    if (!firstStore) blobParts.push(',');
                    firstStore = false;
                    
                    blobParts.push(`"${storeName}": [`);
                    
                    const tx = tempDb.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const cursorRequest = store.openCursor();
                    let firstItem = true;

                    cursorRequest.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            if (!firstItem) blobParts.push(',');
                            firstItem = false;
                            try {
                                blobParts.push(JSON.stringify(cursor.value));
                            } catch (err) {
                                blobParts.push('null');
                            }
                            cursor.continue();
                        } else {
                            blobParts.push(']');
                            processStore(storeIndex + 1);
                        }
                    };
                    
                    cursorRequest.onerror = () => {
                        blobParts.push(']');
                        processStore(storeIndex + 1);
                    };
                };

                processStore(0);
            };
        });
    }

    /**
     * Uploads the exported database blob to the server.
     * @param {Blob} blob The blob containing the database dump.
     * @param {string} filename The filename for the upload.
     */
    async _uploadDump(blob, filename) {
        if (this._accessToken == null) {
            this._accessToken = await storage.loadAccessToken();
        }
        const formData = new FormData();
        formData.append('file', blob, filename);
        
        const url = `${constants.apiHostURL}/v1/feedback/black-box`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    Authorization: `Bearer ${this._accessToken}`
                }
            });

            return response.ok;
        } catch (e) {
            console.error('[BlackBox] Upload fetch failed', e);
            return false;
        }
    }

    /**
     * Saves the full VM JSON snapshot. 
     */
    saveSnapshot(vmJSON) {
        if (!this.enabled) return;
        if (!this.sessionId) return;

        const snapshotLogic = () => {
            try {
                const data = typeof vmJSON === 'object' ? JSON.stringify(vmJSON) : vmJSON;
                
                this._addToBuffer('snapshots', {
                    sessionId: this.sessionId,
                    timestamp: Date.now(),
                    type: 'initial_load',
                    data: data
                });
            } catch (e) {
                console.error("[BlackBox] Failed to stringify snapshot", e);
            }
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(snapshotLogic, { timeout: 1000 });
        } else {
            setTimeout(snapshotLogic, 50);
        }
    }

    log(level, args) {
        if (!this.enabled) return;
        if (!this.sessionId) return;
        const sanitizedArgs = args.map(arg => this._sanitizeForStorage(arg));
        this._addToBuffer('logs', {
            sessionId: this.sessionId,
            timestamp: Date.now(),
            level: level,
            payload: sanitizedArgs
        });
    }

    recordYjsEvent(direction, type, data) {
        if (!this.enabled) return;
        if (!this.sessionId) return;
        let safeData;
        try {
            safeData = structuredClone(data);
        } catch (e) {
            safeData = this._sanitizeForStorage(data);
        }
        this._addToBuffer('yjs_events', {
            sessionId: this.sessionId,
            timestamp: Date.now(),
            direction: direction, 
            category: type,
            data: safeData
        });
    }

    _addToBuffer(storeName, item) {
        this.writeBuffer.push({ storeName, item });
        if (this.writeBuffer.length >= 100) {
            this._flushBuffer();
        }
    }

    _startFlushLoop() {
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.flushInterval = setInterval(() => this._flushBuffer(), this.FLUSH_INTERVAL_MS);
    }

    async _flushBuffer() {
        if (!this.db || this.writeBuffer.length === 0 || this.isFlushing) return;

        this.isFlushing = true;
        const batch = [...this.writeBuffer];
        this.writeBuffer = []; 

        try {
            const storesNeeded = [...new Set(batch.map(i => i.storeName))];
            const transaction = this.db.transaction(storesNeeded, 'readwrite');

            transaction.onerror = (event) => {
                console.error('[BlackBox] Flush transaction error', event);
            };

            batch.forEach(entry => {
                try {
                    const store = transaction.objectStore(entry.storeName);
                    const request = store.add(entry.item);
                    
                    request.onerror = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.warn(`[BlackBox] Failed to write single item to ${entry.storeName}`, e);
                    };
                } catch (e) {
                    console.warn(`[BlackBox] Failed to initiate add to ${entry.storeName}`, e);
                }
            });

        } catch (e) {
            console.error('[BlackBox] Failed to start flush transaction', e);
        } finally {
            this.isFlushing = false;
        }
    }

    _sanitizeForStorage(item, depth = 0) {
        if (depth > 2) return '[Max Depth Reached]'; 
        if (item === null) return null;
        if (typeof item !== 'object') return item;
        
        if (item instanceof Node) {
            return `[DOM Element: ${item.nodeName}${item.id ? '#' + item.id : ''}${item.className ? '.' + item.className : ''}]`;
        }
        if (item instanceof Error) {
            return { name: item.name, message: item.message, stack: item.stack };
        }
        if (Array.isArray(item)) {
            return item.map(i => this._sanitizeForStorage(i, depth + 1));
        }
        try {
            if (item.constructor === Object || ArrayBuffer.isView(item) || item instanceof ArrayBuffer) {
                const copy = {};
                for (const key in item) {
                    copy[key] = this._sanitizeForStorage(item[key], depth + 1);
                }
                return copy;
            }
            return String(item);
        } catch(e) {
            return '[Unserializable Object]';
        }
    }

    async exportCurrentSessionAsBlob() {
        if (!this.sessionId || !this.db) {
            return new Blob([JSON.stringify({ error: "No active DB" })], { type: 'application/json' });
        }

        return new Promise((resolve) => {
            const blobParts = ['{'];
            
            // Add Header Metadata
            const metadata = {
                sessionId: this.sessionId,
                projectId: this.projectId,
                generatedAt: new Date().toISOString()
            };
            blobParts.push(`"metadata": ${JSON.stringify(metadata)},`);

            const storesToExport = ['logs', 'yjs_events', 'snapshots'];
            
            const processStore = (index) => {
                if (index >= storesToExport.length) {
                    blobParts.push('}');
                    resolve(new Blob(blobParts, { type: 'text/plain;charset=utf-8' }));
                    return;
                }

                const storeName = storesToExport[index];
                if (!this.db.objectStoreNames.contains(storeName)) {
                    processStore(index + 1);
                    return;
                }

                blobParts.push(`"${storeName}": [`);

                const tx = this.db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const indexIdx = store.index('sessionId');
                const request = indexIdx.openCursor(IDBKeyRange.only(this.sessionId));
                
                let firstItem = true;

                request.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (!firstItem) blobParts.push(',');
                        firstItem = false;
                        try {
                            blobParts.push(JSON.stringify(cursor.value));
                        } catch (err) {
                            blobParts.push(`{"error": "Serialization failed"}`);
                        }
                        cursor.continue();
                    } else {
                        blobParts.push(']');
                        if (index < storesToExport.length - 1) {
                            blobParts.push(',');
                        }
                        processStore(index + 1);
                    }
                };

                request.onerror = (e) => {
                    console.error(`[BlackBox] Error reading ${storeName}`, e);
                    blobParts.push(']');
                    if (index < storesToExport.length - 1) blobParts.push(',');
                    processStore(index + 1);
                };
            };

            processStore(0);
        });
    }
    
    async exportCurrentSession() {
        console.warn("[BlackBox] exportCurrentSession called. Use exportCurrentSessionAsBlob to avoid OOM.");
        const blob = await this.exportCurrentSessionAsBlob();
        const text = await blob.text();
        return JSON.parse(text);
    }
}

export const recorder = new DebugRecorder();
