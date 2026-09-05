'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { cn, displayName } from '@/lib/utils';
import { Avatar } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { useAuth } from '@/lib/auth/auth-provider';
import { ROLE_LABELS } from '@/lib/abilities';
import { useUiStore, type Theme } from '@/stores/ui-store';
import { useCurrentNavLabel } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/layout/command-palette';

/**
 * The bar above every page: where you are on the left, who you are on the
 * right, and one search field that reaches the whole workspace.
 */
export function Topbar() {
  const router = useRouter();
  const { user, role, logout } = useAuth();
  const { theme, setTheme } = useUiStore();
  const section = useCurrentNavLabel();
  const name = displayName(user);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // The palette is the one global shortcut, so it is bound at the shell.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // "system" follows the OS, so show the icon for what the user will actually
  // see rather than for the setting's name.
  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <Link
              href="/dashboard"
              className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Workspace
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
            <span className="truncate font-medium text-[var(--text-primary)]">{section}</span>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--control-bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              aria-label="Search the workspace"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded bg-[var(--surface-active)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch to ${nextTheme} theme`}
              title={`Switch to ${nextTheme} theme`}
              className="grid h-8 w-8 place-items-center rounded-[var(--radius-control)] border border-[var(--border-default)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] px-1.5 py-1 transition-colors hover:bg-[var(--surface-hover)]"
                  aria-label="Account menu"
                >
                  <Avatar name={name} src={user?.employee?.avatarUrl} size={30} />
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[150px] truncate text-[13px] font-semibold leading-tight text-[var(--text-primary)]">
                      {name}
                    </span>
                    <span className="block font-mono text-[10.5px] leading-tight text-[var(--text-muted)]">
                      {role ? ROLE_LABELS[role] : ''}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-56">
                <div className="px-2.5 py-2">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                    {name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-tertiary)]">{user?.email}</p>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                {(
                  [
                    { value: 'dark', label: 'Dark', icon: Moon },
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'system', label: 'System', icon: Monitor },
                  ] as { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[]
                ).map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => setTheme(option.value)}
                    className={cn(theme === option.value && 'text-[var(--accent)]')}
                  >
                    <option.icon className="h-3.5 w-3.5" aria-hidden />
                    {option.label}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout} className="text-[var(--status-danger)]">
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={(href) => {
          setPaletteOpen(false);
          router.push(href);
        }}
      />
    </>
  );
}
