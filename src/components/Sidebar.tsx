import { Globe, Settings2 } from 'lucide-react';
import UpdateControl from '../UpdateControl';
import { api } from '../api';

const WEBSITE_URL = 'https://github.com/vznh/vocalist';

export function Sidebar({ trackCount, canStage, toggleStage, openSettings }: { trackCount: number; canStage: boolean; toggleStage: () => void; openSettings: () => void }) {
  return <aside className="sidebar" aria-label="Sidebar">
    <nav className="sidebar-nav" aria-label="Main">
      <button type="button" className="sidebar-item active" aria-current="page"><span>Queue</span><span className="sidebar-count">{trackCount}</span></button>
      <button type="button" className="sidebar-item" onClick={toggleStage} disabled={!canStage}><span>Stage</span></button>
    </nav>
    <div className="sidebar-spacer" />
    <div className="sidebar-footer">
      <button type="button" className="sidebar-icon" aria-label="Settings" title="Settings" onClick={openSettings} disabled={!api}><Settings2 size={16} /></button>
      <a className="sidebar-icon" href={WEBSITE_URL} target="_blank" rel="noreferrer" aria-label="Website" title="Website"><Globe size={16} /></a>
      <UpdateControl />
    </div>
  </aside>;
}
