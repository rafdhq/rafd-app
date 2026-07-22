/**
 * Client-side image compression before upload.
 * Resizes to max edge and re-encodes as JPEG/WebP.
 */
export async function compressImageFile(
  file: File,
  opts?: { maxEdge?: number; quality?: number; mime?: string }
): Promise<{ blob: Blob; fileName: string; contentType: string; width: number; height: number }> {
  const maxEdge = opts?.maxEdge ?? 1280;
  const quality = opts?.quality ?? 0.82;
  const mime = opts?.mime ?? (file.type === 'image/png' ? 'image/png' : 'image/jpeg');

  if (!file.type.startsWith('image/')) {
    return { blob: file, fileName: file.name, contentType: file.type || 'application/octet-stream', width: 0, height: 0 };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { blob: file, fileName: file.name, contentType: file.type, width: bitmap.width, height: bitmap.height };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('compress failed'))),
      mime,
      quality
    );
  });

  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    blob,
    fileName: `${base}-compressed.${ext}`,
    contentType: mime,
    width,
    height,
  };
}

export async function fileToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function compressAndEncode(file: File, opts?: { maxEdge?: number; quality?: number }) {
  const compressed = await compressImageFile(file, opts);
  const fileBase64 = await fileToBase64(compressed.blob);
  return {
    ...compressed,
    fileBase64,
    originalSize: file.size,
    compressedSize: compressed.blob.size,
  };
}
