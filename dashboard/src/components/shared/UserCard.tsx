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

/** Enterprise Portal sidebar profile card: who is signed in, and their role. */
export function UserCard({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <section
      aria-label="Signed in as"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-identity-border bg-surface py-3.5 pl-3.5 pr-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-identity text-[15px] font-semibold leading-[normal] text-identity-foreground"
      >
        {initialsOf(user.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <p className="w-full truncate text-[15px] font-bold leading-[normal] text-foreground">{user.name}</p>
        <p className="w-full truncate text-xs leading-[normal] text-on-surface-variant">{user.username}</p>
        <p className="w-full truncate text-xs leading-[normal] text-on-surface-variant">{user.email}</p>
        <p className="pt-1">
          <span className="block rounded-full bg-identity-badge px-2 py-0.5 text-[11px] font-semibold leading-[normal] text-identity">
            {user.roleName}
          </span>
        </p>
      </div>
    </section>
  );
}
