/**
 * The playlist is written into a <script> of the player page. A title or an address typed in the
 * cloud's dashboard must come out as data, never end the script.
 */
export {};

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { generatePlayerHTML } = require('../src/components/MediaPlayerComponent');

const SETTINGS = {
  autoPlay: true, loop: true, shuffle: false, imageDuration: 10, showControls: false,
  fitMode: 'contain', backgroundColor: '#000000', transitionEnabled: false, transitionDuration: 300,
  muteVideo: false, unattended: false,
};

const build = (title: string, url = 'https://cdn.test/a.mp4') =>
  generatePlayerHTML({ ...SETTINGS, items: [{ url, type: 'video', title }] });

describe('the playlist inside the player page', () => {
  it('cannot end the script from a title', () => {
    const html: string = build('</script><script>window.pwned = 1</script>');
    // one script block of the page's own, closed once
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).not.toContain('window.pwned = 1</script>');
  });

  it('cannot end the script from an address', () => {
    const html: string = build('x', 'https://cdn.test/</script><script>window.pwned = 1</script>.mp4');
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
  });

  it('still hands the exact text to the player once parsed', () => {
    const title = '</script> a "quote" \ back slash   <!-- end';
    const html: string = build(title);
    const line = html.split('\n').find((l: string) => l.includes('var playlist = ')) as string;
    const json = line.slice(line.indexOf('= ') + 2).replace(/;\s*$/, '');
    const playlist = new Function(`return ${json};`)();
    expect(playlist[0].title).toBe(title);
    expect(playlist[0].url).toBe('https://cdn.test/a.mp4');
  });
});
