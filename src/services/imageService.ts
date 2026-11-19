/** Client-side avatar processing.
 *
 * Profile photos are stored as a small square data URL on the user's profile
 * document rather than uploaded to a bucket, so the app has no storage
 * dependency and works identically in dev mode. The image is downscaled and
 * cover-cropped here to keep the Firestore document well under its size limit
 * and to avoid shipping a multi-megabyte camera photo over the wire.
 */

export const AVATAR_SIZE = 256;
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024;

export async function fileToAvatarDataUrl(
  file: File,
  size: number = AVATAR_SIZE,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG or JPEG).');
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error('That image is too large. Please choose one under 8 MB.');
  }

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot process the selected image.');
  }

  // Cover-crop to a square so faces are not stretched.
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Try a different file.'));
    };
    image.src = url;
  });
}
