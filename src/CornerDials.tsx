import { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';

const root = document.documentElement;

function readToken(name: string, fallback: number) {
  const value = parseFloat(getComputedStyle(root).getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default function CornerDials() {
  const corners = useDialKit('App corners', {
    'Radius (px)': [readToken('--corner-radius', 4), 1, 20, 1],
    Smoothing: [readToken('--corner-smoothing', 2.5), 1, 2.5, 0.1],
  });

  useEffect(() => {
    const radius = Number.isFinite(corners['Radius (px)']) && corners['Radius (px)'] > 0 ? corners['Radius (px)'] : 4;
    const smoothing = Number.isFinite(corners.Smoothing) && corners.Smoothing >= 1 ? corners.Smoothing : 2.5;
    root.style.setProperty('--corner-radius', `${radius}px`);
    root.style.setProperty('--corner-smoothing', `${smoothing}`);
    return () => {
      root.style.removeProperty('--corner-radius');
      root.style.removeProperty('--corner-smoothing');
    };
  }, [corners]);

  return <DialRoot position="top-right" defaultOpen={false} productionEnabled />;
}
