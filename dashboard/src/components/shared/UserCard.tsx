import { cn } from "@/lib/utils";

/** The signed-in user as the shell shows them. */
export type ShellUser = {
  name: string;
  username: string;
  email: string;
  roleName: string;
};

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.charAt(0) ?? ""}${parts.length > 1 ? parts[parts.length - 1].charAt(0) : ""}`.toUpperCase();
}

/** Sidebar profile card, sized like the POS one: who is signed in, and their role. */
export function UserCard({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <section
      aria-label="Signed in as"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-background p-3 shadow-xs",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        {initialsOf(user.name)}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-bold leading-tight text-foreground">{user.name}</p>
        <p className="truncate text-xs leading-tight text-muted-foreground">{user.username}</p>
        <p className="truncate text-xs leading-tight text-muted-foreground">{user.email}</p>
        <span className="mt-1 inline-flex w-fit items-center rounded-md border border-transparent bg-secondary px-2 py-0 text-[11px] font-semibold text-secondary-foreground">
          {user.roleName}
        </span>
      </div>
    </section>
  );
}
