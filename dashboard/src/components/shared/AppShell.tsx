"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, PanelLeft, Sun } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
import { LogoutButton } from "./LogoutButton";
import { SIDEBAR_SECTIONS } from "./SidebarNav";
import { UserCard } from "./UserCard";

const NO_SHELL_ROUTES = ["/login", "/signin"];

// Same width as the Enterprise Portal sidebar (296px), so the systems feel like one product.
const SIDEBAR_STYLE = { "--sidebar-width": "18.5rem" } as CSSProperties;

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
      <SidebarContent className="px-5 py-6">
        {sections.map(({ label: sectionLabel, destinations }, index) => (
          <SidebarGroup className="p-0" key={sectionLabel ?? index}>
            {sectionLabel ? (
              <SidebarGroupLabel className="mt-1.5 mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-nav-section">
                {sectionLabel}
              </SidebarGroupLabel>
            ) : null}
            <SidebarMenu className="gap-1">
              {destinations.map(({ href, icon: Icon, label }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    className="h-auto gap-2 rounded-lg px-2.5 py-[10px] text-[15px] leading-[normal] font-normal text-nav-foreground data-[active=true]:font-semibold data-[active=true]:text-foreground [&>svg]:size-4"
                    isActive={pathname === href}
                    onClick={() => setOpenMobile(false)}
                    tooltip={label}
                  >
                    <Link aria-current={pathname === href ? "page" : undefined} href={href}>
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2.5 border-t border-border px-4 py-3.5">
        {session ? (
          <UserCard
            user={{
              name: session.user.name,
              username: session.user.id,
              email: session.user.email,
              roleName: ROLE_NAMES[session.role] ?? session.role,
            }}
          />
        ) : null}
        <LogoutButton />
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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-border bg-surface px-6">
      <button
        aria-expanded={openMobile}
        aria-label={openMobile ? "Close navigation" : "Open navigation"}
        className={`${HEADER_ICON_BUTTON} md:hidden`}
        onClick={toggleSidebar}
        ref={mobileTriggerRef}
        type="button"
      >
        <Menu aria-hidden="true" />
      </button>
      <button
        aria-expanded={state === "expanded"}
        aria-label={state === "collapsed" ? "Expand sidebar" : "Collapse sidebar"}
        className={`${HEADER_ICON_BUTTON} hidden md:inline-flex`}
        onClick={toggleSidebar}
        type="button"
      >
        <PanelLeft aria-hidden="true" />
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
    <SidebarProvider style={SIDEBAR_STYLE}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b border-border py-[18px] pl-3.5 pr-2.5">
          <BrandLockup />
        </SidebarHeader>
        <Navigation />
      </Sidebar>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col bg-surface">
        <ShellHeader />
        <main
          key={pathname}
          className="relative w-full flex-1 overflow-x-hidden bg-background p-4 sm:p-6 animate-page-in"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
