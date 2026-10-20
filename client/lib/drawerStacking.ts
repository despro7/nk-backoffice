/** Z-index для вкладених HeroUI Drawer (wrapper). Рівень 0 — явний, інакше HeroUI default перекриває вкладені drawer. */
export const DRAWER_STACK_WRAPPER_Z = ['!z-[50]', '!z-[60]', '!z-[70]', '!z-[80]', '!z-[90]', '!z-[100]'] as const;

/** Z-index для backdrop (трохи нижче wrapper). */
export const DRAWER_STACK_BACKDROP_Z = ['!z-[45]', '!z-[55]', '!z-[65]', '!z-[75]', '!z-[85]', '!z-[95]'] as const;

export function drawerStackClassNames(stackLevel: number): { wrapper?: string; backdrop?: string } {
  const idx = Math.min(Math.max(0, stackLevel), DRAWER_STACK_WRAPPER_Z.length - 1);
  const wrapper = DRAWER_STACK_WRAPPER_Z[idx];
  const backdrop = DRAWER_STACK_BACKDROP_Z[idx];
  return {
    wrapper: wrapper || undefined,
    backdrop: backdrop || undefined,
  };
}

/** Batch picker / modal всередині drawer — z-index на рівень вище за wrapper батька. */
export function drawerChildOverlayClassName(parentStackLevel: number): string {
  const idx = Math.min(
    Math.max(0, parentStackLevel + 1),
    DRAWER_STACK_WRAPPER_Z.length - 1,
  );
  return DRAWER_STACK_WRAPPER_Z[idx];
}
