/** "PettyCash" -> "Petty cash", "LoginFailed" -> "Login failed". */
export function humanize(v: string | null | undefined): string {
  if (!v) return '';
  const spaced = v.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
