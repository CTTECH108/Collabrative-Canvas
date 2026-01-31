# 🏗️ How This Thing Works

This doc explains what's happening under the hood when people draw together.

## The Big Picture

It's pretty straightforward - there's a client (your browser) that sends drawing events to a server, and the server broadcasts them to everyone else. No fancy algorithms, just real-time communication.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  canvas.js  │◄──►│   main.js   │◄──►│websocket.js │                 │
│  │             │    │             │    │             │                 │
│  │ - Drawing   │    │ - App Logic │    │ - Socket.io │                 │
│  │ - Canvas API│    │ - UI Events │    │ - Events    │                 │
│  │ - Rendering │    │ - State     │    │ - Protocol  │                 │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                 │
└────────────────────────────────────────────────┼────────────────────────┘
                                                 │
                                        WebSocket Connection
                                                 │
┌────────────────────────────────────────────────┼────────────────────────┐
│                              Server Layer      │                        │
│  ┌─────────────┐    ┌─────────────┐    ┌──────▼──────┐                 │
│  │  rooms.js   │◄──►│ server.js   │◄──►│state-manager│                 │
│  │             │    │             │    │   .js       │                 │
│  │ - Room Mgmt │    │ - Express   │    │             │                 │
│  │ - User Mgmt │    │ - Socket.io │    │ - History   │                 │
│  │ - Lifecycle │    │ - Routing   │    │ - Undo/Redo │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Drawing Flow

```
┌──────────┐    Mouse/Touch    ┌──────────┐
│  User A  │ ────────────────► │ Canvas   │
└──────────┘                   │ Manager  │
                               └────┬─────┘
                                    │
                   ┌────────────────┴────────────────┐
                   │                                 │
                   ▼                                 ▼
            ┌──────────┐                     ┌──────────┐
            │  Local   │                     │ WebSocket│
            │ Drawing  │                     │  Client  │
            └──────────┘                     └────┬─────┘
                                                  │
                                      stroke:start/move/end
                                                  │
                                                  ▼
                                            ┌──────────┐
                                            │  Server  │
                                            │          │
                                            └────┬─────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                              ▼                  ▼                  ▼
                        ┌──────────┐      ┌──────────┐      ┌──────────┐
                        │  User B  │      │  User C  │      │  User D  │
                        │ (Canvas) │      │ (Canvas) │      │ (Canvas) │
                        └──────────┘      └──────────┘      └──────────┘
```

### Undo/Redo Flow

```
┌──────────┐                   ┌──────────┐                   ┌──────────┐
│  User A  │                   │  Server  │                   │  User B  │
└────┬─────┘                   └────┬─────┘                   └────┬─────┘
     │                              │                              │
     │  undo:request                │                              │
     │─────────────────────────────►│                              │
     │                              │                              │
     │                         ┌────┴────┐                         │
     │                         │ Move    │                         │
     │                         │ History │                         │
     │                         │ Pointer │                         │
     │                         └────┬────┘                         │
     │                              │                              │
     │◄─────────────────────────────│─────────────────────────────►│
     │       undo:applied           │          undo:applied        │
     │    (full stroke array)       │       (full stroke array)    │
     │                              │                              │
┌────┴────┐                         │                         ┌────┴────┐
│ Redraw  │                         │                         │ Redraw  │
│ Canvas  │                         │                         │ Canvas  │
└─────────┘                         │                         └─────────┘
```

## WebSocket Protocol

### Message Types

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `room:join` | C→S | `{ roomId }` | Join a drawing room |
| `room:joined` | S→C | `{ roomId, userId, userName, userColor }` | Confirmation of room join |
| `user:joined` | S→C | `{ id, name, color }` | Another user joined |
| `user:left` | S→C | `userId` | User disconnected |
| `users:update` | S→C | `[{ id, name, color }, ...]` | Full user list |
| `stroke:start` | C↔S | `{ tool, color, strokeWidth, points, userId }` | New stroke begins |
| `stroke:move` | C↔S | `{ points, userId }` | Points added to stroke |
| `stroke:end` | C↔S | `{ id, points, color, strokeWidth, userId }` | Stroke completed |
| `cursor:move` | C↔S | `{ x, y, userId, userName, color }` | Cursor position |
| `history:sync` | S→C | `{ strokes, canUndo, canRedo }` | Full state for new user |
| `undo:request` | C→S | - | Request undo |
| `undo:applied` | S→C | `{ strokes, canUndo, canRedo }` | Undo applied |
| `redo:request` | C→S | - | Request redo |
| `redo:applied` | S→C | `{ strokes, canUndo, canRedo }` | Redo applied |
| `canvas:clear` | C→S | - | Request clear |
| `canvas:cleared` | S→C | - | Canvas cleared |

