"use client"

import { useId, useState } from "react"
import { motion, useAnimation } from "motion/react"
import { Particles, ParticlesProvider, useParticlesProvider } from "@tsparticles/react"
import type { Container, Engine } from "@tsparticles/engine"
import { loadSlim } from "@tsparticles/slim"

import { cn } from "@/lib/utils"

// tsParticles draws to a canvas, which needs a literal color string (not a
// CSS var() reference) — resolve the project's actual design tokens once on
// mount instead of hardcoding new hex values that would drift from index.css.
function resolveCssVar(name: string): string | null {
  if (typeof window === "undefined") return null
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || null
}

async function registerSlimEngine(engine: Engine) {
  await loadSlim(engine)
}

interface SparklesCoreProps {
  id?: string
  className?: string
  background?: string
  minSize?: number
  maxSize?: number
  speed?: number
  particleColor?: string
  particleDensity?: number
}

export function SparklesCore(props: SparklesCoreProps) {
  return (
    <ParticlesProvider init={registerSlimEngine}>
      <SparklesParticles {...props} />
    </ParticlesProvider>
  )
}

function SparklesParticles({
  id,
  className,
  background,
  minSize = 0.6,
  maxSize = 1.4,
  speed = 0.8,
  particleColor,
  particleDensity = 60,
}: SparklesCoreProps) {
  const generatedId = useId()
  const { loaded } = useParticlesProvider()
  // --primary is this app's one accent color (Ledger Dark's cobalt blue) —
  // reusing it here keeps the sparkles reading as "this app", not a
  // copy-pasted template's own palette. Resolved lazily on first render
  // (not in an effect) since it doesn't depend on anything React owns.
  const [resolvedColor] = useState(() => particleColor ?? resolveCssVar("--primary"))
  const controls = useAnimation()

  const ready = loaded && Boolean(resolvedColor)

  async function handleParticlesLoaded(container?: Container) {
    if (container) {
      await controls.start({ opacity: 1, transition: { duration: 1 } })
    }
  }

  return (
    <motion.div animate={controls} className={cn("opacity-0", className)}>
      {ready && (
        <Particles
          id={id ?? generatedId}
          className="h-full w-full"
          particlesLoaded={handleParticlesLoaded}
          options={{
            fullScreen: { enable: false },
            fpsLimit: 120,
            // Transparent canvas fill — the page's own bg-background shows
            // through underneath, so there's only one source of truth for
            // the background color instead of duplicating it into canvas.
            background: { color: { value: background ?? "transparent" } },
            interactivity: {
              events: {
                onClick: { enable: false },
                onHover: { enable: false },
                resize: true,
              },
            },
            particles: {
              color: { value: resolvedColor ?? undefined },
              move: {
                enable: true,
                direction: "none",
                random: true,
                straight: false,
                outModes: { default: "out" },
                speed: { min: 0.1, max: speed },
              },
              number: {
                value: particleDensity,
                density: { enable: true, width: 400, height: 400 },
              },
              opacity: {
                value: { min: 0.1, max: 0.8 },
                animation: {
                  enable: true,
                  speed: 1,
                  sync: false,
                  startValue: "random",
                },
              },
              shape: { type: "circle" },
              size: { value: { min: minSize, max: maxSize } },
            },
            detectRetina: true,
          }}
        />
      )}
    </motion.div>
  )
}
