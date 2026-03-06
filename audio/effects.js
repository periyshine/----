export class EffectsManager {
    constructor() {
        this.effectNodes = {};
        this.enabledEffects = new Set();
    }

    connectToChain(audioContext, source) {
        let currentNode = source;
        this.effectNodes.source = source;

        // Create gain node for pre-effects
        if (!this.effectNodes.preGain) {
            this.effectNodes.preGain = audioContext.createGain();
        }
        currentNode.connect(this.effectNodes.preGain);
        currentNode = this.effectNodes.preGain;

        // EQ - always connect through filters
        if (this.effectNodes.eqFilters) {
            this.enabledEffects.add('eq');
            for (const filter of this.effectNodes.eqFilters) {
                currentNode.connect(filter);
                currentNode = filter;
            }
        }

        // Compressor
        if (this.enabledEffects.has('compressor') && this.effectNodes.compressor) {
            currentNode.connect(this.effectNodes.compressor);
            currentNode = this.effectNodes.compressor;
        }

        // Distortion
        if (this.enabledEffects.has('distortion') && this.effectNodes.distortion) {
            currentNode.connect(this.effectNodes.distortion);
            currentNode = this.effectNodes.distortion;
        }

        // Delay
        if (this.enabledEffects.has('delay') && this.effectNodes.delayChain) {
            const { dryGain, wetGain, delay } = this.effectNodes.delayChain;

            // Create a merger node
            if (!this.effectNodes.delayMerger) {
                this.effectNodes.delayMerger = audioContext.createGain();
            }

            currentNode.connect(dryGain);
            currentNode.connect(delay);

            dryGain.connect(this.effectNodes.delayMerger);
            wetGain.connect(this.effectNodes.delayMerger);

            currentNode = this.effectNodes.delayMerger;
        }

        // Reverb
        if (this.enabledEffects.has('reverb') && this.effectNodes.reverbChain) {
            const { convolver, dryGain, wetGain } = this.effectNodes.reverbChain;

            if (!this.effectNodes.reverbMerger) {
                this.effectNodes.reverbMerger = audioContext.createGain();
            }

            currentNode.connect(dryGain);
            currentNode.connect(convolver);

            dryGain.connect(this.effectNodes.reverbMerger);
            wetGain.connect(this.effectNodes.reverbMerger);

            currentNode = this.effectNodes.reverbMerger;
        }

        // Create output node if it doesn't exist
        if (!this.effectNodes.output) {
            this.effectNodes.output = audioContext.createGain();
            this.effectNodes.output.gain.value = 1;
        }

        // Connect to output if not already connected
        if (currentNode !== this.effectNodes.output) {
            currentNode.connect(this.effectNodes.output);
        }

        return this.effectNodes.output;
    }

    updateEQ(freq, gain) {
        if (!this.effectNodes.eqFilters) {
            this.enabledEffects.add('eq');
        }
        // This will be called from main app to create filters
    }

    createEQFilters(audioContext) {
        if (this.effectNodes.eqFilters) return this.effectNodes.eqFilters;

        const frequencies = [100, 400, 1000, 2500, 8000];
        this.effectNodes.eqFilters = frequencies.map(freq => {
            const filter = audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            return filter;
        });

        return this.effectNodes.eqFilters;
    }

    setEQGain(index, gain) {
        if (this.effectNodes.eqFilters && this.effectNodes.eqFilters[index]) {
            this.effectNodes.eqFilters[index].gain.value = gain;
        }
    }

    enableReverb() {
        this.enabledEffects.add('reverb');
    }

    disableReverb() {
        this.enabledEffects.delete('reverb');
    }

    createReverb(audioContext, size = 0.5, decay = 0.5) {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * (2 + size * 3);
        const impulse = audioContext.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const n = i / length;
                // Exponential decay
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - n, 2 + decay * 3);
            }
        }

        const convolver = audioContext.createConvolver();
        convolver.buffer = impulse;

        const dryGain = audioContext.createGain();
        dryGain.gain.value = 1 - size * 0.5;

        const wetGain = audioContext.createGain();
        wetGain.gain.value = size * 0.5;

        this.effectNodes.reverbChain = { convolver, dryGain, wetGain };
    }

    updateReverb(size) {
        if (!this.effectNodes.reverbChain) return;
        this.effectNodes.reverbChain.dryGain.gain.value = 1 - size * 0.5;
        this.effectNodes.reverbChain.wetGain.gain.value = size * 0.5;
    }

    updateReverbDecay(decay) {
        // Recreate impulse response with new decay
        // This would need access to audioContext
    }

    enableDelay() {
        this.enabledEffects.add('delay');
    }

    disableDelay() {
        this.enabledEffects.delete('delay');
    }

    createDelay(audioContext, time = 0.3, feedback = 0.3, mix = 0.3) {
        const delay = audioContext.createDelay(2);
        delay.delayTime.value = time;

        const feedbackGain = audioContext.createGain();
        feedbackGain.gain.value = feedback;

        const wetGain = audioContext.createGain();
        wetGain.gain.value = mix;

        const dryGain = audioContext.createGain();
        dryGain.gain.value = 1 - mix;

        // Connect feedback loop
        delay.connect(feedbackGain);
        feedbackGain.connect(delay);

        this.effectNodes.delayChain = { delay, dryGain, wetGain, feedbackGain };
    }

    updateDelayTime(time) {
        if (!this.effectNodes.delayChain) return;
        this.effectNodes.delayChain.delay.delayTime.value = time;
    }

    updateDelayFeedback(feedback) {
        if (!this.effectNodes.delayChain) return;
        this.effectNodes.delayChain.feedbackGain.gain.value = feedback;
    }

    updateDelayMix(mix) {
        if (!this.effectNodes.delayChain) return;
        this.effectNodes.delayChain.wetGain.gain.value = mix;
        this.effectNodes.delayChain.dryGain.gain.value = 1 - mix;
    }

    enableCompressor() {
        this.enabledEffects.add('compressor');
    }

    disableCompressor() {
        this.enabledEffects.delete('compressor');
    }

    createCompressor(audioContext, threshold = -24, ratio = 4) {
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = threshold;
        compressor.knee.value = 30;
        compressor.ratio.value = ratio;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        this.effectNodes.compressor = compressor;
    }

    updateCompressorThreshold(threshold) {
        if (!this.effectNodes.compressor) return;
        this.effectNodes.compressor.threshold.value = threshold;
    }

    updateCompressorRatio(ratio) {
        if (!this.effectNodes.compressor) return;
        this.effectNodes.compressor.ratio.value = ratio;
    }

    enableDistortion() {
        this.enabledEffects.add('distortion');
    }

    disableDistortion() {
        this.enabledEffects.delete('distortion');
    }

    createDistortion(audioContext, amount = 0.5) {
        const curve = new Float32Array(44100);
        const deg = Math.PI / 180;

        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }

        const shaper = audioContext.createWaveShaper();
        shaper.curve = curve;
        shaper.oversample = '4x';

        this.effectNodes.distortion = shaper;
    }

    updateDistortion(amount) {
        // Would need to recreate curve
        // Store amount for next creation
    }

    hasActiveEffects() {
        return this.enabledEffects.size > 0;
    }

    async renderOffline(inputBuffer) {
        const numberOfChannels = inputBuffer.numberOfChannels;
        const length = inputBuffer.length;
        const sampleRate = inputBuffer.sampleRate;

        const offlineContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);

        // Recreate all effects in offline context
        const source = offlineContext.createBufferSource();
        source.buffer = inputBuffer;

        if (this.enabledEffects.has('eq')) {
            this.createEQFilters(offlineContext);
        }
        if (this.enabledEffects.has('reverb') && this.effectNodes.reverbChain) {
            const size = this.effectNodes.reverbChain.wetGain.gain.value * 2;
            this.createReverb(offlineContext, size);
        }
        if (this.enabledEffects.has('delay') && this.effectNodes.delayChain) {
            const time = this.effectNodes.delayChain.delay.delayTime.value;
            const feedback = this.effectNodes.delayChain.feedbackGain.gain.value;
            const mix = this.effectNodes.delayChain.wetGain.gain.value;
            this.createDelay(offlineContext, time, feedback, mix);
        }
        if (this.enabledEffects.has('compressor') && this.effectNodes.compressor) {
            const threshold = this.effectNodes.compressor.threshold.value;
            const ratio = this.effectNodes.compressor.ratio.value;
            this.createCompressor(offlineContext, threshold, ratio);
        }
        if (this.enabledEffects.has('distortion') && this.effectNodes.distortion) {
            this.createDistortion(offlineContext, 0.5);
        }

        const destination = this.connectToChain(offlineContext, source);
        destination.connect(offlineContext.destination);

        source.start(0);

        const renderedBuffer = await offlineContext.startRendering();
        return renderedBuffer;
    }
}
