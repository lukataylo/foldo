// Top-bar right slot. Renders every `topBarRight` contribution inline
// in declaration order. App.tsx mounts this next to the existing
// hardcoded top-bar buttons so plugins can add presence indicators,
// share buttons, etc. without forking TopBar.tsx.

import { usePluginSurfaces } from '../registry';

export function TopBarRightSlot(): JSX.Element | null {
  const surfaces = usePluginSurfaces('topBarRight');
  if (surfaces.length === 0) return null;
  return (
    <div
      data-testid="foldo-plugin-topbar-right"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {surfaces.map((s) => (
        <span key={s.item.id} data-testid={`foldo-plugin-topbar-${s.item.id}`}>
          {s.item.render()}
        </span>
      ))}
    </div>
  );
}
