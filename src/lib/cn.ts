/** Tiny class-name joiner so components can compose Tailwind classes. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
