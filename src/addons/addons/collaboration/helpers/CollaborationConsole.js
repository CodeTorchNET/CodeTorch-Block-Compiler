// helpers/console.js
import { recorder } from './DebugRecorder.js';

export class CollaborationConsole {
    constructor() {}

    static log(...args) {
        console.log(...args); 
        recorder.log('LOG', args);
    }

    static warn(...args) {
        console.warn(...args);
        recorder.log('WARN', args);
    }

    static error(...args) {
        console.error(...args);
        recorder.log('ERROR', args);
    }
    
    static recordYjs(direction, type, data) {
        recorder.recordYjsEvent(direction, type, data);
    }
}

export default CollaborationConsole;
