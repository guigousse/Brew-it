/**
 * Molette de réglage façon potentiomètre : on la « tourne » en glissant le doigt
 * (vers le haut ou vers la droite pour augmenter). Des boutons − / + permettent un réglage fin.
 */
export interface KnobOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  disabled?: boolean;
  onChange?: (v: number) => void;
}

const ANGLE = 135; // course de −135° à +135°
const PIXELS_FOR_FULL_RANGE = 220;

export function createKnob(o: KnobOptions): HTMLElement {
  let value = o.value;
  const root = document.createElement('div');
  root.className = `knob${o.disabled ? ' disabled' : ''}`;
  const label = document.createElement('div');
  label.className = 'knob-label';
  label.textContent = o.label;
  const dial = document.createElement('div');
  dial.className = 'knob-dial';
  dial.setAttribute('role', 'slider');
  dial.setAttribute('aria-label', o.label);
  dial.setAttribute('aria-valuemin', String(o.min));
  dial.setAttribute('aria-valuemax', String(o.max));
  dial.tabIndex = o.disabled ? -1 : 0;
  const pointer = document.createElement('div');
  pointer.className = 'knob-pointer';
  const ticks = document.createElement('div');
  ticks.className = 'knob-ticks';
  dial.append(ticks, pointer);
  const readout = document.createElement('div');
  readout.className = 'knob-value';
  const row = document.createElement('div');
  row.className = 'knob-steps';
  const minus = document.createElement('button');
  minus.className = 'knob-btn';
  minus.textContent = '−';
  const plus = document.createElement('button');
  plus.className = 'knob-btn';
  plus.textContent = '+';
  row.append(minus, readout, plus);
  root.append(label, dial, row);

  const decimals = (o.step.toString().split('.')[1] ?? '').length;
  const render = () => {
    const t = (value - o.min) / (o.max - o.min);
    pointer.style.transform = `rotate(${-ANGLE + t * ANGLE * 2}deg)`;
    dial.style.setProperty('--fill', `${t * 270}deg`);
    readout.textContent = `${value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${o.unit}`;
    dial.setAttribute('aria-valuenow', String(value));
  };
  const set = (v: number) => {
    const snapped = Math.round(v / o.step) * o.step;
    const next = Math.min(o.max, Math.max(o.min, Number(snapped.toFixed(decimals))));
    if (next === value) return;
    value = next;
    render();
    o.onChange?.(value);
  };

  if (!o.disabled) {
    let start: { x: number; y: number; v: number } | null = null;
    dial.addEventListener('pointerdown', (e) => {
      dial.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, v: value };
      dial.classList.add('active');
    });
    dial.addEventListener('pointermove', (e) => {
      if (!start) return;
      const delta = (start.y - e.clientY + (e.clientX - start.x)) / PIXELS_FOR_FULL_RANGE;
      set(start.v + delta * (o.max - o.min));
    });
    const end = () => {
      start = null;
      dial.classList.remove('active');
    };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + o.step);
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - o.step);
    });
    minus.onclick = () => set(value - o.step);
    plus.onclick = () => set(value + o.step);
  } else {
    minus.disabled = true;
    plus.disabled = true;
  }
  render();
  return root;
}
