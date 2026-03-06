import { AudioLoader } from './audio/audioLoader.js';
import { AudioProcessor } from './audio/audioProcessor.js';
import { AudioGenerator } from './audio/audioGenerator.js';
import { EffectsManager } from './audio/effects.js';
import { WaveformRenderer } from './ui/waveform.js';
import { exportWAV } from './utils/wavEncoder.js';

class AudioEditor {
    constructor() {
        this.audioContext = null;
        this.audioLoader = new AudioLoader();
        this.audioProcessor = new AudioProcessor();
        this.audioGenerator = new AudioGenerator();
        this.effectsManager = new EffectsManager();

        this.currentBuffer = null;
        this.originalBuffer = null;
        this.loadedFiles = [];
        this.activeFileIndex = -1;

        this.selection = { start: 0, end: 0 };
        this.isPlaying = false;
        this.isLooping = false;
        this.currentSource = null;
        this.gainNode = null;

        this.waveform = new WaveformRenderer(
            document.getElementById('waveformCanvas'),
            document.getElementById('overlayCanvas')
        );

        this.init();
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Initialize effects
            this.effectsManager.createEQFilters(this.audioContext);
            this.effectsManager.createReverb(this.audioContext);
            this.effectsManager.createDelay(this.audioContext);
            this.effectsManager.createCompressor(this.audioContext);
            this.effectsManager.createDistortion(this.audioContext);

            this.setupEventListeners();
            console.log('Audio editor initialized');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            alert('您的浏览器不支持 Web Audio API');
        }
    }

    setupEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Playback controls
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        document.getElementById('loopBtn').addEventListener('click', () => this.toggleLoop());

        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            document.getElementById('volumeValue').textContent = `${e.target.value}%`;
            if (this.gainNode) {
                this.gainNode.gain.value = e.target.value / 100;
            }
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => this.waveform.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.waveform.zoomOut());
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            this.waveform.setZoom(e.target.value / 100);
        });

        // Edit tools
        document.getElementById('trimBtn').addEventListener('click', () => this.trimSelection());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteSelection());
        document.getElementById('fadeInBtn').addEventListener('click', () => this.applyFadeIn());
        document.getElementById('fadeOutBtn').addEventListener('click', () => this.applyFadeOut());
        document.getElementById('muteBtn').addEventListener('click', () => this.muteSelection());
        document.getElementById('invertBtn').addEventListener('click', () => this.invertSelection());
        document.getElementById('normalizeBtn').addEventListener('click', () => this.normalizeAudio());

        // Generator
        document.getElementById('generateBtn').addEventListener('click', () => this.generateSound());
        document.getElementById('generatorType').addEventListener('change', (e) => {
            const isChirp = e.target.value === 'chirp';
            document.querySelector('.chirp-group').style.display = isChirp ? 'flex' : 'none';
            const isOscillator = ['sine', 'square', 'sawtooth', 'triangle', 'chirp'].includes(e.target.value);
            document.querySelector('.frequency-group').style.display = isOscillator ? 'flex' : 'none';
        });

        document.getElementById('genVolume').addEventListener('input', (e) => {
            document.getElementById('genVolumeValue').textContent = `${e.target.value}%`;
        });

        // ADSR
        ['adsrAttack', 'adsrDecay', 'adsrRelease'].forEach(id => {
            document.getElementById(id).addEventListener('input', (e) => {
                document.getElementById(`${id}Value`).textContent = `${e.target.value}s`;
            });
        });
        document.getElementById('adsrSustain').addEventListener('input', (e) => {
            document.getElementById('adsrSustainValue').textContent = `${e.target.value}%`;
        });

        // Effects
        this.setupEffectsListeners();

        // Export
        document.getElementById('exportBtn').addEventListener('click', () => this.exportAudio());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'KeyD':
                    this.deleteSelection();
                    break;
                case 'KeyT':
                    this.trimSelection();
                    break;
            }
        });
    }

    setupEffectsListeners() {
        // EQ
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                e.target.nextElementSibling.textContent = `${value > 0 ? '+' : ''}${value}dB`;
                this.effectsManager.updateEQ(e.target.dataset.freq, parseFloat(value));
            });
        });

        // Reverb
        document.getElementById('reverbEnabled').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.effectsManager.enableReverb();
            } else {
                this.effectsManager.disableReverb();
            }
        });
        document.getElementById('reverbSize').addEventListener('input', (e) => {
            this.effectsManager.updateReverb(e.target.value / 100);
        });
        document.getElementById('reverbDecay').addEventListener('input', (e) => {
            this.effectsManager.updateReverbDecay(e.target.value / 100);
        });

        // Delay
        document.getElementById('delayEnabled').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.effectsManager.enableDelay();
            } else {
                this.effectsManager.disableDelay();
            }
        });
        document.getElementById('delayTime').addEventListener('input', (e) => {
            document.getElementById('delayTimeValue').textContent = `${e.target.value}ms`;
            this.effectsManager.updateDelayTime(e.target.value / 1000);
        });
        document.getElementById('delayFeedback').addEventListener('input', (e) => {
            document.getElementById('delayFeedbackValue').textContent = `${e.target.value}%`;
            this.effectsManager.updateDelayFeedback(e.target.value / 100);
        });
        document.getElementById('delayMix').addEventListener('input', (e) => {
            document.getElementById('delayMixValue').textContent = `${e.target.value}%`;
            this.effectsManager.updateDelayMix(e.target.value / 100);
        });

        // Compressor
        document.getElementById('compressorEnabled').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.effectsManager.enableCompressor();
            } else {
                this.effectsManager.disableCompressor();
            }
        });
        document.getElementById('compThreshold').addEventListener('input', (e) => {
            document.getElementById('compThresholdValue').textContent = `${e.target.value}dB`;
            this.effectsManager.updateCompressorThreshold(parseFloat(e.target.value));
        });
        document.getElementById('compRatio').addEventListener('input', (e) => {
            document.getElementById('compRatioValue').textContent = `${e.target.value}:1`;
            this.effectsManager.updateCompressorRatio(parseFloat(e.target.value));
        });

        // Distortion
        document.getElementById('distortionEnabled').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.effectsManager.enableDistortion();
            } else {
                this.effectsManager.disableDistortion();
            }
        });
        document.getElementById('distortionAmount').addEventListener('input', (e) => {
            document.getElementById('distortionValue').textContent = e.target.value;
            this.effectsManager.updateDistortion(e.target.value / 100);
        });
    }

    async handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                try {
                    const buffer = await this.audioLoader.load(file);
                    this.loadedFiles.push({ name: file.name, buffer });
                    this.updateFileList();

                    if (this.currentBuffer === null) {
                        this.setActiveBuffer(this.loadedFiles.length - 1);
                    }
                } catch (error) {
                    console.error('Error loading file:', error);
                    alert(`无法加载文件: ${file.name}`);
                }
            }
        }
    }

    updateFileList() {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        this.loadedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item' + (index === this.activeFileIndex ? ' active' : '');
            item.innerHTML = `
                <span>${file.name}</span>
                <button class="remove-btn" data-index="${index}">×</button>
            `;

            item.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(index);
            });

            item.addEventListener('click', () => this.setActiveBuffer(index));

            fileList.appendChild(item);
        });
    }

    removeFile(index) {
        this.loadedFiles.splice(index, 1);

        if (this.activeFileIndex === index) {
            if (this.loadedFiles.length > 0) {
                this.setActiveBuffer(Math.max(0, index - 1));
            } else {
                this.currentBuffer = null;
                this.originalBuffer = null;
                this.activeFileIndex = -1;
                this.waveform.clear();
                this.updateUI();
            }
        } else if (this.activeFileIndex > index) {
            this.activeFileIndex--;
        }

        this.updateFileList();
    }

    setActiveBuffer(index) {
        this.activeFileIndex = index;
        this.currentBuffer = this.loadedFiles[index].buffer;
        this.originalBuffer = this.audioProcessor.cloneBuffer(this.currentBuffer);

        this.updateFileList();
        this.waveform.setBuffer(this.currentBuffer);
        this.selection = { start: 0, end: this.currentBuffer.duration };
        this.updateUI();
    }

    updateUI() {
        const totalTime = document.getElementById('totalTime');
        const selectionInfo = document.getElementById('selectionInfo');

        if (this.currentBuffer) {
            totalTime.textContent = this.formatTime(this.currentBuffer.duration);
            selectionInfo.textContent = `选区: ${this.formatTime(this.selection.start)} - ${this.formatTime(this.selection.end)}`;
        } else {
            totalTime.textContent = '0:00.000';
            selectionInfo.textContent = '';
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    togglePlay() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    play() {
        if (!this.currentBuffer) return;

        const startOffset = this.selection.start;
        const duration = this.selection.end - this.selection.start;

        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = this.currentBuffer;
        this.currentSource.loop = this.isLooping;

        // Build effects chain
        const destination = this.effectsManager.connectToChain(this.audioContext, this.currentSource);

        // Master gain
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = document.getElementById('volumeSlider').value / 100;
        destination.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.currentSource.start(0, startOffset, duration);
        this.isPlaying = true;

        this.currentSource.onended = () => {
            this.isPlaying = false;
            document.getElementById('playBtn').textContent = '▶ 播放';
            document.getElementById('playBtn').classList.remove('active');
        };

        document.getElementById('playBtn').textContent = '⏸ 暂停';
        document.getElementById('playBtn').classList.add('active');

        // Update current time display
        this.startTime = this.audioContext.currentTime - startOffset;
        this.updateTimeDisplay();
    }

    updateTimeDisplay() {
        if (!this.isPlaying) return;

        const currentTime = this.audioContext.currentTime - this.startTime;
        if (currentTime <= this.selection.end) {
            document.getElementById('currentTime').textContent = this.formatTime(currentTime);
            requestAnimationFrame(() => this.updateTimeDisplay());
        }
    }

    stop() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.currentSource = null;
        }

        this.isPlaying = false;
        document.getElementById('playBtn').textContent = '▶ 播放';
        document.getElementById('playBtn').classList.remove('active');
        document.getElementById('currentTime').textContent = this.formatTime(this.selection.start);
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        document.getElementById('loopBtn').classList.toggle('active', this.isLooping);
    }

    trimSelection() {
        if (!this.currentBuffer) return;

        const sampleRate = this.currentBuffer.sampleRate;
        const startSample = Math.floor(this.selection.start * sampleRate);
        const endSample = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.trim(this.currentBuffer, startSample, endSample);
        this.originalBuffer = this.audioProcessor.cloneBuffer(this.currentBuffer);

        this.waveform.setBuffer(this.currentBuffer);
        this.selection = { start: 0, end: this.currentBuffer.duration };
        this.updateUI();
    }

    deleteSelection() {
        if (!this.currentBuffer) return;

        const sampleRate = this.currentBuffer.sampleRate;
        const startSample = Math.floor(this.selection.start * sampleRate);
        const endSample = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.deleteRange(this.currentBuffer, startSample, endSample);
        this.originalBuffer = this.audioProcessor.cloneBuffer(this.currentBuffer);

        this.waveform.setBuffer(this.currentBuffer);
        this.selection = { start: 0, end: this.currentBuffer.duration };
        this.updateUI();
    }

    applyFadeIn() {
        if (!this.currentBuffer) return;

        const duration = parseFloat(document.getElementById('fadeDuration').value);
        const sampleRate = this.currentBuffer.sampleRate;
        const fadeSamples = Math.floor(duration * sampleRate);

        const selectionStart = Math.floor(this.selection.start * sampleRate);
        const selectionEnd = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.applyFadeIn(this.currentBuffer, selectionStart, selectionEnd, fadeSamples);
        this.waveform.setBuffer(this.currentBuffer);
    }

    applyFadeOut() {
        if (!this.currentBuffer) return;

        const duration = parseFloat(document.getElementById('fadeDuration').value);
        const sampleRate = this.currentBuffer.sampleRate;
        const fadeSamples = Math.floor(duration * sampleRate);

        const selectionStart = Math.floor(this.selection.start * sampleRate);
        const selectionEnd = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.applyFadeOut(this.currentBuffer, selectionStart, selectionEnd, fadeSamples);
        this.waveform.setBuffer(this.currentBuffer);
    }

    muteSelection() {
        if (!this.currentBuffer) return;

        const sampleRate = this.currentBuffer.sampleRate;
        const startSample = Math.floor(this.selection.start * sampleRate);
        const endSample = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.mute(this.currentBuffer, startSample, endSample);
        this.waveform.setBuffer(this.currentBuffer);
    }

    invertSelection() {
        if (!this.currentBuffer) return;

        const sampleRate = this.currentBuffer.sampleRate;
        const startSample = Math.floor(this.selection.start * sampleRate);
        const endSample = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.invert(this.currentBuffer, startSample, endSample);
        this.waveform.setBuffer(this.currentBuffer);
    }

    normalizeAudio() {
        if (!this.currentBuffer) return;

        const sampleRate = this.currentBuffer.sampleRate;
        const startSample = Math.floor(this.selection.start * sampleRate);
        const endSample = Math.floor(this.selection.end * sampleRate);

        this.currentBuffer = this.audioProcessor.normalize(this.currentBuffer, startSample, endSample);
        this.waveform.setBuffer(this.currentBuffer);
    }

    async generateSound() {
        const type = document.getElementById('generatorType').value;
        const duration = parseFloat(document.getElementById('genDuration').value);
        const volume = document.getElementById('genVolume').value / 100;
        const frequency = parseFloat(document.getElementById('genFrequency').value);
        const endFrequency = parseFloat(document.getElementById('genEndFreq').value);

        // ADSR parameters
        const adsr = {
            attack: parseFloat(document.getElementById('adsrAttack').value),
            decay: parseFloat(document.getElementById('adsrDecay').value),
            sustain: document.getElementById('adsrSustain').value / 100,
            release: parseFloat(document.getElementById('adsrRelease').value)
        };

        const buffer = await this.audioGenerator.generate(
            this.audioContext,
            type,
            duration,
            frequency,
            endFrequency,
            volume,
            adsr
        );

        this.loadedFiles.push({ name: `Generated ${type}`, buffer });
        this.setActiveBuffer(this.loadedFiles.length - 1);
    }

    async exportAudio() {
        if (!this.currentBuffer) {
            alert('没有可导出的音频');
            return;
        }

        const exportStatus = document.getElementById('exportStatus');
        const exportBtn = document.getElementById('exportBtn');

        try {
            exportStatus.textContent = '导出中...';
            exportBtn.disabled = true;

            // Render with effects if any are enabled
            let bufferToExport = this.currentBuffer;

            if (this.effectsManager.hasActiveEffects()) {
                bufferToExport = await this.effectsManager.renderOffline(this.currentBuffer);
            }

            const wavBlob = exportWAV(bufferToExport);

            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_${Date.now()}.wav`;
            a.click();

            URL.revokeObjectURL(url);
            exportStatus.textContent = '导出完成!';

            setTimeout(() => {
                exportStatus.textContent = '';
            }, 2000);
        } catch (error) {
            console.error('Export error:', error);
            exportStatus.textContent = '导出失败';
        } finally {
            exportBtn.disabled = false;
        }
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.audioEditor = new AudioEditor();
});
