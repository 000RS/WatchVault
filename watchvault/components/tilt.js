'use client';

// Gentle 3D tilt that follows the pointer over a poster.
export const tilt = {
  onPointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    e.currentTarget.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  },
  onPointerLeave(e) {
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--rx', '0deg');
  },
};
