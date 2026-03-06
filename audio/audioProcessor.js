export class AudioProcessor {
    cloneBuffer(buffer) {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);
            destData.set(sourceData);
        }

        return newBuffer;
    }

    trim(buffer, startSample, endSample) {
        const numberOfChannels = buffer.numberOfChannels;
        const newLength = endSample - startSample;
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);

            for (let i = 0; i < newLength; i++) {
                destData[i] = sourceData[startSample + i];
            }
        }

        return newBuffer;
    }

    deleteRange(buffer, startSample, endSample) {
        const numberOfChannels = buffer.numberOfChannels;
        const originalLength = buffer.length;
        const deleteLength = endSample - startSample;
        const newLength = originalLength - deleteLength;
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);

            // Copy data before deletion
            for (let i = 0; i < startSample; i++) {
                destData[i] = sourceData[i];
            }

            // Copy data after deletion
            for (let i = endSample; i < originalLength; i++) {
                destData[i - deleteLength] = sourceData[i];
            }
        }

        return newBuffer;
    }

    applyFadeIn(buffer, startSample, endSample, fadeSamples) {
        const actualFadeSamples = Math.min(fadeSamples, endSample - startSample);
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = this.cloneBuffer(buffer);

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = newBuffer.getChannelData(channel);

            for (let i = 0; i < actualFadeSamples; i++) {
                const sampleIndex = startSample + i;
                if (sampleIndex < buffer.length) {
                    const gain = i / actualFadeSamples;
                    data[sampleIndex] *= gain;
                }
            }
        }

        return newBuffer;
    }

    applyFadeOut(buffer, startSample, endSample, fadeSamples) {
        const actualFadeSamples = Math.min(fadeSamples, endSample - startSample);
        const fadeStart = endSample - actualFadeSamples;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = this.cloneBuffer(buffer);

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = newBuffer.getChannelData(channel);

            for (let i = 0; i < actualFadeSamples; i++) {
                const sampleIndex = fadeStart + i;
                if (sampleIndex < buffer.length) {
                    const gain = 1 - (i / actualFadeSamples);
                    data[sampleIndex] *= gain;
                }
            }
        }

        return newBuffer;
    }

    mute(buffer, startSample, endSample) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = this.cloneBuffer(buffer);

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = newBuffer.getChannelData(channel);

            for (let i = startSample; i < endSample && i < buffer.length; i++) {
                data[i] = 0;
            }
        }

        return newBuffer;
    }

    invert(buffer, startSample, endSample) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = this.cloneBuffer(buffer);

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = newBuffer.getChannelData(channel);

            for (let i = startSample; i < endSample && i < buffer.length; i++) {
                data[i] = -data[i];
            }
        }

        return newBuffer;
    }

    normalize(buffer, startSample, endSample, targetLevel = 0.95) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = this.cloneBuffer(buffer);

        // Find peak amplitude in selection
        let peakAmplitude = 0;

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);

            for (let i = startSample; i < endSample && i < buffer.length; i++) {
                const absValue = Math.abs(data[i]);
                if (absValue > peakAmplitude) {
                    peakAmplitude = absValue;
                }
            }
        }

        // Avoid division by zero
        if (peakAmplitude < 0.0001) {
            return newBuffer;
        }

        const normalizationFactor = targetLevel / peakAmplitude;

        // Apply normalization to selection
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = newBuffer.getChannelData(channel);

            for (let i = startSample; i < endSample && i < buffer.length; i++) {
                data[i] *= normalizationFactor;
            }
        }

        return newBuffer;
    }

    changeVolume(buffer, volumeMultiplier) {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);

            for (let i = 0; i < length; i++) {
                destData[i] = sourceData[i] * volumeMultiplier;
            }
        }

        return newBuffer;
    }

    concatenate(buffers) {
        if (buffers.length === 0) return null;
        if (buffers.length === 1) return buffers[0];

        const numberOfChannels = buffers[0].numberOfChannels;
        const sampleRate = buffers[0].sampleRate;

        // Calculate total length
        let totalLength = 0;
        for (const buffer of buffers) {
            totalLength += buffer.length;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

        // Copy each buffer into the new one
        let offset = 0;
        for (const buffer of buffers) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sourceData = buffer.getChannelData(channel);
                const destData = newBuffer.getChannelData(channel);

                for (let i = 0; i < buffer.length; i++) {
                    destData[offset + i] = sourceData[i];
                }
            }
            offset += buffer.length;
        }

        return newBuffer;
    }

    mix(buffers, mixRatios = null) {
        if (buffers.length === 0) return null;

        const numberOfChannels = buffers[0].numberOfChannels;
        const sampleRate = buffers[0].sampleRate;
        const maxLength = Math.max(...buffers.map(b => b.length));

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, maxLength, sampleRate);

        // Initialize output buffer with zeros
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const destData = newBuffer.getChannelData(channel);
            for (let i = 0; i < maxLength; i++) {
                destData[i] = 0;
            }
        }

        // Mix all buffers
        for (let b = 0; b < buffers.length; b++) {
            const buffer = buffers[b];
            const ratio = mixRatios ? mixRatios[b] / 100 : 1 / buffers.length;

            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sourceData = buffer.getChannelData(channel);
                const destData = newBuffer.getChannelData(channel);

                for (let i = 0; i < buffer.length; i++) {
                    destData[i] += sourceData[i] * ratio;
                }
            }
        }

        // Clip to prevent distortion
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const destData = newBuffer.getChannelData(channel);
            for (let i = 0; i < maxLength; i++) {
                destData[i] = Math.max(-1, Math.min(1, destData[i]));
            }
        }

        return newBuffer;
    }

    reverse(buffer) {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);

            for (let i = 0; i < length; i++) {
                destData[i] = sourceData[length - 1 - i];
            }
        }

        return newBuffer;
    }

    changeSpeed(buffer, speedRatio) {
        const numberOfChannels = buffer.numberOfChannels;
        const originalLength = buffer.length;
        const newLength = Math.floor(originalLength / speedRatio);
        const sampleRate = buffer.sampleRate;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = buffer.getChannelData(channel);
            const destData = newBuffer.getChannelData(channel);

            for (let i = 0; i < newLength; i++) {
                const srcIndex = Math.floor(i * speedRatio);
                if (srcIndex < originalLength) {
                    destData[i] = sourceData[srcIndex];
                }
            }
        }

        return newBuffer;
    }
}
