import { useEffect, useRef, useState, type RefObject } from 'react';

type VoiceMix = { files: [HTMLAudioElement, HTMLAudioElement]; gains: [GainNode, GainNode] };
type MixerGraph = { dry: GainNode; mix: VoiceMix | null; context: AudioContext; low: BiquadFilterNode; high: BiquadFilterNode; limiter: DynamicsCompressorNode };

export function useAudioMixer(audio: RefObject<HTMLAudioElement | null>, bass: number, treble: number, voice: number, stemsUrl?: string) {
  const graph = useRef<MixerGraph | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const level = useRef(voice);
  useEffect(() => {
    level.current = voice;
    const current = graph.current;
    if (current?.mix) {
      const mix = current.mix;
      const active = voice < 100 && mix.files.every(file => !file.paused && file.readyState >= 3 && Math.abs(file.currentTime - (audio.current?.currentTime ?? 0)) < .12);
      mix.gains[0].gain.setTargetAtTime(active ? voice / 100 : 0, current.context.currentTime, .016);
      mix.gains[1].gain.setTargetAtTime(active ? 1 : 0, current.context.currentTime, .016);
      current.dry.gain.setTargetAtTime(active ? 0 : 1, current.context.currentTime, .016);
    }
  }, [audio, voice]);
  useEffect(() => {
    const current = graph.current, media = audio.current;
    if (!enabled || !current || !media || !stemsUrl) return;
    const { context, low, dry } = current;
    const abort = new AbortController();
    const files: VoiceMix['files'] = [new Audio(), new Audio()];
    const gains: VoiceMix['gains'] = [context.createGain(), context.createGain()];
    const inputs = files.map((file, index) => {
      file.crossOrigin = 'anonymous';
      file.preload = 'auto';
      gains[index].gain.value = 0;
      const input = context.createMediaElementSource(file);
      input.connect(gains[index]).connect(low);
      file.src = `${stemsUrl}/${index === 0 ? 'vocals' : 'instrumental'}`;
      return input;
    });
    current.mix = { files, gains };
    setVoiceState('loading');
    let failed = false;
    let resync = true;
    const setLevels = (active: boolean) => {
      const values = [active ? level.current / 100 : 0, active ? 1 : 0, active ? 0 : 1];
      [...gains, dry].forEach((node, index) => {
        if (Math.abs(node.gain.value - values[index]) > .001) node.gain.setTargetAtTime(values[index], context.currentTime, .016);
      });
    };
    const fail = () => { failed = true; setLevels(false); files.forEach(file => file.pause()); setVoiceState('error'); };
    const prepare = () => { if (!failed && files.every(file => file.readyState >= 2)) setVoiceState('ready'); };
    const sync = () => {
      if (failed || abort.signal.aborted) return;
      if (media.paused || media.ended || level.current === 100) {
        setLevels(false);
        files.forEach(file => file.pause());
        resync = true;
        return;
      }
      let active = !media.seeking && media.readyState >= 3;
      for (const file of files) {
        if (file.readyState < 2) { active = false; continue; }
        const offset = media.currentTime - file.currentTime;
        if (resync || Math.abs(offset) > .15) file.currentTime = media.currentTime;
        file.playbackRate = 1 + Math.max(-.04, Math.min(.04, offset * .4));
        if (file.paused && !file.ended) void file.play().catch(error => {
          if (!abort.signal.aborted && error.name !== 'AbortError') fail();
        });
        active &&= !file.paused && !file.seeking && !file.ended && file.readyState >= 3 && Math.abs(offset) < .12;
      }
      resync = false;
      setLevels(active);
    };
    for (const file of files) {
      file.addEventListener('canplay', prepare, { signal: abort.signal });
      file.addEventListener('error', fail, { signal: abort.signal });
    }
    for (const event of ['play', 'pause', 'ended', 'seeking', 'seeked']) media.addEventListener(event, sync, { signal: abort.signal });
    const clock = window.setInterval(sync, 50);
    return () => {
      abort.abort();
      window.clearInterval(clock);
      dry.gain.setValueAtTime(1, context.currentTime);
      for (const [index, file] of files.entries()) {
        inputs[index].disconnect(); gains[index].disconnect();
        file.pause(); file.removeAttribute('src'); file.load();
      }
      current.mix = null;
      setVoiceState('idle');
    };
  }, [audio, enabled, stemsUrl]);
  useEffect(() => {
    const current = graph.current;
    if (!current) return;
    current.low.gain.setTargetAtTime(bass, current.context.currentTime, .02);
    current.high.gain.setTargetAtTime(treble, current.context.currentTime, .02);
    current.limiter.threshold.setTargetAtTime(bass > 0 || treble > 0 ? -3 : 0, current.context.currentTime, .02);
  }, [bass, treble]);
  useEffect(() => () => {
    const current = graph.current;
    graph.current = null;
    if (current && current.context.state !== 'closed') void current.context.close();
  }, []);

  const enable = async () => {
    const media = audio.current;
    if (!media) return;
    if (!graph.current) {
      const context = new AudioContext();
      const low = context.createBiquadFilter(), high = context.createBiquadFilter();
      const dry = context.createGain();
      const limiter = context.createDynamicsCompressor();
      low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = bass;
      high.type = 'highshelf'; high.frequency.value = 4000; high.gain.value = treble;
      limiter.threshold.value = bass > 0 || treble > 0 ? -3 : 0; limiter.knee.value = 0; limiter.ratio.value = 12;
      try {
        const input = context.createMediaElementSource(media);
        input.connect(dry).connect(low).connect(high).connect(limiter).connect(context.destination);
        graph.current = { context, low, high, limiter, dry, mix: null };
      } catch (error) {
        await context.close();
        throw error;
      }
    }
    if (graph.current.context.state !== 'running') await graph.current.context.resume();
    setEnabled(true);
  };
  return { enable, voiceState };
}
