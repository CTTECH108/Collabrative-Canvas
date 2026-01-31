// Main server entry point - sets up Express and Socket.io
// Handles all WebSocket connections and real-time communication

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./rooms');
const { StateManager } = require('./state-manager');

// Configuration
const PORT = process.env.PORT || 3000;

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS configuration
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Quick health check to see server status
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        rooms: roomManager.getRoomCount(),
        users: roomManager.getTotalUserCount()
    });
});

// Catch-all route for the single-page app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Initialize managers
const roomManager = new RoomManager();
const stateManager = new StateManager();

// Assign each user a unique color so they're easy to spot
const USER_COLORS = [
    '#EF4444', '#F97316', '#EAB308', '#22C55E', 
    '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
    '#F43F5E', '#06B6D4', '#10B981', '#6366F1'
];

// Generate fun random names for users who join
const ADJECTIVES = ['Swift', 'Bright', 'Cool', 'Happy', 'Lucky', 'Quick', 'Smart', 'Brave'];
const NOUNS = ['Artist', 'Painter', 'Creator', 'Designer', 'Drawer', 'Sketcher', 'Maker', 'Crafter'];

function generateUserName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
}

function getRandomColor() {
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

// Handle new socket connections
io.on('connection', (socket) => {
    console.log(`[Server] New connection: ${socket.id}`);
    
    let currentRoom = null;
    let userData = null;
    
    // When a user joins a room
    socket.on('room:join', ({ roomId }) => {
        currentRoom = roomId || 'default';
        
        // Set up the user's info
        userData = {
            id: socket.id,
            name: generateUserName(),
            color: getRandomColor(),
            joinedAt: Date.now()
        };
        
        // Add this user to the room
        socket.join(currentRoom);
        roomManager.addUser(currentRoom, userData);
        stateManager.initRoom(currentRoom);
        
        // Let the user know they're in
        socket.emit('room:joined', {
            roomId: currentRoom,
            userId: userData.id,
            userName: userData.name,
            userColor: userData.color
        });
        
        // Tell everyone else about the new user
        socket.to(currentRoom).emit('user:joined', userData);
        
        // Sync the user list for everyone
        const users = roomManager.getUsers(currentRoom);
        io.to(currentRoom).emit('users:update', users);
        
        // Send all previous drawings to the newcomer
        const roomState = stateManager.getRoomState(currentRoom);
        socket.emit('history:sync', {
            strokes: roomState.strokes,
            canUndo: roomState.canUndo(),
            canRedo: roomState.canRedo()
        });
        
        console.log(`[Server] User ${userData.name} joined room ${currentRoom}`);
    });
    
    // When a user starts drawing
    socket.on('stroke:start', (data) => {
        if (!currentRoom) return;
        
        // Send to everyone else in the room
        socket.to(currentRoom).emit('stroke:start', {
            ...data,
            userId: socket.id,
            userName: userData?.name,
            color: data.color
        });
    });
    
    // When a user is drawing (lots of updates)
    socket.on('stroke:move', (data) => {
        if (!currentRoom) return;
        
        // Use volatile messages for speed (we don't care if some updates drop)
        socket.volatile.to(currentRoom).emit('stroke:move', {
            ...data,
            userId: socket.id
        });
    });
    
    // When the user finishes drawing
    socket.on('stroke:end', (stroke) => {
        if (!currentRoom) return;
        
        // Save the complete stroke to history
        const completeStroke = {
            ...stroke,
            id: stroke.id || `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: socket.id,
            userName: userData?.name,
            userColor: userData?.color
        };
        
        stateManager.addStroke(currentRoom, completeStroke);
        
        // Tell everyone else about the completed stroke
        socket.to(currentRoom).emit('stroke:end', completeStroke);
        
        // Update the undo/redo buttons for everyone
        const roomState = stateManager.getRoomState(currentRoom);
        io.to(currentRoom).emit('undoredo:state', {
            canUndo: roomState.canUndo(),
            canRedo: roomState.canRedo()
        });
    });
    
    // Track where users are moving their cursor
    socket.on('cursor:move', (data) => {
        if (!currentRoom || !userData) return;
        
        // Show their cursor to everyone (volatile = fast, some updates can drop)
        socket.volatile.to(currentRoom).emit('cursor:update', {
            userId: socket.id,
            userName: userData.name,
            color: userData.color,
            x: data.x,
            y: data.y
        });
    });
    
    // User wants to undo a stroke
    socket.on('undo:request', () => {
        if (!currentRoom) return;
        
        const roomState = stateManager.getRoomState(currentRoom);
        const result = roomState.undo();
        
        if (result.success) {
            // Update everyone with the new state
            io.to(currentRoom).emit('undo:applied', {
                strokes: roomState.strokes,
                canUndo: roomState.canUndo(),
                canRedo: roomState.canRedo(),
                undoneBy: userData?.name
            });
            
            console.log(`[Server] Undo by ${userData?.name} in room ${currentRoom}`);
        }
    });
    
    // User wants to redo (bring back undone stroke)
    socket.on('redo:request', () => {
        if (!currentRoom) return;
        
        const roomState = stateManager.getRoomState(currentRoom);
        const result = roomState.redo();
        
        if (result.success) {
            // Update everyone with the new state
            io.to(currentRoom).emit('redo:applied', {
                strokes: roomState.strokes,
                canUndo: roomState.canUndo(),
                canRedo: roomState.canRedo(),
                redoneBy: userData?.name
            });
            
            console.log(`[Server] Redo by ${userData?.name} in room ${currentRoom}`);
        }
    });
    
    // User wants to clear the entire canvas
    socket.on('canvas:clear', () => {
        if (!currentRoom) return;
        
        stateManager.clearRoom(currentRoom);
        
        // Tell everyone the canvas is cleared
        io.to(currentRoom).emit('canvas:cleared');
        io.to(currentRoom).emit('undoredo:state', {
            canUndo: false,
            canRedo: false
        });
        
        console.log(`[Server] Canvas cleared by ${userData?.name} in room ${currentRoom}`);
    });
    
    // Handle user disconnection
    socket.on('disconnect', (reason) => {
        console.log(`[Server] Disconnected: ${socket.id}, reason: ${reason}`);
        
        if (currentRoom && userData) {
            // Take them out of the room
            roomManager.removeUser(currentRoom, socket.id);
            
            // Tell everyone they left
            socket.to(currentRoom).emit('user:left', socket.id);
            
            // Update user list
            const users = roomManager.getUsers(currentRoom);
            io.to(currentRoom).emit('users:update', users);
            
            // Clean up the room if it's now empty
            if (roomManager.isRoomEmpty(currentRoom)) {
                stateManager.cleanupRoom(currentRoom);
                console.log(`[Server] Room ${currentRoom} cleaned up (empty)`);
            }
        }
    });
});

// Log any socket errors that happen
io.on('error', (error) => {
    console.error('[Server] Socket.io error:', error);
});

// Fire up the server
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🎨 Collaborative Canvas Server                         ║
║                                                          ║
║   Server running on: http://localhost:${PORT}            ║
║                                                          ║
║   Open multiple browser windows to test collaboration!   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
});

// Shut down gracefully when terminated
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down...');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

// Also handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, shutting down...');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

module.exports = { app, io, server };
