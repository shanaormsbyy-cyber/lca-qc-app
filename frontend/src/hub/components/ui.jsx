import React, { useRef, useState } from 'react';
import { icons, X, UploadCloud } from 'lucide-react';
import { PieChart, Pie, Cell } from 'recharts';
import { initials, STAGES } from '../lib/format';

// Older lucide names → current names.
const ICON_ALIASES = {
  'alert-triangle': 'triangle-alert', 'bar-chart-3': 'chart-column', 'check-circle': 'circle-check',
  'check-square': 'square-check', 'pie-chart': 'chart-pie', 'play-circle': 'circle-play',
};

// Render a lucide icon by kebab-case name (e.g. "bed-double").
export function Icon({ name, size = 18, ...rest }) {
  const n = ICON_ALIASES[name] || name || 'circle';
  const pascal = String(n).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  const Cmp = icons[pascal] || icons.Circle;
  return <Cmp size={size} strokeWidth={1.8} {...rest} />;
}

export function StatTile({ icon, value, label, sub, tone = 'cyan', children }) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <div className="stat-tile-icon"><Icon name={icon} size={24} /></div>
      <div className="stat-tile-body">
        <div className="stat-tile-value">{value}</div>
        <div className="stat-tile-label">{label}</div>
        {sub && <div className="stat-tile-sub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ pct = 0, tone }) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const t = tone || (p >= 100 ? 'green' : 'cyan');
  return <div className="pbar"><div className={`pbar-fill ${t}`} style={{ width: `${p}%` }} /></div>;
}

export function ProgressCell({ pct = 0, tone, label }) {
  return (
    <div className="progress-cell">
      <ProgressBar pct={pct} tone={tone} />
      <span className="progress-cell-label">{label ?? `${Math.round(pct || 0)}%`}</span>
    </div>
  );
}

const STATUS = {
  competent: ['Competent', 'green'],
  in_progress: ['In Progress', 'cyan'],
  reassess: ['Reassess', 'amber'],
  overdue: ['Overdue', 'red'],
  ready: ['Ready for Sign-Off', 'green'],
  review_due: ['Review Due', 'amber'],
  signed_off: ['Signed Off', 'green'],
  completed: ['Completed', 'green'],
  starting_soon: ['Starting Soon', 'amber'],
  draft: ['Draft', 'amber'],
  active: ['In Training', 'cyan'],
  in_training: ['In Training', 'cyan'],
  archived: ['Archived', 'grey'],
  not_started: ['Not Started', 'grey'],
  introduced: ['Introduced', 'grey'],
  practicing: ['Practicing', 'amber'],
  today: ['Today', 'amber'],
  this_week: ['This Week', 'grey'],
};

export function StatusPill({ status, label }) {
  const [text, tone] = STATUS[status] || [label || status, 'grey'];
  return <span className={`pill pill-${tone}`}>{label || text}</span>;
}

export function TypeTag({ type, types }) {
  const t = types[type] || { label: type, tone: 'grey' };
  return <span className={`pill pill-${t.tone}`}>{t.label}</span>;
}

export function Avatar({ name, size = 32 }) {
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} title={name}>{initials(name)}</span>;
}

export function AvatarStack({ people = [], max = 3 }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map(p => <Avatar key={p.id} name={p.name} size={28} />)}
      {people.length > max && <span className="avatar avatar-more" style={{ width: 28, height: 28 }}>+{people.length - max}</span>}
    </span>
  );
}

const STAGE_ICONS = ['user-plus', 'clipboard-check', 'bed-double', 'users', 'award'];

export function JourneyStrip({ current = 0, compact = false, onSelect, selected }) {
  return (
    <div className={`journey${compact ? ' compact' : ''}${onSelect ? ' clickable' : ''}`}>
      {STAGES.map((s, i) => {
        const n = i + 1;
        const state = current > n ? 'done' : current === n ? 'current' : 'todo';
        return (
          <React.Fragment key={s}>
            <div className={`journey-step ${state}${selected === n ? ' selected' : ''}`} onClick={onSelect ? () => onSelect(n) : undefined}
              role={onSelect ? 'button' : undefined}>
              <div className="journey-num">{n}</div>
              {!compact && <Icon name={STAGE_ICONS[i]} size={20} className="journey-icon" />}
              <div className="journey-label">{s}</div>
            </div>
            {n < 5 && <div className="journey-arrow">›</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function Ring({ pct = 0, label, size = 170 }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const data = [{ v: p }, { v: 100 - p }];
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie data={data} dataKey="v" innerRadius={size * 0.36} outerRadius={size * 0.47} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
          <Cell fill="var(--cyan)" />
          <Cell fill="rgba(255,255,255,0.08)" />
        </Pie>
      </PieChart>
      <div className="ring-center">
        <div className="ring-value">{p}%</div>
        {label && <div className="ring-label">{label}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', text, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div>{text}</div>
      {action}
    </div>
  );
}

export function Panel({ title, icon, right, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="panel-head">
          <div className="panel-title">{icon && <Icon name={icon} size={18} />}{title}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function FileDrop({ onFiles, accept = 'image/*,video/*', maxMB = 50, multiple = true, label }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const take = (list) => {
    const files = Array.from(list || []);
    const big = files.find(f => f.size > maxMB * 1024 * 1024);
    if (big) { setError(`File too large (max ${maxMB}MB): ${big.name}`); return; }
    setError('');
    if (files.length) onFiles(files);
  };
  return (
    <div>
      <div className={`filedrop${drag ? ' drag' : ''}`}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}>
        <UploadCloud size={22} />
        <div>{label || 'Drag & drop files here or click to upload'}</div>
        <div className="text-muted text-sm">Max {maxMB}MB each</div>
        <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={e => { take(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="loading"><div className="spinner" /></div>;
}

export function PageTitle({ title, sub, children }) {
  return (
    <div className="page-title-row">
      <div>
        <h1 className="page-h1">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="page-title-actions">{children}</div>}
    </div>
  );
}
