// Main app - brings together the canvas and WebSocket communication
// Handles all the UI logic and coordinates drawing with other users

import { CanvasManager } from './canvas.js';
import { WebSocketManager } from './websocket.js';

class CollaborativeCanvas {
    constructor() {
        // Get room ID from URL or use default
        this.roomId = this.getRoomIdFromUrl();
        
        // Managers
        this.canvasManager = null;
        this.wsManager = null;
        
        // State
        this.users = new Map();
        this.cursors = new Map();
        this.remoteStrokes = new Map(); // Track in-progress remote strokes
        
        // DOM Elements
        this.elements = {};
        
        // Initialize
        this.init();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        this.cacheElements();
        this.setupCanvas();
        this.setupToolbar();
        this.setupKeyboardShortcuts();
        await this.connectWebSocket();
        this.updateRoomInfo();
    }
    
    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            canvas: document.getElementById('drawingCanvas'),
            cursorContainer: document.getElementById('cursorContainer'),
            colorPicker: document.getElementById('colorPicker'),
            colorPreview: document.getElementById('colorPreview'),
            strokeWidth: document.getElementById('strokeWidth'),
            strokeValue: document.getElementById('strokeValue'),
            undoBtn: document.getElementById('undoBtn'),
            redoBtn: document.getElementById('redoBtn'),
            clearBtn: document.getElementById('clearBtn'),
            connectionStatus: document.getElementById('connectionStatus'),
            usersPanel: document.getElementById('usersPanel'),
            userList: document.getElementById('userList'),
            userCount: document.getElementById('userCount'),
            roomId: document.getElementById('roomId'),
            copyRoomBtn: document.getElementById('copyRoomBtn'),
            toastContainer: document.getElementById('toastContainer')
        };
    }
    
    /**
     * Setup canvas manager
     */
    setupCanvas() {
        // Calculate canvas size to fit container
        const container = this.elements.canvas.parentElement;
        const maxWidth = Math.min(container.clientWidth - 40, 1920);
        const maxHeight = Math.min(container.clientHeight - 40, 1080);
        const aspectRatio = 16 / 9;
        
        let width = maxWidth;
        let height = maxWidth / aspectRatio;
        
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }
        
        this.canvasManager = new CanvasManager(this.elements.canvas, {
            width: Math.round(width),
            height: Math.round(height)
        });
        
        // Set up canvas event callbacks
        this.canvasManager.onStrokeStart = (data) => this.handleLocalStrokeStart(data);
        this.canvasManager.onStrokeMove = (data) => this.handleLocalStrokeMove(data);
        this.canvasManager.onStrokeEnd = (stroke) => this.handleLocalStrokeEnd(stroke);
        this.canvasManager.onCursorMove = (pos) => this.handleLocalCursorMove(pos);
    }
    
    /**
     * Setup toolbar event listeners
     */
    setupToolbar() {
        // Tool buttons
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.canvasManager.setTool(btn.dataset.tool);
            });
        });
        
        // Color picker
        this.elements.colorPicker.addEventListener('input', (e) => {
            const color = e.target.value;
            this.canvasManager.setColor(color);
            this.elements.colorPreview.style.backgroundColor = color;
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        });
        
        // Initialize color preview
        this.elements.colorPreview.style.backgroundColor = this.elements.colorPicker.value;
        
        // Preset colors
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.canvasManager.setColor(color);
                this.elements.colorPicker.value = color;
                this.elements.colorPreview.style.backgroundColor = color;
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Stroke width
        this.elements.strokeWidth.addEventListener('input', (e) => {
            const width = e.target.value;
            this.canvasManager.setStrokeWidth(width);
            this.elements.strokeValue.textContent = `${width}px`;
        });
        
        // Undo/Redo buttons
        this.elements.undoBtn.addEventListener('click', () => this.handleUndo());
        this.elements.redoBtn.addEventListener('click', () => this.handleRedo());
        
        // Clear button
        this.elements.clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the canvas? This will affect all users.')) {
                this.handleClear();
            }
        });
        
        // Copy room link
        this.elements.copyRoomBtn.addEventListener('click', () => this.copyRoomLink());
    }
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Check if not typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.handleUndo();
            }
            
            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.handleRedo();
            }
            
            // B = Brush
            if (e.key === 'b' || e.key === 'B') {
                document.querySelector('[data-tool="brush"]')?.click();
            }
            
            // E = Eraser
            if (e.key === 'e' || e.key === 'E') {
                document.querySelector('[data-tool="eraser"]')?.click();
            }
            
            // [ and ] = Decrease/Increase brush size
            if (e.key === '[') {
                const current = parseInt(this.elements.strokeWidth.value);
                this.elements.strokeWidth.value = Math.max(1, current - 5);
                this.elements.strokeWidth.dispatchEvent(new Event('input'));
            }
            if (e.key === ']') {
                const current = parseInt(this.elements.strokeWidth.value);
                this.elements.strokeWidth.value = Math.min(50, current + 5);
                this.elements.strokeWidth.dispatchEvent(new Event('input'));
            }
        });
    }
    
    /**
     * Connect to WebSocket server
     */
    async connectWebSocket() {
        this.wsManager = new WebSocketManager({ roomId: this.roomId });
        
        // Set up WebSocket callbacks
        this.wsManager.on('onConnect', () => this.handleConnect());
        this.wsManager.on('onDisconnect', (reason) => this.handleDisconnect(reason));
        this.wsManager.on('onError', (error) => this.handleError(error));
        
        this.wsManager.on('onUserJoin', (user) => this.handleUserJoin(user));
        this.wsManager.on('onUserLeave', (userId) => this.handleUserLeave(userId));
        this.wsManager.on('onUsersUpdate', (users) => this.handleUsersUpdate(users));
        
        this.wsManager.on('onStrokeStart', (data) => this.handleRemoteStrokeStart(data));
        this.wsManager.on('onStrokeMove', (data) => this.handleRemoteStrokeMove(data));
        this.wsManager.on('onStrokeEnd', (data) => this.handleRemoteStrokeEnd(data));
        this.wsManager.on('onCursorMove', (data) => this.handleRemoteCursorMove(data));
        
        this.wsManager.on('onHistorySync', (data) => this.handleHistorySync(data));
        this.wsManager.on('onUndo', (data) => this.handleUndoApplied(data));
        this.wsManager.on('onRedo', (data) => this.handleRedoApplied(data));
        this.wsManager.on('onUndoRedoState', (data) => this.handleUndoRedoState(data));
        this.wsManager.on('onClear', () => this.handleClearApplied());
        
        try {
            await this.wsManager.connect();
        } catch (error) {
            console.error('Failed to connect:', error);
            this.showToast('Failed to connect to server', 'error');
        }
    }
    
    // ============================================
    // Local Event Handlers
    // ============================================
    
    handleLocalStrokeStart(data) {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitStrokeStart(data);
        }
    }
    
    handleLocalStrokeMove(data) {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitStrokeMove(data);
        }
    }
    
    handleLocalStrokeEnd(stroke) {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitStrokeEnd(stroke);
        }
    }
    
    handleLocalCursorMove(pos) {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitCursorMove(pos);
        }
    }
    
    handleUndo() {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitUndo();
        }
    }
    
    handleRedo() {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitRedo();
        }
    }
    
    handleClear() {
        if (this.wsManager.isSocketConnected()) {
            this.wsManager.emitClear();
        }
    }
    
    // ============================================
    // WebSocket Event Handlers
    // ============================================
    
    handleConnect() {
        this.updateConnectionStatus(true);
        this.showToast('Connected to server', 'success');
    }
    
    handleDisconnect(reason) {
        this.updateConnectionStatus(false);
        this.showToast('Disconnected from server', 'error');
    }
    
    handleError(error) {
        console.error('WebSocket error:', error);
        this.showToast('Connection error', 'error');
    }
    
    handleUserJoin(user) {
        this.users.set(user.id, user);
        this.updateUserList();
        this.showToast(`${user.name} joined`, 'info');
    }
    
    handleUserLeave(userId) {
        const user = this.users.get(userId);
        if (user) {
            this.showToast(`${user.name} left`, 'info');
        }
        this.users.delete(userId);
        this.removeCursor(userId);
        this.updateUserList();
    }
    
    handleUsersUpdate(users) {
        this.users.clear();
        users.forEach(user => {
            this.users.set(user.id, user);
        });
        this.updateUserList();
    }
    
    handleRemoteStrokeStart(data) {
        // Skip own strokes
        if (data.userId === this.wsManager.getUserId()) return;
        
        // Store the starting state for this remote stroke
        this.remoteStrokes.set(data.userId, {
            tool: data.tool,
            color: data.color,
            strokeWidth: data.strokeWidth,
            lastPoint: data.points[0]
        });
        
        // Draw initial point
        this.canvasManager.addRemotePoints({
            ...data,
            isStart: true
        });
    }
    
    handleRemoteStrokeMove(data) {
        // Skip own strokes
        if (data.userId === this.wsManager.getUserId()) return;
        
        const strokeState = this.remoteStrokes.get(data.userId);
        if (!strokeState) return;
        
        // Draw the points
        this.canvasManager.addRemotePoints({
            ...strokeState,
            points: data.points,
            prevPoint: strokeState.lastPoint
        });
        
        // Update last point
        if (data.points.length > 0) {
            strokeState.lastPoint = data.points[data.points.length - 1];
        }
    }
    
    handleRemoteStrokeEnd(data) {
        // Skip own strokes
        if (data.userId === this.wsManager.getUserId()) return;
        
        // Clean up tracking
        this.remoteStrokes.delete(data.userId);
    }
    
    handleRemoteCursorMove(data) {
        // Skip own cursor
        if (data.userId === this.wsManager.getUserId()) return;
        
        this.updateCursor(data);
    }
    
    handleHistorySync(data) {
        console.log('Syncing history with', data.strokes?.length, 'strokes');
        
        // Redraw canvas from history
        if (data.strokes) {
            this.canvasManager.redrawFromHistory(data.strokes);
        }
        
        // Update undo/redo button states
        this.updateUndoRedoButtons(data.canUndo, data.canRedo);
    }
    
    handleUndoApplied(data) {
        // Redraw canvas from updated history
        if (data.strokes) {
            this.canvasManager.redrawFromHistory(data.strokes);
        }
        
        this.updateUndoRedoButtons(data.canUndo, data.canRedo);
    }
    
    handleRedoApplied(data) {
        // Redraw canvas from updated history
        if (data.strokes) {
            this.canvasManager.redrawFromHistory(data.strokes);
        }
        
        this.updateUndoRedoButtons(data.canUndo, data.canRedo);
    }
    
    handleUndoRedoState(data) {
        this.updateUndoRedoButtons(data.canUndo, data.canRedo);
    }
    
    handleClearApplied() {
        this.canvasManager.clear();
        this.showToast('Canvas cleared', 'info');
    }
    
    // ============================================
    // UI Update Methods
    // ============================================
    
    updateConnectionStatus(connected) {
        const statusDot = this.elements.connectionStatus.querySelector('.status-dot');
        const statusText = this.elements.connectionStatus.querySelector('.status-text');
        
        statusDot.classList.toggle('connected', connected);
        statusDot.classList.toggle('disconnected', !connected);
        statusText.textContent = connected ? 'Connected' : 'Disconnected';
    }
    
    updateUserList() {
        const myId = this.wsManager.getUserId();
        let html = '';
        
        this.users.forEach(user => {
            const isMe = user.id === myId;
            html += `
                <li class="user-item ${isMe ? 'is-you' : ''}">
                    <div class="user-avatar" style="background-color: ${user.color}">
                        ${user.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="user-name">${user.name}</span>
                    ${isMe ? '<span class="user-badge">You</span>' : ''}
                </li>
            `;
        });
        
        this.elements.userList.innerHTML = html;
        this.elements.userCount.textContent = this.users.size;
    }
    
    updateCursor(data) {
        let cursor = this.cursors.get(data.userId);
        
        if (!cursor) {
            // Create new cursor element
            cursor = document.createElement('div');
            cursor.className = 'ghost-cursor';
            cursor.innerHTML = `
                <div class="cursor-pointer" style="background-color: ${data.color}"></div>
                <span class="cursor-label" style="background-color: ${data.color}">${data.userName || 'User'}</span>
            `;
            this.elements.cursorContainer.appendChild(cursor);
            this.cursors.set(data.userId, cursor);
        }
        
        // Get canvas position and calculate cursor position
        const canvasRect = this.elements.canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / this.elements.canvas.width;
        const scaleY = canvasRect.height / this.elements.canvas.height;
        
        const x = canvasRect.left + (data.x * scaleX);
        const y = canvasRect.top + (data.y * scaleY);
        
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
    
    removeCursor(userId) {
        const cursor = this.cursors.get(userId);
        if (cursor) {
            cursor.remove();
            this.cursors.delete(userId);
        }
    }
    
    updateUndoRedoButtons(canUndo, canRedo) {
        this.elements.undoBtn.disabled = !canUndo;
        this.elements.redoBtn.disabled = !canRedo;
    }
    
    updateRoomInfo() {
        this.elements.roomId.textContent = this.roomId;
    }
    
    // ============================================
    // Utility Methods
    // ============================================
    
    getRoomIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('room') || 'default';
    }
    
    copyRoomLink() {
        const url = `${window.location.origin}?room=${this.roomId}`;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Room link copied!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy link', 'error');
        });
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-message">${message}</span>`;
        
        this.elements.toastContainer.appendChild(toast);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CollaborativeCanvas();
});
