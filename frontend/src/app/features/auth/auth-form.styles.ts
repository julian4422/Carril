export const AUTH_STYLES = `
  :host { display: grid; min-height: 100dvh; place-items: center; padding: 1.5rem; }
  .card { width: min(26rem, 100%); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; box-shadow: var(--shadow); }
  .brand { display: flex; align-items: center; gap: .5rem; color: var(--accent); font-weight: 800; font-size: 1.4rem; margin-bottom: 1rem; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .sub { margin: 0 0 1.25rem; color: var(--text-muted); }
  form { display: grid; gap: 1rem; }
  .alert { margin: 0; padding: .6rem .8rem; border-radius: var(--radius-sm); background: var(--overdue-bg); color: var(--overdue); border: 1px solid var(--danger); font-size: .9rem; }
  .alt { margin: 1.25rem 0 0; text-align: center; color: var(--text-muted); font-size: .95rem; }
  .alt a { color: var(--accent); font-weight: 600; }
`;
