import logoIconSrc from "@/assets/subsense-logo-icon.png"
import { cn } from "@/lib/utils"

interface LogoIconProps {
  className?: string
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    // No CSS corner rounding here on purpose: the source asset is a square crop
    // of the badge's own chrome bezel, which already has its rounded corner baked
    // in. A second, independent CSS clip on top of that caused a double-rounding
    // mismatch (visible as messy/broken edges at small render sizes) — fixed by
    // cropping the asset tightly to the badge and removing this clip entirely.
    <img src={logoIconSrc} alt="" className={cn("object-contain", className)} />
  )
}
