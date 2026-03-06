export function exportWAV(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const dataLength = audioBuffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // Write WAV header

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size
    view.setUint16(20, format, true); // Audio format (PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
    view.setUint16(32, blockAlign, true); // Block align
    view.setUint16(34, bitDepth, true); // Bits per sample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write audio data
    let offset = 44;

    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = audioBuffer.getChannelData(channel)[i];

            // Clamp and convert to 16-bit PCM
            const clampedSample = Math.max(-1, Math.min(1, sample));
            const intSample = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7FFF;

            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export function exportWAVWithSettings(audioBuffer, options = {}) {
    const {
        bitDepth = 16,
        normalize = true,
        addMetadata = false,
        title = '',
        artist = ''
    } = options;

    let bufferToExport = audioBuffer;

    // Normalize if requested
    if (normalize) {
        bufferToExport = normalizeAudioBuffer(audioBuffer);
    }

    // Export as WAV
    return exportWAV(bufferToExport);
}

function normalizeAudioBuffer(audioBuffer, targetLevel = 0.95) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    // Find peak amplitude
    let peakAmplitude = 0;

    for (let channel = 0; channel < numberOfChannels; channel++) {
        const data = audioBuffer.getChannelData(channel);

        for (let i = 0; i < length; i++) {
            const absValue = Math.abs(data[i]);
            if (absValue > peakAmplitude) {
                peakAmplitude = absValue;
            }
        }
    }

    // Avoid division by zero
    if (peakAmplitude < 0.0001) {
        return audioBuffer;
    }

    const normalizationFactor = targetLevel / peakAmplitude;

    // Create new normalized buffer
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const normalizedBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

    for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const destData = normalizedBuffer.getChannelData(channel);

        for (let i = 0; i < length; i++) {
            destData[i] = sourceData[i] * normalizationFactor;
        }
    }

    return normalizedBuffer;
}
