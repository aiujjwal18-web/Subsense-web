import { Fragment, useEffect, useRef, useState } from "react"
import { animate, motion } from "motion/react"

import { STAGGER_STEP_SECONDS } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface KineticTextProps {
  text: string
  className?: string
  /** "character" (default) for short text like a wordmark, "word" for longer
   * sentences — a full sentence staggered per-character at this app's
   * timing takes 2+ seconds and reads as sluggish rather than kinetic. */
  by?: "character" | "word"
  /** "stagger" (default): per-character/word fade-up entrance. "typewriter":
   * sequential reveal with a blinking cursor. */
  effect?: "stagger" | "typewriter"
  /** Typewriter only: seconds per character/word. Defaults to 0.05s. */
  speed?: number
  /** Typewriter only: seconds to wait before typing starts — e.g. to
   * sequence after a sibling KineticText's own typing finishes. */
  startDelay?: number
  /** Typewriter only: keep the cursor blinking after typing finishes,
   * instead of fading it out — for the last element in a typed sequence
   * (e.g. a tagline that hands off from a wordmark that typed first).
   * Defaults to false. */
  keepCursorAfter?: boolean
  /** Typewriter only: hide the cursor immediately on completion instead of
   * the default blink-twice-then-fade — for a non-final segment in a
   * multi-instance typed sequence (e.g. one half of a two-tone word),
   * where the fade window would otherwise overlap the next segment's own
   * active cursor and show two at once. Defaults to false. */
  hideCursorOnComplete?: boolean
}

// Reused by both effects: plays once on mount, replays on hover via
// remounting (motion has nothing left to animate from once a transition
// resolves, so a fresh key/effect run is what makes it replayable).
export function KineticText({
  text,
  className,
  by = "character",
  effect = "stagger",
  speed,
  startDelay = 0,
  keepCursorAfter = false,
  hideCursorOnComplete = false,
}: KineticTextProps) {
  const [playCount, setPlayCount] = useState(0)
  const lastTriggerRef = useRef(0)

  // Debounced: for the typewriter effect specifically, the cursor's own
  // blinking animation was observed to make the browser refire mouseenter
  // continuously (~every animation frame) on a genuinely stationary
  // pointer — without this guard, hovering restarted the typing dozens of
  // times a second instead of once. A plain timestamp gate is simpler and
  // more robust here than trying to chase the exact browser mechanism.
  function handleMouseEnter() {
    const now = performance.now()
    if (now - lastTriggerRef.current < 500) return
    lastTriggerRef.current = now
    setPlayCount((count) => count + 1)
  }

  return (
    <span
      className={cn("inline-block", className)}
      aria-label={text}
      role="text"
      onMouseEnter={handleMouseEnter}
    >
      {effect === "typewriter" ? (
        <TypewriterSegments
          key={playCount}
          text={text}
          by={by}
          speed={speed ?? 0.05}
          // startDelay only sequences the very first mount (e.g. behind a
          // sibling wordmark that types first) — a hover-triggered replay
          // should start immediately, not repeat that pause every time.
          startDelay={playCount === 0 ? startDelay : 0}
          keepCursorAfter={keepCursorAfter}
          hideCursorOnComplete={hideCursorOnComplete}
        />
      ) : (
        <StaggerSegments text={text} by={by} playCount={playCount} />
      )}
    </span>
  )
}

// Per-character (or per-word) stagger entrance, reusing the same
// step/duration/ease as every other stagger in the app (src/lib/motion.ts)
// rather than inventing a new rhythm just for this component.
function StaggerSegments({
  text,
  by,
  playCount,
}: {
  text: string
  by: "character" | "word"
  playCount: number
}) {
  const segments = by === "word" ? text.split(" ") : Array.from(text)

  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={`${playCount}-${index}`}>
          <motion.span
            aria-hidden="true"
            className="inline-block"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.4,
              ease: "easeOut",
              delay: index * STAGGER_STEP_SECONDS,
            }}
          >
            {/* A space that's the sole/trailing content of an inline-block
                gets collapsed away by the browser — nbsp sidesteps that. */}
            {by === "character" && segment === " " ? " " : segment}
          </motion.span>
          {/* Word mode: the space between words is a plain sibling text
              node, not part of either word's inline-block, so it renders
              normally instead of being collapsed the same way. */}
          {by === "word" && index < segments.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  )
}

const FADE_BLINK_DURATION_MS = 900
const FADE_BLINK_COUNT = 2

