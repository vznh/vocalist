import { useState, type FormEvent } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { api, errorText } from '../api';

export function QueueInput({ added }: { added: (id: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!api) return;
    setBusy(true); setError('');
    try {
      added(await api.add({ url }));
      setUrl('');
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <form className="queue-input" onSubmit={submit}>
    <div className="url-row">
      <input aria-label="Song URL" required type="url" placeholder="Paste a YouTube or SoundCloud link" value={url}
        onChange={event => { setUrl(event.target.value); setError(''); }} maxLength={2048} disabled={!api} />
      <button className="primary" disabled={!api || busy || !url.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}Add to queue</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
