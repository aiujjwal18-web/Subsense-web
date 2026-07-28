import logoIconSrc from "@/assets/subsense-logo-icon.png"
import { cn } from "@/lib/utils"

interface LogoIconProps {
  className?: string
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <img
      src={logoIconSrc}
      alt=""
      className={cn("rounded-[22.5%] object-cover", className)}
    />
  )
}
