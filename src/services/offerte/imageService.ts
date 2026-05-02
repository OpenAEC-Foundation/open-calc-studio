import type { OfferteImage } from '@/types/costModel';

const THUMBNAIL_MAX_WIDTH = 200;

/**
 * Generate a base64 thumbnail from a File object using canvas.
 */
export async function createThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = THUMBNAIL_MAX_WIDTH / img.width;
        const canvas = document.createElement('canvas');
        canvas.width = THUMBNAIL_MAX_WIDTH;
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Create an OfferteImage from a Tauri file dialog result.
 * Reads the file bytes, generates thumbnail via canvas.
 */
export async function createOfferteImageFromPath(filePath: string): Promise<OfferteImage> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes]);
  const file = new File([blob], filePath.split(/[/\\]/).pop() || 'image');
  const thumbnail = await createThumbnail(file);
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    path: filePath,
    thumbnail,
  };
}
