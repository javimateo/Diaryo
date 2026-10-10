import { texturePixels, type TextureRequest } from './texturePixels';

export interface TextureJob {
  key: string;
  request: TextureRequest;
  size: number;
  samples: 1 | 2;
}

/** Makes the textures away from the app (the big ones take about a second). */
self.onmessage = (event: MessageEvent<TextureJob>) => {
  const pixels = texturePixels(event.data.request, event.data.size, event.data.samples);
  self.postMessage({ ...event.data, pixels }, { transfer: [pixels.buffer] });
};
