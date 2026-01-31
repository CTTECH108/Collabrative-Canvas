// Handles all communication with the server via Socket.io
// Manages connections, sending/receiving drawing events, and syncing state

export class WebSocketManager {
    constructor(options = {}) {
        this.socket = null;
        this.userId = null;
        this.userName = null;
        this.userColor = null;
        this.roomId = options.roomId || 'default';
        
        // Connection state
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Event callbacks
        this.callbacks = {
            onConnect: null,
            onDisconnect: null,
            onError: null,
            onUserJoin: null,
            onUserLeave: null,
            onUsersUpdate: null,
            onStrokeStart: null,
            onStrokeMove: null,
            onStrokeEnd: null,
            onCursorMove: null,
            onHistorySync: null,
            onUndo: null,
            onRedo: null,
            onClear: null,
            onUndoRedoState: null
        };
        
        // Batching for performance
        this.pendingCursorUpdates = new Map();
        this.cursorBatchInterval = null;
    }
    
    // Hook up to the server
    connect(serverUrl = window.location.origin) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io(serverUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: this.maxReconnectAttempts,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 10000
                });
                
                this.setupEventListeners();
                
                // Wait for connection to succeed
                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    
                    // Join the room
                    this.joinRoom(this.roomId);
                    resolve();
                });
                
                this.socket.on('connect_error', (error) => {
                    reject(error);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Register all the event handlers
    setupEventListeners() {
        // Connection stuff
        this.socket.on('connect', () => {
            console.log('[WS] Connected:', this.socket.id);
            this.isConnected = true;
            if (this.callbacks.onConnect) {
                this.callbacks.onConnect();
            }
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('[WS] Disconnected:', reason);
            this.isConnected = false;
            if (this.callbacks.onDisconnect) {
                this.callbacks.onDisconnect(reason);
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('[WS] Connection error:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError(error);
            }
        });
        
        // User/room events
        this.socket.on('room:joined', (data) => {
            console.log('[WS] Joined room:', data);
            this.userId = data.userId;
            this.userName = data.userName;
            this.userColor = data.userColor;
        });
        
        this.socket.on('user:joined', (user) => {
            console.log('[WS] User joined:', user);
            if (this.callbacks.onUserJoin) {
                this.callbacks.onUserJoin(user);
            }
        });
        
        this.socket.on('user:left', (userId) => {
            console.log('[WS] User left:', userId);
            if (this.callbacks.onUserLeave) {
                this.callbacks.onUserLeave(userId);
            }
        });
        
        this.socket.on('users:update', (users) => {
            if (this.callbacks.onUsersUpdate) {
                this.callbacks.onUsersUpdate(users);
            }
        });
        
        // Drawing events
        this.socket.on('stroke:start', (data) => {
            if (this.callbacks.onStrokeStart) {
                this.callbacks.onStrokeStart(data);
            }
        });
        
        this.socket.on('stroke:move', (data) => {
            if (this.callbacks.onStrokeMove) {
                this.callbacks.onStrokeMove(data);
            }
        });
        
        this.socket.on('stroke:end', (data) => {
            if (this.callbacks.onStrokeEnd) {
                this.callbacks.onStrokeEnd(data);
            }
        });
        
        // Cursor tracking
        this.socket.on('cursor:update', (data) => {
            if (this.callbacks.onCursorMove) {
                this.callbacks.onCursorMove(data);
            }
        });
        
        // Sync history on join
        this.socket.on('history:sync', (data) => {
            console.log('[WS] History sync received, strokes:', data.strokes?.length);
            if (this.callbacks.onHistorySync) {
                this.callbacks.onHistorySync(data);
            }
        });
        
        // Undo/redo events
        this.socket.on('undo:applied', (data) => {
            console.log('[WS] Undo applied');
            if (this.callbacks.onUndo) {
                this.callbacks.onUndo(data);
            }
        });
        
        this.socket.on('redo:applied', (data) => {
            console.log('[WS] Redo applied');
            if (this.callbacks.onRedo) {
                this.callbacks.onRedo(data);
            }
        });
        
        this.socket.on('undoredo:state', (data) => {
            if (this.callbacks.onUndoRedoState) {
                this.callbacks.onUndoRedoState(data);
            }
        });
        
        // Clear canvas
        this.socket.on('canvas:cleared', () => {
            console.log('[WS] Canvas cleared');
            if (this.callbacks.onClear) {
                this.callbacks.onClear();
            }
        });
    }
    
    /**
     * Join a drawing room
     */
    joinRoom(roomId) {
        this.roomId = roomId;
        this.socket.emit('room:join', { roomId });
    }
    
    /**
     * Emit stroke start
     */
    emitStrokeStart(strokeData) {
        this.socket.emit('stroke:start', {
            ...strokeData,
            userId: this.userId
        });
    }
    
    /**
     * Emit stroke move (batched points)
     */
    emitStrokeMove(moveData) {
        this.socket.emit('stroke:move', {
            ...moveData,
            userId: this.userId
        });
    }
    
    /**
     * Emit stroke end (complete stroke)
     */
    emitStrokeEnd(stroke) {
        this.socket.emit('stroke:end', {
            ...stroke,
            userId: this.userId,
            userName: this.userName,
            userColor: this.userColor
        });
    }
    
    /**
     * Emit cursor position
     */
    emitCursorMove(position) {
        // Throttle cursor updates
        this.socket.volatile.emit('cursor:move', {
            userId: this.userId,
            ...position
        });
    }
    
    /**
     * Request undo
     */
    emitUndo() {
        this.socket.emit('undo:request');
    }
    
    /**
     * Request redo
     */
    emitRedo() {
        this.socket.emit('redo:request');
    }
    
    /**
     * Request canvas clear
     */
    emitClear() {
        this.socket.emit('canvas:clear');
    }
    
    /**
     * Register callback
     */
    on(event, callback) {
        if (this.callbacks.hasOwnProperty(event)) {
            this.callbacks[event] = callback;
        }
    }
    
    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }
    
    /**
     * Get current user name
     */
    getUserName() {
        return this.userName;
    }
    
    /**
     * Get current user color
     */
    getUserColor() {
        return this.userColor;
    }
    
    /**
     * Check if connected
     */
    isSocketConnected() {
        return this.isConnected && this.socket?.connected;
    }
    
    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.cursorBatchInterval) {
            clearInterval(this.cursorBatchInterval);
        }
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isConnected = false;
    }
}
