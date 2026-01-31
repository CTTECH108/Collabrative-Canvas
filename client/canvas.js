// Handles all the drawing on the canvas
// Uses HTML5 Canvas API with smooth curves, touch support, and undo/redo
// Notifies listeners whenever drawing starts/moves/ends

export class CanvasManager {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d', { 
            willReadFrequently: false,
            alpha: false 
        });
        
        // Canvas dimensions
        this.width = options.width || 1920;
        this.height = options.height || 1080;
        
        // Drawing state
        this.isDrawing = false;
        this.currentPath = [];
        this.lastPoint = null;
        
        // Tool settings
        this.tool = 'brush';
        this.color = '#000000';
        this.strokeWidth = 5;
        
        // Stroke history for global undo/redo
        this.strokes = [];
        this.strokeIndex = -1;
        
        // Event callbacks
        this.onStrokeStart = null;
        this.onStrokeMove = null;
        this.onStrokeEnd = null;
        this.onCursorMove = null;
        
        // Performance optimization
        this.rafId = null;
        this.pendingPoints = [];
        this.lastEmitTime = 0;
        this.emitThrottle = 16; // ~60fps
        
        // Initialize
        this.init();
    }
    
    // Set everything up when created
    init() {
        // Make the canvas actual size
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Tweak drawing settings for smooth lines
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Start with blank white canvas
        this.clear();
        
        // Hook up all the mouse and touch events
        this.bindEvents();
    }
    
    // Set up mouse and touch listeners
    bindEvents() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handlePointerDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handlePointerUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handlePointerUp.bind(this));
        
        // Touch events for phones/tablets
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
        
        // Don't show context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // Figure out where on the canvas the user clicked/touched
    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }
    
    // User pressed down - start drawing
    handlePointerDown(event) {
        if (event.button !== 0) return; // only left click
        
        this.isDrawing = true;
        const point = this.getCanvasCoordinates(event);
        
        this.currentPath = [point];
        this.lastPoint = point;
        
        // Draw the starting dot
        this.drawPoint(point);
        
        // Tell everyone we started drawing
        if (this.onStrokeStart) {
            this.onStrokeStart({
                tool: this.tool,
                color: this.tool === 'eraser' ? '#FFFFFF' : this.color,
                strokeWidth: this.tool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth,
                points: [point]
            });
        }
    }
    
    // User is moving the mouse - draw as they move
    handlePointerMove(event) {
        const point = this.getCanvasCoordinates(event);
        
        // Send cursor position updates so others see where we're pointing
        if (this.onCursorMove) {
            const now = Date.now();
            if (now - this.lastEmitTime > this.emitThrottle) {
                this.onCursorMove(point);
                this.lastEmitTime = now;
            }
        }
        
        if (!this.isDrawing) return;
        
        // Keep track of all points in this stroke
        this.currentPath.push(point);
        
        // Draw a smooth line to the new point
        this.drawLineTo(point);
        this.lastPoint = point;
        
        // Send updates (but not too often to avoid flooding the network)
        if (this.onStrokeMove) {
            this.pendingPoints.push(point);
            
            if (!this.rafId) {
                this.rafId = requestAnimationFrame(() => {
                    if (this.pendingPoints.length > 0) {
                        this.onStrokeMove({
                            points: [...this.pendingPoints]
                        });
                        this.pendingPoints = [];
                    }
                    this.rafId = null;
                });
            }
        }
    }
    
    // User released the mouse - finish the stroke
    handlePointerUp() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        // Clean up any pending animation
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        // Save the completed stroke
        if (this.currentPath.length > 0) {
            const stroke = {
                id: this.generateStrokeId(),
                tool: this.tool,
                color: this.tool === 'eraser' ? '#FFFFFF' : this.color,
                strokeWidth: this.tool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth,
                points: [...this.currentPath],
                timestamp: Date.now()
            };
            
            // Tell everyone about the completed stroke
            if (this.onStrokeEnd) {
                this.onStrokeEnd(stroke);
            }
        }
        
        this.currentPath = [];
        this.lastPoint = null;
        this.pendingPoints = [];
    }
    
    // Handle touch events on mobile
    handleTouchStart(event) {
        event.preventDefault();
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.handlePointerDown({
                button: 0,
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        }
    }
    
    handleTouchMove(event) {
        event.preventDefault();
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            this.handlePointerMove({
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        }
    }
    
    handleTouchEnd(event) {
        event.preventDefault();
        this.handlePointerUp();
    }
    
    // Draw a dot (used for stroke starts)
    drawPoint(point) {
        const color = this.tool === 'eraser' ? '#FFFFFF' : this.color;
        const width = this.tool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth;
        
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    /**
     * Draw a smooth line to the next point using quadratic curves
     * This creates smoother lines than simple lineTo
     */
    drawLineTo(point) {
        const color = this.tool === 'eraser' ? '#FFFFFF' : this.color;
        const width = this.tool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth;
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        
        if (this.currentPath.length < 3) {
            // Simple line for short paths
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
            this.ctx.lineTo(point.x, point.y);
            this.ctx.stroke();
        } else {
            // Use quadratic curve for smooth lines
            const len = this.currentPath.length;
            const p0 = this.currentPath[len - 3];
            const p1 = this.currentPath[len - 2];
            const p2 = point;
            
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            this.ctx.beginPath();
            this.ctx.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
            this.ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
            this.ctx.stroke();
        }
    }
    
    // Draw a complete stroke (used when replaying from history or remote users)
    drawStroke(stroke) {
        if (!stroke.points || stroke.points.length === 0) return;
        
        this.ctx.strokeStyle = stroke.color;
        this.ctx.fillStyle = stroke.color;
        this.ctx.lineWidth = stroke.strokeWidth;
        
        const points = stroke.points;
        
        if (points.length === 1) {
            // Just a single dot
            this.ctx.beginPath();
            this.ctx.arc(points[0].x, points[0].y, stroke.strokeWidth / 2, 0, Math.PI * 2);
            this.ctx.fill();
            return;
        }
        
        // Draw smooth path
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            this.ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        
        // Connect to the last point
        const lastPoint = points[points.length - 1];
        this.ctx.lineTo(lastPoint.x, lastPoint.y);
        this.ctx.stroke();
    }
    
    // Wipe the canvas clean
    clear() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Redraw the entire canvas from stroke history (used for undo/redo)
    redrawFromHistory(strokes) {
        this.clear();
        
        for (const stroke of strokes) {
            this.drawStroke(stroke);
        }
    }
    
    // Apply a remote stroke from another user
    addRemoteStroke(stroke) {
        this.drawStroke(stroke);
    }
    
    // Draw points from a remote user in real-time
    addRemotePoints(data) {
        if (!data.points || data.points.length === 0) return;
        
        this.ctx.strokeStyle = data.color;
        this.ctx.fillStyle = data.color;
        this.ctx.lineWidth = data.strokeWidth;
        
        const points = data.points;
        
        if (data.isStart && points.length === 1) {
            // Draw starting dot
            this.ctx.beginPath();
            this.ctx.arc(points[0].x, points[0].y, data.strokeWidth / 2, 0, Math.PI * 2);
            this.ctx.fill();
            return;
        }
        
        // Draw the line
        this.ctx.beginPath();
        
        if (data.prevPoint) {
            this.ctx.moveTo(data.prevPoint.x, data.prevPoint.y);
        } else {
            this.ctx.moveTo(points[0].x, points[0].y);
        }
        
        for (let i = (data.prevPoint ? 0 : 1); i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        
        this.ctx.stroke();
    }
    
    // Change the current tool
    setTool(tool) {
        this.tool = tool;
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    }
    
    // Change the drawing color
    setColor(color) {
        this.color = color;
    }
    
    // Change the stroke width
    setStrokeWidth(width) {
        this.strokeWidth = parseInt(width, 10);
    }
    
    // Create a unique ID for each stroke
    generateStrokeId() {
        return `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Get the canvas as an image (for saving)
    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }
    
    // Resize the canvas without losing drawings
    resize(width, height) {
        // Keep what's already drawn
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        // Resize
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Set options again
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Restore the old content
        this.clear();
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    // Clean up resources
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
    }
}
