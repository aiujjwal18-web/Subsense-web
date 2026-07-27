import { memo, useCallback, useEffect, useRef } from "react"
import { animate } from "motion/react"

import { cn } from "@/lib/utils"

interface GlowingEffectProps {
  blur?: number
  inactiveZone?: number
  proximity?: number
  spread?: number
  glow?: boolean
  className?: string
  disabled?: boolean
  movementDuration?: number
  borderWidth?: number
}

// Mouse-tracking glow border, scoped under DEC-058 to Subscription Cards in
// the Critical/Upcoming renewal-urgency window only (see SubscriptionCard.tsx's
// call site) — a signal of urgency, not a decorative default for every card.
export const GlowingEffect = memo(
  ({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    glow = false,
    className,
    movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const lastPosition = useRef({ x: 0, y: 0 })
    const animationFrameRef = useRef<number>(0)

    const handleMove = useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current) return

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current
          if (!element) return

          const { left, top, width, height } = element.getBoundingClientRect()
          const mouseX = e?.x ?? lastPosition.current.x
          const mouseY = e?.y ?? lastPosition.current.y

          if (e) {
            lastPosition.current = { x: mouseX, y: mouseY }
          }

          const center = [left + width * 0.5, top + height * 0.5]
          const distanceFromCenter = Math.hypot(mouseX - center[0], mouseY - center[1])
          const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone

          if (distanceFromCenter < inactiveRadius) {
            element.style.setProperty("--active", "0.5")
            return
          }

          const isActive =
            mouseX > left - proximity &&
            mouseX < left + width + proximity &&
            mouseY > top - proximity &&
            mouseY < top + height + proximity

          // 0.5 is an ambient floor, not "off" — an urgent card should read as
          // glowing on render, proximity brightens it further to full (1),
          // never dims it to nothing.
          element.style.setProperty("--active", isActive ? "1" : "0.5")

          if (!isActive) return

          const currentAngle = parseFloat(element.style.getPropertyValue("--start")) || 0
          const targetAngle =
            (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90

          const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180
          const newAngle = currentAngle + angleDiff

          animate(currentAngle, newAngle, {
            duration: movementDuration,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (value) => {
              element.style.setProperty("--start", String(value))
            },
          })
        })
      },
      [inactiveZone, proximity, movementDuration]
    )

    useEffect(() => {
      if (disabled) return

      const handleScroll = () => handleMove()
      const handlePointerMove = (e: PointerEvent) => handleMove(e)

      window.addEventListener("scroll", handleScroll, { passive: true })
      document.body.addEventListener("pointermove", handlePointerMove, { passive: true })

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        window.removeEventListener("scroll", handleScroll)
        document.body.removeEventListener("pointermove", handlePointerMove)
      }
    }, [handleMove, disabled])

    return (
      <>
        <div
          className={cn(
            "pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity",
            glow && "opacity-100",
            disabled && "!block"
          )}
        />
        <div
          ref={containerRef}
          style={
            {
              "--blur": `${blur}px`,
              "--spread": spread,
              "--start": "0",
              "--active": "0.5",
              "--glowingeffect-border-width": `${borderWidth}px`,
              "--repeating-conic-gradient-times": "5",
              // Amber-only tonal ring — brand-consistent instead of the
              // reference's 4 unrelated decorative hex values (pink/gold/
              // green/blue), while keeping the same 4-stop conic structure.
              "--gradient": `radial-gradient(circle, #FFC800 10%, #FFC80000 20%),
                radial-gradient(circle at 40% 40%, #FFFFFF 5%, #FFFFFF00 15%),
                radial-gradient(circle at 60% 60%, #FFC800 10%, #FFC80000 20%),
                radial-gradient(circle at 40% 60%, #FFFFFF 10%, #FFFFFF00 20%),
                repeating-conic-gradient(
                  from 236.84deg at 50% 50%,
                  #FFC800 0%,
                  #FFFFFF calc(25% / var(--repeating-conic-gradient-times)),
                  #FFC800 calc(50% / var(--repeating-conic-gradient-times)),
                  #FFFFFF calc(75% / var(--repeating-conic-gradient-times)),
                  #FFC800 calc(100% / var(--repeating-conic-gradient-times))
                )`,
            } as React.CSSProperties
          }
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity",
            glow && "opacity-100",
            blur > 0 && "blur-[var(--blur)]",
            className,
            disabled && "!hidden"
          )}
        >
          <div
            className={cn(
              "rounded-[inherit]",
              'after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))] after:rounded-[inherit] after:content-[""]',
              "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
              "after:[background:var(--gradient)] after:[background-attachment:fixed]",
              "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
              "after:[mask-clip:padding-box,border-box]",
              "after:[mask-composite:intersect]",
              "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]"
            )}
          />
        </div>
      </>
    )
  }
)

GlowingEffect.displayName = "GlowingEffect"