// Sequential reveal driven by motion/react's imperative animate() (a real
// Motion-owned timeline, not a hand-rolled setInterval) tied to a plain
// 0..totalSteps count, re-rendering the revealed substring on each tick —
// so the cursor sits at the actual current end of the typed text, not the
// full string's final position. The outer box itself stays a fixed size
// throughout (see the invisible sizer below), only the revealed content
// inside it grows.
function TypewriterSegments({
  text,
  by,
  speed,
  startDelay,
  keepCursorAfter,
  hideCursorOnComplete,
}: {
  text: string
  by: "character" | "word"
  speed: number
  startDelay: number
  keepCursorAfter: boolean
  hideCursorOnComplete: boolean
}) {
  const [revealedText, setRevealedText] = useState("")
  // "waiting": mounted but startDelay hasn't elapsed yet — no cursor shown.
  // Without this, every instance's cursor blinks from mount regardless of
  // startDelay, which is invisible for a single standalone instance but a
  // real bug for a sequenced multi-instance split (e.g. a two-tone word):
  // a later segment's idle cursor would already be visible, at its own
  // reserved position, while an earlier segment is still typing or the
  // whole thing is still waiting to start — two cursors on screen at once.
  const [cursorPhase, setCursorPhase] = useState<"waiting" | "typing" | "fading" | "hidden">(
    startDelay > 0 ? "waiting" : "typing"
  )

  useEffect(() => {
    const words = by === "word" ? text.split(" ") : null
    const totalSteps = words ? words.length : text.length

    const startTimeout =
      startDelay > 0 ? setTimeout(() => setCursorPhase("typing"), startDelay * 1000) : null

    const controls = animate(0, totalSteps, {
      duration: totalSteps * speed,
      delay: startDelay,
      ease: "linear",
      onUpdate: (value) => {
        const count = Math.floor(value)
        setRevealedText(words ? words.slice(0, count).join(" ") : text.slice(0, count))
      },
      // Only start fading the cursor out if this instance isn't meant to
      // keep it — e.g. the final element in a typed sequence (a tagline
      // handing off from a wordmark) stays on "typing", which already
      // renders the same infinite blink, so it just never fades.
      // hideCursorOnComplete skips the fade window entirely — for a
      // non-final segment in a multi-instance sequence, where the ~1.8s
      // fade would otherwise overlap the next segment's own active cursor.
      onComplete: () => {
        if (hideCursorOnComplete) {
          setCursorPhase("hidden")
        } else if (!keepCursorAfter) {
          setCursorPhase("fading")
        }
      },
    })

    return () => {
      controls.stop()
      if (startTimeout) clearTimeout(startTimeout)
    }
  }, [text, by, speed, startDelay, keepCursorAfter, hideCursorOnComplete])

  // Deterministic hide, rather than relying on onAnimationComplete firing
  // correctly across a mid-flight swap from an Infinite-repeat transition
  // to a finite one on the same motion.span — that handoff isn't
  // guaranteed to fire the callback the way a fresh animation would.
  useEffect(() => {
    if (cursorPhase !== "fading") return
    const timeout = setTimeout(() => setCursorPhase("hidden"), FADE_BLINK_COUNT * FADE_BLINK_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [cursorPhase])

  return (
    <span className="relative inline-block">
      {/* Invisible sizer reserving the full string's footprint up front, so
          the box doesn't grow as text reveals — a box that resizes under a
          stationary mouse pointer re-crosses the pointer's position as it
          grows, firing spurious extra mouseenter events mid-replay (this
          was a real, observed bug: hovering restarted typing repeatedly,
          visible as the revealed text length jumping backward). Reserving
          the final size up front, the way StaggerSegments' invisible
          placeholder characters already do, avoids that entirely. */}
      <span aria-hidden="true" className="invisible">
        {text}
      </span>
      {/* top-0/left-0/w-full (not inset-0) so this is sized naturally by
          its own content's height rather than stretched to fill the
          sizer's box. whitespace-nowrap matters more than it looks: w-full
          ties this span's width to the sizer's own natural (text-only, no
          cursor) width with zero pixels of slack, so the cursor — even at
          2px plus its margin — had nowhere left on that line and wrapped
          to a phantom second line every time (a real bug, caught by
          inspecting actual computed layout/bounding boxes rather than
          guessing from the screenshot alone). Forcing nowrap here lets the
          cursor sit flush after the text and overflow the reserved box by
          a few px instead, which is invisible in practice. */}
      <span className="absolute top-0 left-0 w-full whitespace-nowrap">
        <span aria-hidden="true">{revealedText}</span>
        {cursorPhase !== "hidden" && cursorPhase !== "waiting" && (
          <motion.span
            aria-hidden="true"
            className="ml-0.5 inline-block w-[2px] translate-y-[0.1em] bg-current align-middle"
            style={{ height: "0.9em" }}
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{
              duration: FADE_BLINK_DURATION_MS / 1000,
              repeat: cursorPhase === "typing" ? Infinity : FADE_BLINK_COUNT,
              ease: "linear",
              times: [0, 0.5, 0.5, 1],
            }}
          />
        )}
      </span>
    </span>
  )
}
