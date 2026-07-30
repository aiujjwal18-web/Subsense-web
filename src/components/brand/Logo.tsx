import { LogoIcon } from "./LogoIcon"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoIcon className="size-9 shrink-0" />
      <span className="font-display text-lg font-semibold">
        <span className="text-primary">Sub</span>
        <span className="bg-[linear-gradient(45deg,var(--primary),var(--secondary-accent))] bg-clip-text text-transparent">
          Sense
        </span>
      </span>
    </div>
  )
}
