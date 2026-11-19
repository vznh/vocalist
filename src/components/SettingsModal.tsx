import { useEffect, useState, type FormEvent } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import type { Dependency, Settings, Track } from '../types';
import { api, errorText, type Act } from '../api';
import { Modal } from './Modal';

export function SettingsModal({ close, checked, loadDemo, track, act }: { close: () => void; checked: (deps: Dependency[]) => void; loadDemo: () => Promise<void>; track: Track | null; act: Act }) {
  const [settings, setSettings] = useState<Settings | null>(null), [deps, setDeps] = useState<Dependency[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [section, setSection] = useState<"General" | "Audio tools">("General");
  useEffect(() => {
    api?.getSettings().then(setSettings).catch(error => setError(errorText(error)));
    api?.check().then(setDeps).catch(error => setError(errorText(error)));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!api || !settings) return;
    if (!settings.ytDlp.trim() || !settings.ffmpeg.trim() || (settings.transcriptionProvider === 'whisper' && !settings.whisper.trim())) {
      setSection('Audio tools');
      setError('Enter the missing audio tool paths.');
      return;
    }
    setBusy(true); setError('');
    try {
      setSettings(await api.saveSettings(settings));
      const results = await api.check(); setDeps(results); checked(results);
      setMessage(results.every(dep => dep.ok || dep.optional) ? 'Saved. Audio tools are ready.' : 'Saved. Some audio tools still need setup.');
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Modal title="Settings" close={close} className="settings-modal">
    <nav className="settings-nav" aria-label="Settings sections">
      {(['General', 'Audio tools'] as const).map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}
    </nav>
    {settings ? <form className="settings-form" onSubmit={save}>
      <div className="settings-content">
        <section hidden={section !== 'General'} aria-label="General">
          <h3>General</h3>
          {track && <div className="settings-row"><span>Cover</span><div className="cover-setting"><p>{track.artwork ? track.title : 'No cover for this song'}<small>Shown in the Rolling video and export.</small></p><button type="button" className="secondary" disabled={!track.audioUrl} onClick={() => void act(() => api!.chooseCover(track.id))}>{track.artwork ? 'Change cover' : 'Add cover'}</button></div></div>}
          <div className="settings-row"><span>Lyrics</span><p>LRCLIB<small>No API key required.</small></p></div>
          <div className="settings-row"><span>Song titles</span><p>Apple Intelligence<small>{deps.find(dep => dep.key === 'appleIntelligence')?.detail || 'Checking on-device model availability…'}</small></p></div>
          <label className="field"><span>Transcription</span><div><select aria-label="Transcription" value={settings.transcriptionProvider} onChange={event => setSettings({ ...settings, transcriptionProvider: event.target.value as Settings['transcriptionProvider'] })}><option value="elevenlabs">ElevenLabs Scribe v2 — English</option><option value="whisper">Local Whisper — English</option></select><small>Word alignment uses ElevenLabs after the independent transcription.</small></div></label>
          <label className="field"><span>Credentials file</span><div><div className="file-field"><input aria-label="Credentials file" value={settings.credentialsFile} onChange={event => setSettings({ ...settings, credentialsFile: event.target.value })} placeholder=".env.local" /><button type="button" onClick={async () => { try { const file = await api?.chooseCredentials(); if (file) setSettings({ ...settings, credentialsFile: file }); } catch (error) { setError(errorText(error)); } }}>Browse</button></div>{deps.find(dep => dep.key === 'elevenlabs' && !dep.ok) && <small>Choose a dotenv file containing ELEVENLABS_API_KEY.</small>}</div></label>
          {settings.transcriptionProvider === 'whisper' && <label className="field"><span>Whisper model</span><div className="file-field"><input aria-label="Whisper model" value={settings.model} onChange={event => setSettings({ ...settings, model: event.target.value })} placeholder="Path to a ggml .bin model" /><button type="button" className="secondary" onClick={async () => {
            try { const model = await api?.chooseModel(); if (model) setSettings({ ...settings, model }); } catch (error) { setError(errorText(error)); }
          }}>Browse</button></div></label>}
          <label className="field"><span>Song language</span><input value="English" readOnly /></label>
        </section>
        <section hidden={section !== 'Audio tools'} aria-label="Audio tools">
          <h3>Audio tools</h3>
          {(['ytDlp', 'ffmpeg', ...(settings.transcriptionProvider === 'whisper' ? ['whisper' as const] : [])] as const).map(key => <label className="field" key={key}><span>{key === 'ytDlp' ? 'yt-dlp' : key === 'whisper' ? 'Whisper CLI' : 'FFmpeg'}<small className={deps.find(dep => dep.key === key)?.ok ? 'dep-ok' : 'dep-missing'}>{deps.find(dep => dep.key === key)?.ok ? 'Available' : 'Missing'}</small></span><input value={settings[key]} onChange={event => setSettings({ ...settings, [key]: event.target.value })} /></label>)}
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="save-message" role="status">{message}</p>}
      <div className="settings-actions"><button type="button" className="text-button" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await loadDemo(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
      }}>Load demo</button><button className="primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}Save & check tools</button></div>
    </form> : <p className="settings-content" role={error ? "alert" : "status"}>{error || "Loading settings…"}</p>}
  </Modal>;
}
