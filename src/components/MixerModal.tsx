import type { Track } from '../types';
import { api, type Act } from '../api';
import type { useAudioMixer } from '../useAudioMixer';
import { Modal } from './Modal';
import { DEFAULT_SYNC } from '../../shared/karaoke.mjs';

export type Mix = { bass: number; treble: number; lyrics: number };
export const defaultMix: Mix = { bass: 0, treble: 0, lyrics: DEFAULT_SYNC };

const mixerControls = [
  { key: 'bass', label: 'Bass', min: -12, max: 12, step: 1, unit: 'dB' },
  { key: 'treble', label: 'Treble', min: -12, max: 12, step: 1, unit: 'dB' },
  { key: 'lyrics', label: 'Lyrics sync', min: -2, max: 2, step: .05, unit: 's' },
] as const;

type Props = {
  track: Track | null; mix: Mix; setMix: (update: (mix: Mix) => Mix) => void; voice: number; setVoice: (voice: number) => void;
  voiceState: ReturnType<typeof useAudioMixer>['voiceState']; enableMixer: () => Promise<unknown>; act: Act; close: () => void;
};

export function MixerModal({ track, mix, setMix, voice, setVoice, voiceState, enableMixer, act, close }: Props) {
  return <Modal title="Mixer" close={close} className="mixer-modal">
    {mixerControls.map(control => <label className="mixer-row" key={control.key}>
      <span>{control.label}</span>
      <input type="range" aria-label={control.label} min={control.min} max={control.max} step={control.step} value={mix[control.key]}
        onChange={event => {
          const value = Number(event.target.value);
          setMix(current => ({ ...current, [control.key]: value }));
          if (control.key !== 'lyrics') void act(enableMixer);
        }} />
      <span className="mixer-value">{mix[control.key] > 0 ? '+' : ''}{mix[control.key]} {control.unit}</span>
    </label>)}
    {track?.voiceMix === 'ready' ? <label className="mixer-row">
      <span>Voice level</span>
      <input type="range" aria-label="Voice level" min="0" max="100" step="1" value={voice} disabled={voiceState !== 'ready'}
        onChange={event => setVoice(Number(event.target.value))} />
      <span className="mixer-value">{voice}%</span>
    </label> : <div className="mixer-row">
      <span>Voice level</span>
      <button type="button" className="secondary" disabled={!track?.audioUrl || track.status === 'processing' || track.voiceMix === 'preparing'}
        onClick={() => track && void act(() => api!.prepareVoiceMix(track.id))}>
        {track?.voiceMix === 'preparing' ? 'Separating voices…' : track?.voiceMix === 'error' ? 'Retry voice separation' : 'Separate voices'}
      </button>
    </div>}
    {voiceState === 'error' && <p className="mixer-note" role="status">Voice tracks could not load. The original mix is playing.</p>}
    {track?.voiceMix === 'ready' && voiceState === 'loading' && <p className="mixer-note" role="status">Loading voice tracks…</p>}
    <button className="text-button mixer-reset" type="button" onClick={() => { setMix(() => defaultMix); setVoice(100); }}>Reset mixer</button>
  </Modal>;
}
