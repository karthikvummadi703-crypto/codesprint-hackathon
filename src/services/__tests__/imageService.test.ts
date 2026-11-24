import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AVATAR_SIZE, MAX_AVATAR_SOURCE_BYTES, fileToAvatarDataUrl } from '../imageService';

let imageMode: 'load' | 'error' = 'load';
let imageWidth = 800;
let imageHeight = 400;
let canvasSize: { width: number; height: number } | null = null;
let contextAvailable = true;
let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
let drawImage: ReturnType<typeof vi.fn>;

class FakeImage {
  width = imageWidth;
  height = imageHeight;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => {
      if (imageMode === 'error') this.onerror?.();
      else this.onload?.();
    });
  }
}

function imageFile(name = 'photo.png'): File {
  return new File(['image bytes'], name, { type: 'image/png' });
}

describe('fileToAvatarDataUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    imageMode = 'load';
    imageWidth = 800;
    imageHeight = 400;
    canvasSize = null;
    contextAvailable = true;

    drawImage = vi.fn();
    createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:avatar');
    revokeObjectURL = vi.fn<(url: string) => void>();

    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      canvasSize = { width: this.width, height: this.height };
      return contextAvailable ? ({ drawImage } as unknown as CanvasRenderingContext2D) : null;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports the avatar limits', () => {
    expect(AVATAR_SIZE).toBe(256);
    expect(MAX_AVATAR_SOURCE_BYTES).toBe(8 * 1024 * 1024);
  });

  it('rejects a non-image file before touching the browser image APIs', async () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await expect(fileToAvatarDataUrl(file)).rejects.toThrow('Please choose an image file (PNG or JPEG).');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects an image larger than eight megabytes', async () => {
    const file = imageFile('huge.png');
    Object.defineProperty(file, 'size', { value: MAX_AVATAR_SOURCE_BYTES + 1 });

    await expect(fileToAvatarDataUrl(file)).rejects.toThrow('That image is too large.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('cover-crops a wide image to the default square and encodes it as JPEG', async () => {
    const file = imageFile();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');

    await expect(fileToAvatarDataUrl(file)).resolves.toBe('data:image/jpeg;base64,AAAA');

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
    expect(canvasSize).toEqual({ width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), -128, 0, 512, 256);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('honours a custom size and cover-crops a tall image vertically', async () => {
    imageWidth = 400;
    imageHeight = 800;

    await expect(fileToAvatarDataUrl(imageFile(), 100)).resolves.toBe('data:image/jpeg;base64,AAAA');

    expect(canvasSize).toEqual({ width: 100, height: 100 });
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, -50, 100, 200);
  });

  it('reports a browser that cannot provide a 2D context', async () => {
    contextAvailable = false;

    await expect(fileToAvatarDataUrl(imageFile())).rejects.toThrow(
      'This browser cannot process the selected image.',
    );
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('rejects an unreadable image and still revokes its object URL', async () => {
    imageMode = 'error';

    await expect(fileToAvatarDataUrl(imageFile())).rejects.toThrow(
      'Could not read that image. Try a different file.',
    );
    expect(drawImage).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });
});
