# 🎨 Real-Time Collaborative Drawing Canvas

A simple multi-user drawing app - open it in multiple windows or on different devices, and you can all draw together on the same canvas in real-time.

## ✨ What you can do

- **Draw together**: Everyone's strokes show up as they draw them
- **Tools**: Brush and eraser
- **Colors**: Pick any color you want, or choose from 8 presets
- **Brush size**: Adjust from tiny (1px) to huge (50px)
- **See cursors**: Watch where other users are pointing
- **Undo/Redo**: Anyone can undo any stroke (global undo)
- **User list**: See who's online
- **Separate rooms**: Create different canvases via URL
- **Mobile friendly**: Works on tablets and phones with touch
- **Keyboard**: B for brush, E for eraser, Ctrl+Z to undo, Ctrl+Y to redo

## 🚀 Getting Started

### What you need
- Node.js v18+
- npm or yarn

### Installation

```bash
# Go to the project folder
cd collaborative-canvas

# Install packages
npm install

# Start it up
npm start
```

### Open it up

Go to your browser and visit:
```
http://localhost:3000
```

### Try it with multiple people

1. Open the link in 2+ browser windows
2. Draw in one window
3. See your drawing appear in the other windows

To test on your phone/tablet on the same wifi:
```
http://[your-computer-ip]:3000
```

### Make separate canvases

Add `?room=name` to the URL:
```
http://localhost:3000?room=myboard
```

Send this link to others to draw in the same board.

## 📁 How it's organized

```
collaborative-canvas/
├── client/
│   ├── index.html        # The web page
│   ├── style.css         # Make it look nice
│   ├── canvas.js         # All the drawing
│   ├── websocket.js      # Talk to the server
│   └── main.js           # Glue it all together
├── server/
│   ├── server.js         # The server
│   ├── rooms.js          # Manage rooms
│   └── state-manager.js  # Keep track of drawings
├── package.json
├── README.md
└── ARCHITECTURE.md
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `B` | Brush |
| `E` | Eraser |
| `[` | Make brush smaller |
| `]` | Make brush bigger |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |

## 🔧 Change the port

By default it runs on port 3000, but you can change it:
```bash
PORT=8080 npm start
```

## 🚢 Deploy it

### Railway

1. Go to railway.app and make an account
2. Connect your GitHub
3. Done - it auto-deploys

### Heroku

1. Make a Heroku app
2. Push your code:
```bash
git push heroku main
```

### Render

1. Go to render.com and make a Web Service
2. Point it at your GitHub repo
3. Build: `npm install`
4. Start: `npm start`

## ⚠️ Stuff to know

1. **No saving**: When everyone leaves, the drawing disappears
2. **No login**: You get a random fun name
3. **Max 1000 strokes**: History stops after that
4. **Single server only**: Doesn't scale to multiple servers yet

## 📝 License

MIT
````
