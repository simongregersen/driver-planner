import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';

type Segment =
  | { type: 'text'; text: string }
  | { type: 'highlight'; text: string }
  | { type: 'address'; address: string };

// Lets an admin embed two bits of markup directly in a trip's name/description:
//   **text**    - highlighted in yellow, for something a driver should pay extra attention to
//   [address]   - a tappable link that opens the address in a maps app
// Split into segments and rendered through Angular's own @for/@if control flow rather than
// [innerHTML], so admin-entered text can never inject arbitrary HTML.
@Component({
  standalone: true,
  selector: 'app-rich-text',
  templateUrl: './rich-text.component.html',
  styleUrls: ['./rich-text.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichTextComponent {
  text = input<string | null | undefined>('');

  // The 's' flag lets either span multiple lines (a textarea description can have them); '+?'
  // is non-greedy, so "a **x** b **y** c" is two highlights, not one spanning the middle.
  private static readonly PATTERN = /\*\*(.+?)\*\*|\[(.+?)\]/gs;

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
        result.push({type: 'highlight', text: match[1]});
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

  // Google's documented cross-platform "Maps URLs" format — opens the native Google Maps app
  // when installed (Android and iOS both), falls back to Google Maps in the browser otherwise.
  // Not a guaranteed way to respect an iOS user's own default-maps-app choice (Apple doesn't
  // expose that to web content), but the most broadly compatible single link for both platforms.
  mapsUrl(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
}