### Stroke Data Structure

```javascript
{
  id: "stroke_1706789012345_abc123def",  // Unique stroke ID
  tool: "brush",                          // "brush" or "eraser"
  color: "#3B82F6",                       // Hex color
  strokeWidth: 5,                         // Pixels
  points: [                               // Array of coordinates
    { x: 100.5, y: 200.3 },
    { x: 102.1, y: 201.5 },
    // ...
  ],
  userId: "socket_id",                    // Socket.io ID
  userName: "SwiftArtist42",              // Display name
  userColor: "#EF4444",                   // User's assigned color
  timestamp: 1706789012345                // Unix timestamp
}
```

## Undo/Redo Strategy

### How it works

We keep a simple list of all strokes and a pointer that shows which ones are visible:

```
History: [S1, S2, S3, S4, S5, S6]
         ↑                    ↑
        start               pointer = show all 6

After 2 undos:
History: [S1, S2, S3, S4, S5, S6]
         ↑            ↑
        start       pointer = show only 1-4

After 1 redo:
History: [S1, S2, S3, S4, S5, S6]
         ↑                ↑
        start           pointer = show 1-5

If you draw new stroke (S7) after undoing:
History: [S1, S2, S3, S4, S7]  ← S5 and S6 are gone
         ↑                    ↑
        start              pointer
```

### Why this design?

1. **Easy**: One list, one pointer
2. **Same for everyone**: Everyone sees the same state
3. **Works with teams**: Anyone can undo anything
4. **No conflicts**: Can't have two different versions

### Downsides

- User A can undo User B's strokes
- You lose stuff if you undo then draw
- But it's simple and works

## How conflicts are handled

### Simple approach: First come, first served

- User A and User B draw at the same time
- Both strokes get saved in order they arrive at server
- Both stay on the canvas
- Both are in the history

If they overlap on screen, the later one just appears on top. No conflicts.

## Performance stuff

**Why use "volatile" messages for cursor updates?**

- Local drawing is immediate (optimistic)
- Server broadcasts to others
- No rubber-banding needed for drawing

**Simultaneous Undo:**
- Server processes in order
- Second undo affects different stroke
- Both clients receive updated state

## How we keep it fast

### Client stuff

**Smooth curves** - Use quadratic curves, not straight lines. Looks way better.

**Batch updates** - Don't send every point. Wait for animation frame, send a bunch.

**Quick cursor** - Cursor position can be lost, that's okay. Faster than guaranteeing delivery.

**Smart coordinates** - Calculate scale once, reuse it. Don't recalculate every time.

### Server stuff

**Rooms are separate** - Room A messages don't go to Room B. Less to broadcast.

**Clean up strokes** - Don't keep more than 1000. Prevents memory from exploding.

**Delete empty rooms** - When everyone leaves, trash it. Frees memory.

### Network

**Group points** - Send 10 points, not 10 messages. Reduces overhead.

**Strokes in 3 parts** - Start, move, end. Allows real-time rendering.

**WebSocket preferred** - Way faster than HTTP. Falls back if needed.

## What we could add later

**Redis** - Share data between multiple servers

**Database** - Save drawings forever

**Load balancer** - Spread traffic across servers

**CDN** - Serve static files faster

## Security (TODO)

- Validate drawing data
- Stop spam attacks
- Private rooms/passwords
- User login

## Testing

1. Open 2+ windows
2. Draw in one, see it in others
3. Test undo - does it sync?
4. Disconnect user - what happens?

No automated tests yet, just manual.

## Bottom line

We chose:
- **Real-time** over perfect
- **Simple** over fancy
- **Fast** over complex

Undo/redo is simple - one list, one pointer. Everyone sees the same thing. Done.
