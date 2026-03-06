export class WaveformRenderer {
    constructor(canvas, overlayCanvas) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        this.ctx = canvas.getContext('2d');
        this.overlayCtx = overlayCanvas.getContext('2d');

        this.buffer = null;
        this.zoomLevel = 1;
        this.scrollOffset = 0;

        this.selection = { start: 0, end: 0 };
        this.isSelecting = false;
        this.selectionStartX = 0;

        this.playheadPosition = 0;

        this.setupCanvasSize();
        this.setupEventListeners();
        this.draw();
    }

    setupCanvasSize() {
        const container = this.canvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Set canvas size accounting for device pixel ratio
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.overlayCanvas.width = width * dpr;
        this.overlayCanvas.height = height * dpr;

        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.overlayCanvas.style.width = `${width}px`;
        this.overlayCanvas.style.height = `${height}px`;

        this.ctx.scale(dpr, dpr);
        this.overlayCtx.scale(dpr, dpr);

        this.width = width;
        this.height = height;
    }

    setupEventListeners() {
        let isDragging = false;
        let dragStartX = 0;
        let dragStartOffset = 0;

        // Selection handlers
        this.overlayCanvas.addEventListener('mousedown', (e) => {
            if (!this.buffer) return;

            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;

            this.isSelecting = true;
            this.selectionStartX = x;

            const time = this.pixelToTime(x);
            this.selection.start = time;
            this.selection.end = time;

            this.drawOverlay();
        });

        this.overlayCanvas.addEventListener('mousemove', (e) => {
            if (!this.buffer || !this.isSelecting) return;

            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const startTime = this.pixelToTime(this.selectionStartX);
            const currentTime = this.pixelToTime(x);

            this.selection.start = Math.min(startTime, currentTime);
            this.selection.end = Math.max(startTime, currentTime);

            this.drawOverlay();
        });

        this.overlayCanvas.addEventListener('mouseup', () => {
            if (this.isSelecting) {
                this.isSelecting = false;

                // Update main app selection
                if (window.audioEditor) {
                    window.audioEditor.selection = this.selection;
                    window.audioEditor.updateUI();
                }
            }
        });

        this.overlayCanvas.addEventListener('mouseleave', () => {
            if (this.isSelecting) {
                this.isSelecting = false;
            }
        });

        // Scroll with mouse drag (middle mouse or shift+click)
        this.overlayCanvas.addEventListener('wheel', (e) => {
            if (!this.buffer) return;

            e.preventDefault();

            const scrollSpeed = this.getVisibleDuration() * 0.1;
            if (e.deltaY > 0) {
                this.scrollOffset = Math.min(
                    this.scrollOffset + scrollSpeed,
                    this.buffer.duration - this.getVisibleDuration()
                );
            } else {
                this.scrollOffset = Math.max(0, this.scrollOffset - scrollSpeed);
            }

            this.draw();
        });

        // Resize handler
        window.addEventListener('resize', () => {
            this.setupCanvasSize();
            this.draw();
        });
    }

    pixelToTime(x) {
        const visibleDuration = this.getVisibleDuration();
        const ratio = x / this.width;
        return this.scrollOffset + (ratio * visibleDuration);
    }

    timeToPixel(time) {
        const visibleDuration = this.getVisibleDuration();
        const relativeTime = time - this.scrollOffset;
        return (relativeTime / visibleDuration) * this.width;
    }

    getVisibleDuration() {
        if (!this.buffer) return 1;
        return this.buffer.duration / this.zoomLevel;
    }

    setBuffer(buffer) {
        this.buffer = buffer;
        this.scrollOffset = 0;
        this.selection = { start: 0, end: buffer ? buffer.duration : 0 };
        this.draw();
    }

    setZoom(level) {
        const oldZoom = this.zoomLevel;
        this.zoomLevel = Math.max(1, Math.min(100, level));

        // Keep center focused when zooming
        const centerTime = this.scrollOffset + this.getVisibleDuration() / 2;
        this.scrollOffset = Math.max(0, centerTime - this.getVisibleDuration() / 2);

        this.draw();
    }

    zoomIn() {
        this.setZoom(this.zoomLevel + 10);
    }

    zoomOut() {
        this.setZoom(this.zoomLevel - 10);
    }

    draw() {
        this.clear();

        if (!this.buffer) {
            this.drawEmpty();
            return;
        }

        this.drawWaveform();
        this.drawOverlay();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.overlayCtx.clearRect(0, 0, this.width, this.height);
    }

    drawEmpty() {
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.fillStyle = '#64748b';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('拖拽音频文件到此处', this.width / 2, this.height / 2);
    }

    drawWaveform() {
        const padding = 20;
        const waveformHeight = this.height - padding * 2;
        const centerY = this.height / 2;

        const visibleDuration = this.getVisibleDuration();
        const startSample = Math.floor((this.scrollOffset / this.buffer.duration) * this.buffer.length);
        const endSample = Math.floor(((this.scrollOffset + visibleDuration) / this.buffer.duration) * this.buffer.length);
        const samplesToDraw = endSample - startSample;

        // Draw background
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw grid
        this.drawGrid();

        // Draw waveform for each channel
        const numberOfChannels = this.buffer.numberOfChannels;
        const channelHeight = waveformHeight / numberOfChannels;

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = this.buffer.getChannelData(channel);
            const channelTop = padding + channel * channelHeight;
            const channelCenter = channelTop + channelHeight / 2;

            // Use different step sizes depending on zoom level
            const stepSize = Math.max(1, Math.floor(samplesToDraw / this.width / 2));

            this.ctx.fillStyle = '#3b82f6';
            this.ctx.beginPath();

            let previousX = 0;

            for (let x = 0; x < this.width; x++) {
                const sampleIndex = Math.floor((x / this.width) * samplesToDraw) + startSample;
                const endIndex = Math.min(sampleIndex + stepSize, channelData.length);

                let minVal = 0;
                let maxVal = 0;

                if (sampleIndex < channelData.length) {
                    minVal = channelData[sampleIndex];
                    maxVal = channelData[sampleIndex];

                    for (let i = sampleIndex; i < endIndex; i++) {
                        const value = channelData[i];
                        if (value < minVal) minVal = value;
                        if (value > maxVal) maxVal = value;
                    }
                }

                const minPixel = channelCenter - (Math.abs(minVal) * channelHeight / 2);
                const maxPixel = channelCenter - (Math.abs(maxVal) * channelHeight / 2);

                if (x === 0) {
                    this.ctx.moveTo(x, minPixel);
                } else {
                    this.ctx.lineTo(x, minPixel);
                }

                // Back drawing for the max values
                for (let backX = x; backX >= previousX; backX--) {
                    this.ctx.lineTo(backX, maxPixel);
                }

                previousX = x;
            }

            this.ctx.fill();

            // Draw center line
            this.ctx.strokeStyle = '#334155';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, channelCenter);
            this.ctx.lineTo(this.width, channelCenter);
            this.ctx.stroke();
        }
    }

    drawGrid() {
        const visibleDuration = this.getVisibleDuration();

        // Determine grid interval based on zoom level
        let gridInterval;
        if (visibleDuration < 0.1) {
            gridInterval = 0.01; // 10ms
        } else if (visibleDuration < 1) {
            gridInterval = 0.1; // 100ms
        } else if (visibleDuration < 10) {
            gridInterval = 0.5; // 500ms
        } else {
            gridInterval = 1; // 1 second
        }

        const gridStart = Math.floor(this.scrollOffset / gridInterval) * gridInterval;

        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 1;
        this.ctx.font = '10px sans-serif';
        this.ctx.fillStyle = '#64748b';
        this.ctx.textAlign = 'left';

        for (let time = gridStart; time < this.scrollOffset + visibleDuration; time += gridInterval) {
            const x = this.timeToPixel(time);

            if (x >= 0 && x <= this.width) {
                // Vertical grid line
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.height);
                this.ctx.stroke();

                // Time label
                const label = this.formatTime(time);
                this.ctx.fillText(label, x + 2, this.height - 5);
            }
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    drawOverlay() {
        this.overlayCtx.clearRect(0, 0, this.width, this.height);

        if (!this.buffer) return;

        // Draw selection
        if (this.selection.start < this.selection.end) {
            const startX = this.timeToPixel(this.selection.start);
            const endX = this.timeToPixel(this.selection.end);

            this.overlayCtx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            this.overlayCtx.fillRect(startX, 0, endX - startX, this.height);

            // Selection borders
            this.overlayCtx.strokeStyle = '#ef4444';
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.strokeRect(startX, 0, endX - startX, this.height);
        }
    }

    updatePlayhead(position) {
        this.playheadPosition = position;
        this.drawOverlay();
    }

    clearSelection() {
        this.selection = { start: 0, end: 0 };
        this.drawOverlay();
    }
}
