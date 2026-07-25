import { useId } from "react"

import { cn } from "@/lib/utils"

interface LogoIconProps {
  className?: string
}

export function LogoIcon({ className }: LogoIconProps) {
  // Unique per instance (useId) since this is a shared component that could
  // render more than once in the same document — duplicate SVG gradient ids
  // are invalid HTML even when both instances are identical.
  const sheenId = useId()

  return (
    // SVG has no direct equivalent of CSS backdrop-filter, so the glass
    // treatment lives on this wrapping div (translucent bg + blur) instead
    // of on a <rect>. The base tile fill inside the SVG itself used to be
    // a fully opaque var(--popover) — that alone blocked anything behind
    // it regardless of any transparency/blur work done elsewhere, so it's
    // gone entirely now; only the sheen gradient remains inside the SVG.
    // rounded-[22.5%] mirrors the SVG's own rx="9" on a 40-unit viewBox
    // (9/40) so the div's corner radius matches the artwork at any size.
    <div
      className={cn(
        "relative overflow-hidden rounded-[22.5%] bg-popover/40 backdrop-blur-sm",
        className
      )}
    >
      <svg
        viewBox="0 0 40 40"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.18" />
            <stop offset="60%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="40" height="40" rx="9" fill={`url(#${sheenId})`} />
        <path
          d="M 25.5 12.5
             C 25.5 9 20 8.5 17.5 10.5
             C 14.5 12.8 16 16 19.5 17
             C 24 18.3 25.5 21.2 22.5 23.5
             C 19.5 25.8 15 25.3 14.5 22"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
