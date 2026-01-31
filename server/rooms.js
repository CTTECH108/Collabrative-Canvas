// Manages all the different rooms and keeps track of who's in each one
// A room is basically a separate shared canvas session

class RoomManager {
    constructor() {
        // Map of roomId -> Map of userId -> userData
        this.rooms = new Map();
    }
    
    // Add a user to a room
    addUser(roomId, userData) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Map());
        }
        
        const room = this.rooms.get(roomId);
        room.set(userData.id, userData);
        
        return true;
    }
    
    // Remove a user from a room
    removeUser(roomId, userId) {
        if (!this.rooms.has(roomId)) return false;
        
        const room = this.rooms.get(roomId);
        const removed = room.delete(userId);
        
        // Auto-clean empty rooms
        if (room.size === 0) {
            this.rooms.delete(roomId);
        }
        
        return removed;
    }
    
    // Get everyone in a room
    getUsers(roomId) {
        if (!this.rooms.has(roomId)) return [];
        
        return Array.from(this.rooms.get(roomId).values());
    }
    
    // Look up a specific user
    getUser(roomId, userId) {
        if (!this.rooms.has(roomId)) return null;
        
        return this.rooms.get(roomId).get(userId);
    }
    
    // Check if a room has no one in it
    isRoomEmpty(roomId) {
        if (!this.rooms.has(roomId)) return true;
        return this.rooms.get(roomId).size === 0;
    }
    
    // How many people in a specific room?
    getUserCount(roomId) {
        if (!this.rooms.has(roomId)) return 0;
        return this.rooms.get(roomId).size;
    }
    
    // How many active rooms do we have?
    getRoomCount() {
        return this.rooms.size;
    }
    
    // Total number of people connected to everything
    getTotalUserCount() {
        let count = 0;
        this.rooms.forEach(room => {
            count += room.size;
        });
        return count;
    }
    
    // Remove a room from memory
    deleteRoom(roomId) {
        return this.rooms.delete(roomId);
    }
    
    // Get a list of all active room IDs
    getRoomIds() {
        return Array.from(this.rooms.keys());
    }
    
    // Get details about a specific room
    getRoomInfo(roomId) {
        if (!this.rooms.has(roomId)) return null;
        
        const room = this.rooms.get(roomId);
        return {
            id: roomId,
            userCount: room.size,
            users: Array.from(room.values()).map(u => ({
                id: u.id,
                name: u.name,
                color: u.color
            }))
        };
    }
}

module.exports = { RoomManager };
