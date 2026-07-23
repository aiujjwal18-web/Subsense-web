// Shared entrance-stagger spec for capped list items, established in
// SubscriptionsListPage's subscription grid. Reused as-is everywhere else a
// capped list needs the same treatment, rather than each call site inventing
// its own timing values.
export const MAX_STAGGERED_ITEMS = 8
export const STAGGER_STEP_SECONDS = 0.06

export function staggerItemMotion(index: number) {
  return {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.4,
      ease: "easeOut" as const,
      delay: Math.min(index, MAX_STAGGERED_ITEMS - 1) * STAGGER_STEP_SECONDS,
    },
  }
}
