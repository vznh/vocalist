import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, FolderOpen, LoaderCircle, X } from 'lucide-react';
import type { UpdateInfo, UpdateProgress } from './types';

const api = window.norae;

export default function UpdateControl() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!api) return;
    return api.onUpdateProgress(next => setProgress(next));
  }, []);

  // Quiet background check. A missing source folder is not an error worth showing.
  useEffect(() => {
    if (!api) return;
    let stopped = false;
    const look = async () => {
      try {
        const project = await api.updateGetSource();
        if (stopped) return;
        setSource(project);
        if (!project) { setInfo(null); return; }
        const next = await api.updateCheck();
        if (!stopped) setInfo(next);
      } catch {
        if (!stopped) setInfo(null);
      }
    };
    void look();
    const timer = window.setInterval(look, 6 * 60 * 60 * 1000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const check = async () => {
    if (!api) return;
    setBusy(true); setError(''); setProgress(null);
    try { setInfo(await api.updateCheck()); setSource(await api.updateGetSource()); }
    catch (failure) { setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    finally { setBusy(false); }
  };

  const choose = async () => {
    if (!api) return;
    setError('');
    try {
      const picked = await api.updateChooseSource();
      if (picked) { setSource(picked); setInfo(null); await check(); }
    } catch (failure) { setError((failure as Error).message); }
  };

  const install = async (mode: 'update' | 'rebuild') => {
    if (!api || !info) return;
    setBusy(true); setError('');
    try { await api.updateApply(mode); setProgress({ phase: 'installing', message: 'Restarting with the new version…' }); }
    catch (failure) {
      setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      setBusy(false);
    }
  };

  const available = Boolean(info && info.behind > 0);
  const installable = Boolean(info && source && info.behind > 0);
  const rebuildable = Boolean(info && source && info.dirty);
  return <>
    <button type="button" className="sidebar-icon sidebar-update" aria-haspopup="dialog" aria-label={available ? 'Update available' : 'Check for updates'}
      title={available ? `${info?.behind} new commit${info?.behind === 1 ? '' : 's'} ready to install` : 'Check for updates'}
      disabled={!api} onClick={() => { setOpen(true); void check(); }}>
      <ArrowDownToLine size={16} />
      {available && <span className="update-dot" aria-hidden="true" />}
    </button>
    {open && <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <div className="modal update-modal" role="dialog" aria-modal="true" aria-label="Update Music for the Masses">
        <div className="modal-heading"><h2>Update</h2>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={() => setOpen(false)}><X size={19} /></button>
        </div>
        <p className="update-line" role="status">
          {busy ? <><LoaderCircle size={15} className="spin" />{progress?.message || 'Checking for new versions…'}</>
            : !source ? 'This copy was built without a source folder.'
            : !info ? 'Ready to check.'
            : info.behind > 0 ? <>{info.behind} new commit{info.behind === 1 ? '' : 's'} on {info.branch}.</>
            : info.dirty ? 'You have local changes only.'
            : 'Up to date.'}
        </p>
        <div className="update-actions">
          {installable && <button type="button" className="primary" disabled={busy} onClick={() => void install('update')}><Check size={15} />Install</button>}
          {rebuildable && !installable && <button type="button" className="secondary" disabled={busy} onClick={() => void install('rebuild')}>Rebuild</button>}
          <button type="button" className="text-button" disabled={busy} onClick={() => void check()}>Check again</button>
        </div>
        {(error || progress?.phase === 'error') && <p className="form-error" role="alert">{error || progress?.message}</p>}
        <p className="update-source"><code>{source || 'No source folder'}</code>{source ? <button type="button" className="text-button" disabled={busy} onClick={() => void choose()}>Change</button> : <button type="button" className="text-button" disabled={busy} onClick={() => void choose()}><FolderOpen size={13} />Choose</button>}</p>
      </div>
    </div>}
  </>;
}
