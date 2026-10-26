"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, LogOut, XIcon } from "lucide-react";
import { useState } from "react";

import { signOut } from "@/lib/auth/session";

/** Enterprise Portal "Log out" button and confirm dialog, at the foot of the sidebar. */
export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logOut = () => {
    setIsLoggingOut(true);
    signOut();
  };

  return (
    // Signing out in flight keeps the dialog open until the redirect.
    <DialogPrimitive.Root open={open} onOpenChange={(next) => isLoggingOut || setOpen(next)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-auto w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-input bg-surface py-2.5 text-sm font-medium leading-[normal] text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <LogOut aria-hidden="true" />
        Log out
      </button>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-110 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-surface leading-[normal] shadow-[0_20px_48px_rgb(0_0_0/0.2)] outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
        >
          <div className="flex shrink-0 items-start gap-3 pt-5 pr-4.5 pb-4 pl-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-badge text-identity [&_svg]:size-5">
              <LogOut aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">Log out?</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[13px] text-on-surface-variant">
                You will be signed out of POS-PROBE.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="rounded-md p-1 text-on-surface-variant outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon aria-hidden="true" className="size-4.5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-dialog-divider bg-dialog-footer px-6 py-3.5">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-input bg-surface px-4 py-[9px] text-sm font-medium leading-[normal] text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={logOut}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-identity px-4 py-[9px] text-sm font-medium leading-[normal] text-identity-foreground transition-colors outline-none hover:bg-identity/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
            >
              {isLoggingOut ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
