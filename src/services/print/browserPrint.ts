import interRegular from '@/styles/blueprint/fonts/Inter-Regular.ttf?url';
import interMedium from '@/styles/blueprint/fonts/Inter-Medium.ttf?url';
import interSemibold from '@/styles/blueprint/fonts/Inter-SemiBold.ttf?url';
import spaceMedium from '@/styles/blueprint/fonts/SpaceGrotesk-Medium.ttf?url';
import spaceBold from '@/styles/blueprint/fonts/SpaceGrotesk-Bold.ttf?url';
import monoRegular from '@/styles/blueprint/fonts/JetBrainsMono-Regular.ttf?url';

export function printFontCss(): string {
  return [['Inter', interRegular, 400], ['Inter', interMedium, 500],
    ['Inter', interSemibold, 600], ['Inter', interSemibold, 700],
    ['Space Grotesk', spaceMedium, 500], ['Space Grotesk', spaceBold, 700],
    ['JetBrains Mono', monoRegular, 400]].map(([family, url, weight]) =>
    `@font-face{font-family:'${family}';font-weight:${weight};src:url('${new URL(String(url), document.baseURI).href}') format('truetype');}`
  ).join('\n');
}

/** Print in the current document: works without popups in sandbox allow-modals. */
export async function printHtmlInPage(html: string): Promise<void> {
  if (document.querySelector('.ocs-print-root')) throw new Error('A print job is already open.');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const root = document.createElement('div');
  root.className = 'ocs-print-root';
  root.hidden = true;
  parsed.querySelectorAll('script, .print-actions').forEach(el => el.remove());
  root.innerHTML = parsed.body.innerHTML;
  const style = document.createElement('style');
  style.media = 'print';
  style.textContent = [...parsed.querySelectorAll('style')].map(el => el.textContent).join('\n') + `
    html, body { height:auto !important; overflow:visible !important; }
    body > :not(.ocs-print-root) { display:none !important; }
    .ocs-print-root { display:block !important; }`;
  const cleanup = () => { root.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  document.head.append(style); document.body.append(root);
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    await document.fonts?.ready;
    await Promise.all([...root.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    window.print();
  } catch (error) { cleanup(); throw error; }
}
