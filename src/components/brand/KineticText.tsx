import { motion } from "motion/react"

import { STAGGER_STEP_SECONDS } from "@/lib/motion"
import { cn } from "@/lib/utils"

interface KineticTextProps {
  text: string
  className?: string
}

// Per-character stagger entrance, reusing the same step/duration/ease as
// every other stagger in the app (src/lib/motion.ts) rather than inventing
// a new rhythm just for this component.
export function KineticText({ text, className }: KineticTextProps) {
  return (
    <span className={cn("inline-block", className)} aria-label={text} role="text">
      {Array.from(text).map((character, index) => (
        <motion.span
          key={index}
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
          {character === " " ? " " : character}
        </motion.span>
      ))}
    </span>
  )
}
