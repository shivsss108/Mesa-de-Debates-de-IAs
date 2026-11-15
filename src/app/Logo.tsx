import s from './Logo.module.css';

export type LogoBadge = 'AO VIVO' | 'REPRISE' | 'AO VIVO · DEMO';

export function Logo({ badge, size = 'sm' }: { badge?: LogoBadge; size?: 'sm' | 'lg' }) {
  return (
    <span className={`${s.logo} ${s[size]}`}>
      <span>MESA DE <span className={s.ias}>IAs</span></span>
      {badge && (
        <span className={s.badge}>
          <span className={s.dot} aria-hidden="true" />
          {badge}
        </span>
      )}
    </span>
  );
}
