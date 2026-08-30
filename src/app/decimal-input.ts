// <input type="number">'s decimal separator follows the browser's own locale rather than this
// app's — Danish, throughout every other number this app displays (see DecimalPipe usage
// elsewhere). The numeric fields in this app are plain text inputs with inputmode="numeric"
// instead (a numeric keypad on mobile, no spinner on desktop) so a comma always works as the
// decimal point regardless of the browser's locale; a period is accepted too, since some
// devices/locales still produce one from their numeric keypad.

/** Parses a typed-in number, accepting both separators. Null for empty or unparseable input. */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Renders a stored number back into a field, in Danish notation. */
export function formatDecimal(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',');
}

/** Whether a typed-in value is either empty or a valid non-negative number. Emptiness is left to
 * the caller: some of these fields are required, others are optional. */
export function isValidDecimalInput(value: string | number | null | undefined): boolean {
  if (value == null || value === '') return true;
  const parsed = parseDecimal(value);
  return parsed != null && parsed >= 0;
}
