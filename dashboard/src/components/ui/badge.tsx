import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:opacity-80",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-violet-100 text-violet-700",
        secondary:
          "border-transparent bg-slate-100 text-slate-700",
        destructive:
          "border-transparent bg-rose-100 text-rose-700",
        outline: "border-border bg-sky-50 text-sky-700",
        success:
          "border-transparent bg-emerald-100 text-emerald-700",
        warning:
          "border-transparent bg-amber-100 text-amber-700",
        info:
          "border-transparent bg-cyan-100 text-cyan-700",
        purple:
          "border-transparent bg-purple-100 text-purple-700",
        indigo:
          "border-transparent bg-indigo-100 text-indigo-700",
        notification:
          "border-transparent bg-pink-100 text-pink-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
