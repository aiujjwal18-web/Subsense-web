import { LogoIcon } from "./LogoIcon"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
}

export function Logo({ className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoIcon className="size-9 shrink-0" />
      <span className="font-heading text-lg font-semibold text-foreground">SubSense</span>
    </div>
  )
}
