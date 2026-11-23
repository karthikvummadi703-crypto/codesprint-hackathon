import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AVATAR_SIZE, MAX_AVATAR_SOURCE_BYTES, fileToAvatarDataUrl } from '../imageService';

const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn(() => 'blob:avatar'),
  revokeObjectURL: vi.fn(),
  failLoad: false,
  imageSize: { width: 400, height: 200 },
  imageCount: 0,
  sources: [] as string[],
}));

class FakeImage {
  width: number;
  height: number;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    mocks.imageCount += 1;
    this.width = mocks.imageSize.width;
    this.height = mocks.imageSize.height;
  }

  set src(value: string) {
    mocks.sources.push(value);
    queueMicrotask(() => {
      if (mocks.failLoad) this.onerror?.();
      else this.onload?.();
    });
  }
}

interface CanvasHarness {
  canvas: { width: number; height: number };
  drawImage: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  getContext: ReturnType<typeof vi.fn>;
}

function installCanvas(contextAvailable = true): CanvasHarness {
  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
  const context = contextAvailable ? { drawImage } : null;
  const getContext = vi.fn(() => context);
  const canvas = {
    width: 0,
    height: 0,
    getContext,
    toDataURL,
  };

  vi.spyOn(document, 'createElement').mockImplementation(
    (() => canvas as unknown as HTMLCanvasElement) as typeof document.createElement,
  );

  return { canvas, drawImage, toDataURL, getContext };
}

function imageFile(overrides: Record<string, unknown> = {}): File {
  return new File(['image bytes'], 'photo.png', { type: 'image/png', ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failLoad = false;
  mocks.imageSize = { width: 400, height: 200 };
  mocks.imageCount = 0;
  mocks.sources = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: mocks.revokeObjectURL,
  });
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fileToAvatarDataUrl validation', () => {
  it('rejects non-image files before decoding or drawing', async () => {
    const createElement = vi.spyOn(document, 'createElement');

    await expect(
      fileToAvatarDataUrl(new File(['x'], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toThrow('Please choose an image file (PNG or JPEG).');

    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.imageCount).toBe(0);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('rejects an oversized image before decoding', async () => {
    const file = imageFile();
    Object.defineProperty(file, 'size', { value: MAX_AVATAR_SOURCE_BYTES + 1 });

    await expect(fileToAvatarDataUrl(file)).rejects.toThrow(
      'That image is too large. Please choose one under 8 MB.',
    );
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.imageCount).toBe(0);
  });

  it('accepts an image exactly at the size limit', async () => {
    installCanvas();
    const file = imageFile();
    Object.defineProperty(file, 'size', { value: MAX_AVATAR_SOURCE_BYTES });

    await expect(fileToAvatarDataUrl(file)).resolves.toBe('data:image/jpeg;base64,AAAA');
  });
});

describe('fileToAvatarDataUrl processing', () => {
  it('cover-crops a landscape source into the default square', async () => {
    const harness = installCanvas();
    mocks.imageSize = { width: 800, height: 400 };

    await fileToAvatarDataUrl(imageFile());

    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.imageCount).toBe(1);
    expect(mocks.sources).toEqual(['blob:avatar']);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
    expect(harness.canvas.width).toBe(AVATAR_SIZE);
    expect(harness.canvas.height).toBe(AVATAR_SIZE);
    expect(harness.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), -128, 0, 512, 256);
  });

  it('centres a portrait source and honours a custom output size', async () => {
    const harness = installCanvas();
    mocks.imageSize = { width: 400, height: 800 };

    await fileToAvatarDataUrl(imageFile(), 64);

    expect(harness.canvas.width).toBe(64);
    expect(harness.canvas.height).toBe(64);
    expect(harness.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, -32, 64, 128);
    expect(harness.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('does not shift an already-square image', async () => {
    const harness = installCanvas();
    mocks.imageSize = { width: 300, height: 300 };

    await fileToAvatarDataUrl(imageFile(), 150);

    expect(harness.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 150, 150);
  });

  it('returns the canvas data URL as the processed avatar', async () => {
    const harness = installCanvas();
    harness.toDataURL.mockReturnValue('data:image/jpeg;base64,RESULT');

    await expect(fileToAvatarDataUrl(imageFile())).resolves.toBe('data:image/jpeg;base64,RESULT');
    expect(harness.getContext).toHaveBeenCalledWith('2d');
  });

  it('fails when the browser cannot provide a 2d context', async () => {
    const harness = installCanvas(false);

    await expect(fileToAvatarDataUrl(imageFile())).rejects.toThrow(
      'This browser cannot process the selected image.',
    );
    expect(harness.drawImage).not.toHaveBeenCalled();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });

  it('rejects a broken image and still revokes the object URL', async () => {
    mocks.failLoad = true;
    const harness = installCanvas();

    await expect(fileToAvatarDataUrl(imageFile())).rejects.toThrow(
      'Could not read that image. Try a different file.',
    );
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
    expect(harness.drawImage).not.toHaveBeenCalled();
  });
});
