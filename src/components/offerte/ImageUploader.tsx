import { useCallback, useRef } from 'react';
import type { OfferteImage } from '@/types/costModel';

interface ImageUploaderProps {
  images: OfferteImage[];
  onAdd: (image: OfferteImage) => void;
  onRemove: (imageId: string) => void;
  onUpdateCaption?: (imageId: string, caption: string) => void;
}

export function ImageUploader({ images, onAdd, onRemove, onUpdateCaption }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (selected) {
        const { createOfferteImageFromPath } = await import('@/services/offerte/imageService');
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const filePath of paths) {
          if (filePath) {
            const img = await createOfferteImageFromPath(filePath);
            onAdd(img);
          }
        }
      }
    } catch {
      fileInputRef.current?.click();
    }
  }, [onAdd]);

  const handleHtmlFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const { createThumbnail } = await import('@/services/offerte/imageService');
    for (const file of Array.from(files)) {
      const thumbnail = await createThumbnail(file);
      onAdd({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        path: file.name,
        thumbnail,
      });
    }
    e.target.value = '';
  }, [onAdd]);

  return (
    <div className="offerte-image-uploader">
      <div className="offerte-image-grid">
        {images.map((img) => (
          <div key={img.id} className="offerte-image-thumb">
            <img src={img.thumbnail} alt={img.caption || ''} />
            {onUpdateCaption && (
              <input
                className="offerte-image-caption"
                type="text"
                placeholder="Bijschrift..."
                value={img.caption || ''}
                onChange={(e) => onUpdateCaption(img.id, e.target.value)}
              />
            )}
            <button
              className="offerte-image-remove"
              onClick={() => onRemove(img.id)}
              title="Verwijder afbeelding"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="offerte-image-add"
          onClick={handleFileSelect}
          title="Afbeelding toevoegen"
        >
          + Afbeelding
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleHtmlFileChange}
      />
    </div>
  );
}
