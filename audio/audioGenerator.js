export class AudioGenerator {
    async generate(audioContext, type, duration, frequency, endFrequency, volume, adsr) {
        const sampleRate = audioContext.sampleRate;
        const numSamples = Math.floor(duration * sampleRate);

        const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
        const data = buffer.getChannelData(0);

        switch (type) {
            case 'silence':
                this.generateSilence(data, numSamples);
                break;
            case 'white':
                this.generateWhiteNoise(data, numSamples);
                break;
            case 'pink':
                this.generatePinkNoise(data, numSamples);
                break;
            case 'brown':
                this.generateBrownNoise(data, numSamples);
                break;
            case 'sine':
                this.generateOscillator(data, numSamples, sampleRate, frequency, 'sine');
                break;
            case 'square':
                this.generateOscillator(data, numSamples, sampleRate, frequency, 'square');
                break;
            case 'sawtooth':
                this.generateOscillator(data, numSamples, sampleRate, frequency, 'sawtooth');
                break;
            case 'triangle':
                this.generateOscillator(data, numSamples, sampleRate, frequency, 'triangle');
                break;
            case 'chirp':
                this.generateChirp(data, numSamples, sampleRate, frequency, endFrequency);
                break;
        }

        // Apply ADSR envelope if specified
        if (adsr && (adsr.attack > 0 || adsr.decay > 0 || adsr.sustain < 1 || adsr.release > 0)) {
            this.applyADSR(data, numSamples, sampleRate, adsr);
        }

        // Apply master volume
        for (let i = 0; i < numSamples; i++) {
            data[i] *= volume;
        }

        return buffer;
    }

    generateSilence(data, numSamples) {
        for (let i = 0; i < numSamples; i++) {
            data[i] = 0;
        }
    }

    generateWhiteNoise(data, numSamples) {
        for (let i = 0; i < numSamples; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    generatePinkNoise(data, numSamples) {
        // Pink noise using Paul Kellett's refined method
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        const pink = [0, 0, 0, 0, 0, 0, 0];

        for (let i = 0; i < numSamples; i++) {
            const white = Math.random() * 2 - 1;

            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;

            pink[0] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            pink[1] = pink[0] * 0.5362;
            pink[2] = pink[1] * 0.5362;
            pink[3] = pink[2] * 0.5362;
            pink[4] = pink[3] * 0.5362;
            pink[5] = pink[4] * 0.5362;
            pink[6] = pink[5] * 0.5362;

            b6 = white * 0.115926;
            data[i] = (pink[0] + pink[1] + pink[2] + pink[3] + pink[4] + pink[5] + pink[6]) * 0.11;
        }
    }

    generateBrownNoise(data, numSamples) {
        let lastValue = 0;
        const leak = 0.02;

        for (let i = 0; i < numSamples; i++) {
            const white = Math.random() * 2 - 1;
            const value = (lastValue + (0.02 * white)) / 1.02;
            lastValue = value;
            data[i] = value * 3.5; // Compensate for gain loss
        }
    }

    generateOscillator(data, numSamples, sampleRate, frequency, type) {
        const period = sampleRate / frequency;

        for (let i = 0; i < numSamples; i++) {
            const t = i / period;

            switch (type) {
                case 'sine':
                    data[i] = Math.sin(2 * Math.PI * t);
                    break;
                case 'square':
                    data[i] = Math.sin(2 * Math.PI * t) >= 0 ? 0.8 : -0.8;
                    break;
                case 'sawtooth':
                    data[i] = 2 * (t - Math.floor(t + 0.5));
                    break;
                case 'triangle':
                    data[i] = 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;
                    break;
            }
        }
    }

    generateChirp(data, numSamples, sampleRate, startFreq, endFreq) {
        const duration = numSamples / sampleRate;

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;

            // Exponential chirp
            const k = (endFreq / startFreq) ** (1 / duration);
            const phase = (startFreq * (k ** t - 1)) / (Math.log(k));

            data[i] = Math.sin(2 * Math.PI * phase);
        }
    }

    applyADSR(data, numSamples, sampleRate, adsr) {
        const attackSamples = Math.floor(adsr.attack * sampleRate);
        const decaySamples = Math.floor(adsr.decay * sampleRate);
        const sustainLevel = adsr.sustain;
        const releaseSamples = Math.floor(adsr.release * sampleRate);

        const sustainStart = attackSamples + decaySamples;
        const releaseStart = numSamples - releaseSamples;

        // If release is longer than the sound, adjust it
        const actualReleaseStart = Math.min(releaseStart, sustainStart);

        for (let i = 0; i < numSamples; i++) {
            let envelope = 1;

            if (i < attackSamples) {
                // Attack phase
                envelope = i / attackSamples;
            } else if (i < sustainStart) {
                // Decay phase
                const decayProgress = (i - attackSamples) / decaySamples;
                envelope = 1 - (1 - sustainLevel) * decayProgress;
            } else if (i < actualReleaseStart) {
                // Sustain phase
                envelope = sustainLevel;
            } else {
                // Release phase
                const releaseProgress = (i - actualReleaseStart) / releaseSamples;
                envelope = sustainLevel * (1 - releaseProgress);
            }

            data[i] *= envelope;
        }
    }
}
