import { Fragment, useState } from "react"
import { motion } from "motion/react"

import { STAGGER_STEP_SECONDS } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface KineticTextProps {
  text: string
  className?: string
  /** "character" (default) for short text like a wordmark, "word" for longer
   * sentences — a full sentence staggered per-character at this app's
   * timing takes 2+ seconds and reads as sluggish rather than kinetic. */
  by?: "character" | "word"
}

// Per-character (or per-word) stagger entrance, reusing the same
// step/duration/ease as every other stagger in the app (src/lib/motion.ts)
// rather than inventing a new rhythm just for this component. Plays once on
// mount, then replays on hover by remounting the segments under a fresh key
// (motion has nothing left to animate from once initial/animate both
// resolve, so a plain key change is what makes it replayable).
export function KineticText({ text, className, by = "character" }: KineticTextProps) {
  const [playCount, setPlayCount] = useState(0)
  const segments = by === "word" ? text.split(" ") : Array.from(text)

  return (
    <span
      className={cn("inline-block", className)}
      aria-label={text}
      role="text"
      onMouseEnter={() => setPlayCount((count) => count + 1)}
    >
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
            {by === "character" && segment === " " ? " " : segment}
          </motion.span>
          {/* Word mode: the space between words is a plain sibling text
              node, not part of either word's inline-block, so it renders
              normally instead of being collapsed the same way. */}
          {by === "word" && index < segments.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  )
}
