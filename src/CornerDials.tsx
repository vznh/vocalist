import { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';

const root = document.documentElement;
const defaults = getComputedStyle(root);
const radius = parseFloat(defaults.getPropertyValue('--corner-radius'));
const smoothing = parseFloat(defaults.getPropertyValue('--corner-smoothing'));

export default function CornerDials() {
  const corners = useDialKit('App corners', {
    'Radius (px)': [radius, 0, 20, 1],
    Smoothing: [smoothing, 1, 2.5, 0.1],
  });

  useEffect(() => {
    root.style.setProperty('--corner-radius', `${corners['Radius (px)']}px`);
    root.style.setProperty('--corner-smoothing', `${corners.Smoothing}`);
    return () => {
      root.style.removeProperty('--corner-radius');
      root.style.removeProperty('--corner-smoothing');
    };
  }, [corners]);

  return <DialRoot position="top-right" defaultOpen={false} productionEnabled />;
}
