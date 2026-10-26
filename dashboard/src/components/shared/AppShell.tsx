"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, PanelLeft, Sun } from "lucide-react";
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
import { useThemeStore } from "@/stores/use-theme-store";
import { BrandLockup } from "./BrandLockup";
import { ReturnToPosButton } from "./ReturnToPosButton";
import { SIDEBAR_SECTIONS } from "./SidebarNav";
import { UserCard } from "./UserCard";

const NO_SHELL_ROUTES = ["/signin"];

// Same width as the POS sidebar (288px), so switching between the systems doesn't shift anything.
const SIDEBAR_STYLE = { "--sidebar-width": "18rem" } as CSSProperties;

const ROLE_NAMES: Record<string, string> = { owner: "Owner", manager: "Manager" };

// Icon-only header controls, styled like the Portal's ghost icon buttons.
const HEADER_ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]";

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
  const { openMobile, state, toggleSidebar } = useSidebar();
  const { theme, mounted, toggleTheme } = useThemeStore();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);

  // Hand focus back to the menu button when the phone drawer closes.
  useEffect(() => {
    if (wasDrawerOpen.current && !openMobile) mobileTriggerRef.current?.focus();
    wasDrawerOpen.current = openMobile;
  }, [openMobile]);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-sidebar-border bg-background px-4 sm:px-6">
      <button
        aria-expanded={openMobile}
        aria-label={openMobile ? "Close navigation" : "Open navigation"}
        className={`${HEADER_ICON_BUTTON} md:hidden`}
        onClick={toggleSidebar}
        ref={mobileTriggerRef}
        type="button"
      >
        <Menu aria-hidden="true" className="size-4!" />
      </button>
      <button
        aria-expanded={state === "expanded"}
        aria-label={state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"}
        className={`${HEADER_ICON_BUTTON} hidden md:inline-flex`}
        onClick={toggleSidebar}
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
        <SidebarHeader className="h-24 justify-center border-b border-sidebar-border py-0 pl-3.5 pr-2.5">
          <BrandLockup />
        </SidebarHeader>
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
