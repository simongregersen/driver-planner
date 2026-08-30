import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';

/** A run of plain text, or one address rendered as a maps link. The only two things that can
 * appear inside a highlight, and — since a highlight can't nest in a highlight — the only two
 * things that can appear inside anything. */
type Inline =
  | { type: 'text'; text: string }
  | { type: 'address'; address: string };

type Segment =
  | Inline
  | { type: 'highlight'; parts: Inline[] };

// Lets an admin embed two bits of markup directly in a trip's name/description:
//   **text**    - highlighted in yellow, for something a driver should pay extra attention to
//   [address]   - a tappable link that opens the address in a maps app
// The two compose: **[address]** is a highlighted link, and so is [**address**] — an admin
// reaching for both shouldn't have to know which order this parser prefers. A highlight can also
// hold an address among ordinary words (**Kør til [Hovedgade 1] senest 10:00**), which is why a
// highlight is a group of parts rather than a single string.
// Split into segments and rendered through Angular's own @for/@if control flow rather than
// [innerHTML], so admin-entered text can never inject arbitrary HTML.
@Component({
  standalone: true,
  selector: 'app-rich-text',
  templateUrl: './rich-text.component.html',
  styleUrls: ['./rich-text.component.css'],
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichTextComponent {
  text = input<string | null | undefined>('');

  // The 's' flag lets either span multiple lines (a textarea description can have them); '+?'
  // is non-greedy, so "a **x** b **y** c" is two highlights, not one spanning the middle.
  private static readonly PATTERN = /\*\*(.+?)\*\*|\[(.+?)\]/gs;

  // Addresses only — for re-scanning the inside of a highlight, where a second pass with the
  // full pattern above could only ever find the '**' markers this text has already had stripped.
  private static readonly ADDRESS_PATTERN = /\[(.+?)\]/gs;

  private static readonly HIGHLIGHT_MARKERS = /\*\*/g;

  /** The same text with its markup stripped rather than rendered — the words inside the markers
   * are kept, only the markers themselves go. For places that want a trip's name as a plain
   * string and have no business showing a highlight or a tappable address: TripReportFormComponent's
   * subheading, where the name identifies the report rather than being something to act on.
   * Lives here so the markup grammar stays defined in exactly one place. */
  static toPlainText(value: string | null | undefined): string {
    if (!value) return '';
    // new RegExp(re) copies source and flags, giving a fresh lastIndex — the same reason
    // segments() below makes its own copy rather than reusing the static one.
    // Recursing on what each match captured is what strips the inner half of a combined
    // **[address]**: the outer match hands back "[address]", which is markup in its own right.
    // It terminates because the captured text is always strictly shorter than the match.
    return value.replace(new RegExp(RichTextComponent.PATTERN),
      (_match, highlight, address) => RichTextComponent.toPlainText(highlight ?? address));
  }

  readonly segments = computed<Segment[]>(() => {
    const value = this.text();
    if (!value) return [];

    const result: Segment[] = [];
    const pattern = new RegExp(RichTextComponent.PATTERN);
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({type: 'text', text: value.slice(lastIndex, match.index)});
      }
      if (match[1] !== undefined) {
        result.push({type: 'highlight', parts: RichTextComponent.inlineParts(match[1])});
      } else if (match[2].includes('**')) {
        // [**Hovedgade 1**]: the markers are inside the brackets rather than around them, so the
        // outer pattern matched the address and the highlight is what's left over. Same result as
        // **[Hovedgade 1]**, which the branch above reaches from the other direction. Anything
        // else the admin put in the brackets is part of the address, so it keeps its place in
        // the query — only the markers themselves are dropped.
        result.push({
          type: 'highlight',
          parts: [{type: 'address', address: RichTextComponent.stripMarkers(match[2])}],
        });
      } else {
        result.push({type: 'address', address: match[2]});
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      result.push({type: 'text', text: value.slice(lastIndex)});
    }
    return result;
  });

  /** The inside of a highlight: ordinary words, with any addresses among them still linked. */
  private static inlineParts(value: string): Inline[] {
    const result: Inline[] = [];
    const pattern = new RegExp(RichTextComponent.ADDRESS_PATTERN);
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({type: 'text', text: value.slice(lastIndex, match.index)});
      }
      result.push({type: 'address', address: match[1]});
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      result.push({type: 'text', text: value.slice(lastIndex)});
    }
    return result;
  }

  private static stripMarkers(value: string): string {
    return value.replace(new RegExp(RichTextComponent.HIGHLIGHT_MARKERS), '');
  }

  // Google's documented cross-platform "Maps URLs" format — opens the native Google Maps app
  // when installed (Android and iOS both), falls back to Google Maps in the browser otherwise.
  // Not a guaranteed way to respect an iOS user's own default-maps-app choice (Apple doesn't
  // expose that to web content), but the most broadly compatible single link for both platforms.
  mapsUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
}
