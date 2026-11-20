"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, CreditCard, Moon, PanelLeft, Radar, Sun, X } from "lucide-react";
import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSession } from "@/lib/auth/session";
import { canAccessRoute, useAuthStore } from "@/stores/use-auth-store";
import { posSalesUrl } from "@/lib/pos-url";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeStore } from "@/stores/use-theme-store";
import { BrandLockup } from "./BrandLockup";
import { ReturnToPosButton } from "./ReturnToPosButton";
import { SIDEBAR_SECTIONS } from "./SidebarNav";
import { UserCard } from "./UserCard";

const NO_SHELL_ROUTES = ["/signin"];

const SIDEBAR_STYLE = { "--sidebar-width": "18.5rem" } as CSSProperties;

const ROLE_NAMES: Record<string, string> = { owner: "Owner", manager: "Manager" };

// Icon-only header controls, styled like the Portal's ghost icon buttons.
const HEADER_ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]";

function NavigationHeader() {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarHeader className="h-24 shrink-0 flex-row items-center gap-2 border-b border-sidebar-border py-0 pl-3.5 pr-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Select enterprise module, current module POS Probe"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl p-1 hover:bg-sidebar-accent focus-visible:outline-ring">
            <BrandLockup />
            <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-[calc(100vw-2rem)] max-w-[20rem] space-y-0.5 rounded-xl border-border p-1.5 shadow-xl">
          <DropdownMenuLabel className="px-2.5 pt-1.5 pb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Select enterprise module
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="-mx-1.5 mt-0 mb-1 bg-border" />
          <DropdownMenuItem asChild className="cursor-pointer gap-3 rounded-lg px-2.5 py-2">
            <a href={posSalesUrl}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/[0.07] text-zinc-600 dark:text-zinc-300">
                <CreditCard aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs leading-snug font-medium">Point of Sale</span>
                <span className="text-[11px] leading-tight text-muted-foreground">Retail &amp; register checkout</span>
              </span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem disabled aria-current="true" className="gap-3 rounded-lg bg-violet-500/10 px-2.5 py-2 data-[disabled]:opacity-100">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-xs">
              <Radar aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs leading-snug font-semibold">POS Probe</span>
              <span className="text-[11px] leading-tight text-muted-foreground">Sales analytics, forecasts &amp; alerts</span>
            </span>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
              <Check aria-hidden className="size-3 stroke-[3]" />
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {isMobile && (
        <button type="button" aria-label="Close navigation" onClick={() => setOpenMobile(false)} className={HEADER_ICON_BUTTON}>
          <X aria-hidden />
        </button>
      )}
    </SidebarHeader>
  );
}

function Navigation() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { data: session } = useSession();
  const role = session?.role;

  const sections = SIDEBAR_SECTIONS.map((section) => ({
    ...section,
    destinations: section.destinations.filter(({ href }) => canAccessRoute(role as never, href)),
  })).filter((section) => section.destinations.length > 0);

  return (
    <>
      {/* Spacing and type copied from the POS sidebar so items line up pixel for pixel. */}
      <SidebarContent className="px-3 py-4">
        <SidebarGroup className="p-0">
          <SidebarMenu className="gap-0.5">
            {sections.map(({ label: sectionLabel, destinations }, index) => (
              <Fragment key={sectionLabel ?? index}>
                {sectionLabel ? (
                  <li
                    aria-hidden
                    className={`list-none pb-1.5 pl-2.5 text-[11px] font-semibold tracking-wide text-zinc-400 ${index === 0 ? "pt-1" : "pt-[18px]"}`}
                  >
                    {sectionLabel}
                  </li>
                ) : null}
                {destinations.map(({ href, icon: Icon, label }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      className="h-auto w-full gap-3 rounded-lg px-2.5 py-[9px] text-[15px] font-medium text-sidebar-foreground transition-colors data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
                      isActive={pathname === href}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Link aria-current={pathname === href ? "page" : undefined} href={href}>
                        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </Fragment>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border py-3.5 pl-4 pr-3">
        {session ? (
          <UserCard
            user={{
              name: session.user.name,
              username: session.user.id,
              email: session.user.email,
              roleName: session.posRole || (ROLE_NAMES[session.role] ?? session.role),
            }}
          />
        ) : null}
        <ReturnToPosButton />
      </SidebarFooter>
    </>
  );
}

function ShellHeader() {
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar();
  const { theme, mounted, toggleTheme } = useThemeStore();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);

  // Hand focus back to the sidebar button when the phone drawer closes.
  useEffect(() => {
    if (wasDrawerOpen.current && !openMobile) triggerRef.current?.focus();
    wasDrawerOpen.current = openMobile;
  }, [openMobile]);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-sidebar-border bg-background px-4 sm:px-6">
      {/* One sidebar button for every screen size: it collapses the sidebar, or opens the drawer on phones. */}
      <button
        aria-expanded={isMobile ? openMobile : state === "expanded"}
        aria-label={
          isMobile
            ? openMobile ? "Close navigation" : "Open navigation"
            : state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"
        }
        className={HEADER_ICON_BUTTON}
        onClick={toggleSidebar}
        ref={triggerRef}
        type="button"
      >
        <PanelLeft aria-hidden="true" className="size-4!" />
      </button>
      <button
        aria-label={mounted && theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className={`${HEADER_ICON_BUTTON} ml-auto`}
        onClick={toggleTheme}
        type="button"
      >
        {mounted && theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </button>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  // Sign-in pages and signed-out state render bare, without the shell.
  if (NO_SHELL_ROUTES.includes(pathname) || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    // The window never scrolls; only <main> does, so its scrollbar sits under the header.
    <SidebarProvider className="h-svh overflow-hidden print:h-auto print:overflow-visible" style={SIDEBAR_STYLE}>
      <Sidebar collapsible="offcanvas">
        <NavigationHeader />
        <Navigation />
      </Sidebar>

      <div className="flex h-svh min-w-0 flex-1 flex-col bg-surface print:h-auto">
        <ShellHeader />
        <main
          key={pathname}
          // Stable gutter: pages keep the same width whether or not they are long enough to scroll.
          className="relative min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden bg-background px-6 py-8 [scrollbar-gutter:stable] md:px-8 animate-page-in print:overflow-visible"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
