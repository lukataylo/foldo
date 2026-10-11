import type { CSSProperties } from 'react';

/*
 * Project card thumbnail (Home and Projects boards): a little paper wireframe of the app on a Wash ground.
 * We store no screenshots, so the sketch follows the template the project started from; projects from a prompt get the
 * generic "score" sketch. Purely decorative (aria-hidden).
 */
type Kind = 'scam' | 'budget' | 'transfers' | 'carbon' | 'list' | 'score';

const KIND: Record<string, Kind> = {
  'fraud-scam-check': 'scam',
  'fraud-ops-console': 'carbon',
  'blank-carbon': 'carbon',
  'access-budget': 'budget',
  'access-loan': 'score',
  'payments-transfer': 'transfers',
  'payments-checkout': 'list',
  'blank-finance': 'list',
};

const bar = (width: string, height: number, background: string, extra: CSSProperties = {}): CSSProperties => ({
  width,
  height,
  borderRadius: 2,
  background,
  ...extra,
});

const PAGE: CSSProperties = {
  flex: 1,
  background: '#FFFFFF',
  border: '1px solid #E4DDCF',
  borderBottom: 0,
  borderRadius: '6px 6px 0 0',
  padding: '12px 14px',
};

const titleRow = (color: string, width: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
    <div style={bar(width, 7, '#CFC6B4')} />
  </div>
);

const columns = (heights: number[], on: number, onColor: string, offColor: string) =>
  heights.map((h, i) => (
    <div key={i} style={{ flex: 1, height: `${h}%`, background: i === on ? onColor : offColor, borderRadius: '2px 2px 0 0' }} />
  ));

function Scam() {
  return (
    <div style={{ ...PAGE, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {titleRow('#2B5C9E', '34%')}
      <div style={{ border: '1px solid #E4DDCF', borderRadius: 4, padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={bar('90%', 5, '#EFEAE0')} />
        <div style={bar('62%', 5, '#F0C9C4')} />
        <div style={bar('75%', 5, '#EFEAE0')} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 46, height: 14, borderRadius: 999, background: '#FBEFED', border: '1px solid #F0C9C4' }} />
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#EFEAE0', overflow: 'hidden' }}>
          <div style={{ width: '78%', height: '100%', background: '#B42318' }} />
        </div>
      </div>
    </div>
  );
}

function Budget({ donut }: { donut: number }) {
  const stat = (w: string, color: string) => (
    <div style={{ border: '1px solid #E4DDCF', borderRadius: 4, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ width: '50%', height: 4, background: '#EFEAE0' }} />
      <div style={bar(w, 8, color)} />
    </div>
  );

  return (
    <div style={{ ...PAGE, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto 1fr', gap: 8 }}>
      <div style={{ gridColumn: '1/-1' }}>{titleRow('#2F6F5E', '30%')}</div>
      {stat('70%', '#16140F')}
      {stat('55%', '#2F6F5E')}
      {stat('62%', '#16140F')}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: donut,
            height: donut,
            borderRadius: '50%',
            background: 'radial-gradient(circle,#FFFFFF 0 50%,transparent 51%),conic-gradient(#2F6F5E 0 46%,#8FC1AE 46% 72%,#E4DDCF 72% 100%)',
          }}
        />
      </div>
      <div style={{ gridColumn: '2/4', display: 'flex', alignItems: 'flex-end', gap: 5, paddingBottom: 4 }}>
        {columns([30, 55, 40, 72, 50], 3, '#2F6F5E', '#CFE3DA')}
      </div>
    </div>
  );
}

function Transfers({ field }: { field: number }) {
  const row = (w: string, code: string) => (
    <div
      style={{
        height: field,
        border: '1px solid #E4DDCF',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
      }}
    >
      <div style={bar(w, 6, '#16140F')} />
      <div style={{ font: "500 8px 'JetBrains Mono',monospace", color: '#3A362E' }}>{code}</div>
    </div>
  );

  return (
    <div style={{ ...PAGE, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {titleRow('#3B5BDB', '50%')}
        {row('40%', 'GBP')}
        {row('58%', 'NGN')}
        <div style={{ height: 16, width: '60%', borderRadius: 4, background: '#3B5BDB' }} />
      </div>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 6, paddingBottom: 6, borderLeft: '1px solid #EFEAE0', paddingLeft: 10 }}
      >
        {columns([82, 58, 46, 38], 0, '#3B5BDB', '#D7DEF5')}
      </div>
    </div>
  );
}

function Carbon() {
  const line = (dot: string, w: string, w2: string, last = false) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 12, borderBottom: last ? 0 : '1px solid #393939' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
      <div style={{ width: w, height: 4, background: '#525252' }} />
      <div style={{ marginLeft: 'auto', width: w2, height: 4, background: '#525252' }} />
    </div>
  );

  return (
    <div
      style={{
        ...PAGE,
        background: '#161616',
        border: '1px solid #393939',
        borderBottom: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 20, background: '#262626', borderBottom: '1px solid #393939', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
        <div style={{ width: '26%', height: 5, background: '#6F6F6F' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, padding: '8px 10px' }}>
        {['#0F62FE', '#DA1E28', '#24A148'].map((c) => (
          <div key={c} style={{ height: 24, background: '#262626', borderTop: `2px solid ${c}` }} />
        ))}
      </div>
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {line('#DA1E28', '40%', '16%')}
        {line('#24A148', '52%', '12%')}
        {line('#FF832B', '34%', '18%')}
        {line('#24A148', '46%', '14%', true)}
      </div>
    </div>
  );
}

function List() {
  const row = (color: string, w: string, last = false) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 22, borderBottom: last ? 0 : '1px solid #EFEAE0' }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: color }} />
      <div style={bar(w, 5, '#CFC6B4')} />
      <div style={bar('16%', 6, '#16140F', { marginLeft: 'auto' })} />
    </div>
  );

  return (
    <div style={{ ...PAGE, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={bar('36%', 7, '#CFC6B4')} />
        <div style={{ width: 54, height: 14, borderRadius: 4, background: '#16140F' }} />
      </div>
      {row('#C46A4E', '28%')}
      {row('#5B7FA6', '22%')}
      {row('#7A9A5B', '32%', true)}
    </div>
  );
}

function Score() {
  return (
    <div style={{ ...PAGE, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'start' }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'radial-gradient(circle,#FFFFFF 0 62%,transparent 63%),conic-gradient(#6A4FB3 0 71%,#EFEAE0 71% 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 26, height: 8, borderRadius: 2, background: '#16140F' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
        <div style={bar('60%', 7, '#CFC6B4')} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['#6A4FB3', '#6A4FB3', '#6A4FB3', '#E4DDCF', '#6A4FB3'].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={bar('88%', 5, '#EFEAE0')} />
        <div style={bar('70%', 5, '#EFEAE0')} />
      </div>
    </div>
  );
}

// height: 168 on Home, 176 on Projects
export function ProjectThumb({ template, height }: { template: string | null; height: number }) {
  const kind = (template && KIND[template]) || 'score';
  const roomy = height > 170;

  return (
    <div
      aria-hidden="true"
      className="flex border-b border-rule bg-wash px-[22px] pt-[18px]"
      style={{ height }}
    >
      {kind === 'scam' && <Scam />}
      {kind === 'budget' && <Budget donut={roomy ? 56 : 52} />}
      {kind === 'transfers' && <Transfers field={roomy ? 24 : 22} />}
      {kind === 'carbon' && <Carbon />}
      {kind === 'list' && <List />}
      {kind === 'score' && <Score />}
    </div>
  );
}
