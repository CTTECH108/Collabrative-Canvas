// Keeps track of all drawing actions and handles undo/redo
// Each room has its own state with a history of all strokes
// When you undo, we just move a pointer back, when you redo we move it forward

class RoomState {
    constructor() {
        // All the strokes that have been drawn
        this.history = [];
        
        // Which stroke are we currently "at"?
        // -1 = blank canvas, 0 = first stroke, 1 = second stroke, etc.
        this.historyPointer = -1;
        
        // Don't keep too many strokes or memory will explode
        this.maxHistorySize = 1000;
    }
    
    // Return the strokes that should currently be visible
    get strokes() {
        if (this.historyPointer < 0) return [];
        return this.history.slice(0, this.historyPointer + 1);
    }
    
    // Add a new stroke to the history
    addStroke(stroke) {
        // If we've undone stuff and then draw new, throw away the redo stack
        if (this.historyPointer < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyPointer + 1);
        }
        
        // Add the new stroke
        this.history.push(stroke);
        this.historyPointer = this.history.length - 1;
        
        // Keep memory in check - don't store more than 1000 strokes
        if (this.history.length > this.maxHistorySize) {
            const excess = this.history.length - this.maxHistorySize;
            this.history = this.history.slice(excess);
            this.historyPointer -= excess;
        }
        
        return stroke;
    }
    
    // Step back one stroke
    undo() {
        if (!this.canUndo()) {
            return { success: false, reason: 'Nothing to undo' };
        }
        
        const undoneStroke = this.history[this.historyPointer];
        this.historyPointer--;
        
        return { 
            success: true, 
            undoneStroke,
            strokes: this.strokes
        };
    }
    
    // Step forward one stroke (redo)
    redo() {
        if (!this.canRedo()) {
            return { success: false, reason: 'Nothing to redo' };
        }
        
        this.historyPointer++;
        const redoneStroke = this.history[this.historyPointer];
        
        return { 
            success: true, 
            redoneStroke,
            strokes: this.strokes
        };
    }
    
    // Can we go back further?
    canUndo() {
        return this.historyPointer >= 0;
    }
    
    // Can we go forward further?
    canRedo() {
        return this.historyPointer < this.history.length - 1;
    }
    
    // Wipe everything clean
    clear() {
        this.history = [];
        this.historyPointer = -1;
    }
    
    // Get info about the current state
    getSummary() {
        return {
            totalStrokes: this.history.length,
            visibleStrokes: this.historyPointer + 1,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

class StateManager {
    constructor() {
        // Store a RoomState for each room
        this.rooms = new Map();
    }
    
    // Set up a room's state (creates it if it doesn't exist)
    initRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new RoomState());
        }
        return this.rooms.get(roomId);
    }
    
    // Get the state for a room (creates if missing)
    getRoomState(roomId) {
        return this.initRoom(roomId);
    }
    
    // Save a stroke to a room's history
    addStroke(roomId, stroke) {
        const state = this.getRoomState(roomId);
        return state.addStroke(stroke);
    }
    
    // Wipe a room clean
    clearRoom(roomId) {
        const state = this.getRoomState(roomId);
        state.clear();
    }
    
    // Completely remove a room from memory
    cleanupRoom(roomId) {
        this.rooms.delete(roomId);
    }
    
    // How many rooms are we tracking?
    getRoomCount() {
        return this.rooms.size;
    }
    
    // Get summary stats for all rooms
    getAllRoomSummaries() {
        const summaries = {};
        this.rooms.forEach((state, roomId) => {
            summaries[roomId] = state.getSummary();
        });
        return summaries;
    }
}

module.exports = { StateManager, RoomState };
