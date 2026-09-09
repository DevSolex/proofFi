/**
 * frontend/src/components/ActivityLog.tsx
 *
 * §5.5 — Running log of the last 10 circuit calls.
 * This is the main value-add of the frontend — makes the smoke test
 * "watchable" rather than something you have to trust happened.
 */

import type { ActivityEntry } from '../types/index.js';

interface Props { entries: ActivityEntry[]; }

export function ActivityLog({ entries }: Props) {
  return (
    <section data-testid="activity-log" style={S.section}>
      <h2 style={S.h2}>Activity Log (last {entries.length} / 10 calls)</h2>
      {entries.length === 0 ? (
        <p style={{ fontSize:'12px', color:'#555' }}>No calls made yet.</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          {entries.map(e => (
            <div key={e.id} data-testid={`log-entry-${e.id}`} style={{
              ...S.entry,
              borderLeft: `3px solid ${e.status === 'success' ? '#2a5' : '#a44'}`,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
                <span style={{ fontFamily:'monospace', fontSize:'12px', color: e.status === 'success' ? '#4caf50' : '#f88' }}>
                  {e.status === 'success' ? '✅' : '❌'} {e.circuit}
                </span>
                <span style={{ fontSize:'10px', color:'#555' }}>{e.timestamp}</span>
              </div>
              <div style={{ fontFamily:'monospace', fontSize:'11px', color:'#888' }}>{e.result}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const S = {
  section: { padding:'16px' },
  h2:      { fontSize:'14px', fontWeight:'bold' as const, marginBottom:'12px', color:'#aaa', textTransform:'uppercase' as const, letterSpacing:'1px' },
  entry:   { background:'#111', padding:'8px 10px', borderRadius:'3px' },
};
