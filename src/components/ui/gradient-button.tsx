import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

interface GradientButtonProps extends HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  width?: string
  height?: string
  onClick?: () => void
  disabled?: boolean
}

// Candidate Primary button treatment per DEC-057 (05_Design_System_v1.23,
// Button States) — explicitly NOT adopted into the frozen standard, which
// stays a flat amber fill (see button.tsx's `default` variant). Kept as a
// standalone, working component rather than wired into any screen.
export function GradientButton({
  children,
  width = "300px",
  height = "60px",
  className,
  onClick,
  disabled = false,
  ...props
}: GradientButtonProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick?.()
    }
  }

  return (
    <div className="text-center">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "relative flex animate-rotating-gradient cursor-pointer items-center justify-center rounded-[50px]",
          "after:absolute after:inset-[5px] after:z-[1] after:rounded-[45px] after:bg-background after:transition-opacity after:duration-300 after:ease-linear after:content-['']",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        style={
          {
            "--r": "0deg",
            background: "conic-gradient(from var(--r), #FFC800, #FFFFFF, #FFC800)",
            minWidth: width,
            height,
          } as React.CSSProperties
        }
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        aria-disabled={disabled}
        {...props}
      >
        <span className="relative z-10 flex items-center justify-center text-foreground">
          {children}
        </span>
      </div>
    </div>
  )
}
