import {TestBed} from '@angular/core/testing';
import {RichTextComponent} from './rich-text.component';

/**
 * The trip-name/description markup grammar: **highlight** and [address], and — the case this
 * suite was written for — the two together. An admin writing "**Kør til [Hovedgade 1] nu**" or
 * "[**Hovedgade 1**]" used to get the other marker's characters printed literally, so the only
 * way to get a link into a highlighted instruction was to give up one of the two.
 *
 * Asserted against the rendered DOM rather than the segment list: what matters is that the
 * address ends up inside the <mark> as a real <a>, and the internal shape that achieves it is
 * free to change.
 */
describe('RichTextComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [RichTextComponent]});
  });

  afterEach(() => TestBed.resetTestingModule());

  function render(text: string): HTMLElement {
    const fixture = TestBed.createComponent(RichTextComponent);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('leaves text with no markup alone', () => {
    const host = render('Afgang fra garagen');
    expect(host.textContent).toBe('Afgang fra garagen');
    expect(host.querySelector('mark')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
  });

  it('highlights **text**', () => {
    const host = render('Husk **kørestol**');
    expect(host.querySelector('mark')?.textContent).toBe('kørestol');
    expect(host.textContent).toBe('Husk kørestol');
  });

  it('links [address]', () => {
    const link = render('Kør til [Hovedgade 1] først').querySelector('a');
    expect(link?.textContent).toBe('Hovedgade 1');
    expect(link?.getAttribute('href')).toContain(encodeURIComponent('Hovedgade 1'));
  });

  it('links an address inside a highlight, keeping the rest of the highlight highlighted', () => {
    const host = render('**Kør til [Hovedgade 1] senest 10:00**');
    const mark = host.querySelector('mark');
    expect(mark?.textContent).toBe('Kør til Hovedgade 1 senest 10:00');
    // One mark around the whole instruction, not one per part — see the .html.
    expect(host.querySelectorAll('mark').length).toBe(1);
    const link = mark?.querySelector('a');
    expect(link?.textContent).toBe('Hovedgade 1');
    expect(link?.getAttribute('href')).toContain(encodeURIComponent('Hovedgade 1'));
  });

  it('reads [**address**] the same way as **[address]**', () => {
    for (const written of ['**[Hovedgade 1]**', '[**Hovedgade 1**]']) {
      const link = render(written).querySelector('mark > a');
      expect(link?.textContent).toBe('Hovedgade 1');
      // The markers never reach the maps query, whichever side of the brackets they were on.
      expect(link?.getAttribute('href')).toContain(encodeURIComponent('Hovedgade 1'));
      expect(link?.getAttribute('href')).not.toContain('*');
    }
  });

  it('keeps several highlights and addresses apart', () => {
    const host = render('**A** og [B] og **C**');
    expect(Array.from(host.querySelectorAll('mark')).map(m => m.textContent)).toEqual(['A', 'C']);
    expect(host.querySelector('a')?.textContent).toBe('B');
    expect(host.textContent).toBe('A og B og C');
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(render('2 ** 3 er ikke fremhævning').textContent).toBe('2 ** 3 er ikke fremhævning');
  });

  describe('toPlainText', () => {
    it('keeps the words and drops the markers', () => {
      expect(RichTextComponent.toPlainText('Husk **kørestol** til [Hovedgade 1]'))
        .toBe('Husk kørestol til Hovedgade 1');
    });

    it('drops both markers from a combined highlight and address', () => {
      expect(RichTextComponent.toPlainText('**Kør til [Hovedgade 1] nu**')).toBe('Kør til Hovedgade 1 nu');
      expect(RichTextComponent.toPlainText('[**Hovedgade 1**]')).toBe('Hovedgade 1');
    });

    it('gives an empty string for nothing', () => {
      expect(RichTextComponent.toPlainText(null)).toBe('');
      expect(RichTextComponent.toPlainText(undefined)).toBe('');
      expect(RichTextComponent.toPlainText('')).toBe('');
    });
  });
});
