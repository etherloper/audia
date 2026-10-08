/**
 * Extract dominant color from an image URL using canvas sampling.
 * Returns an RGB string like "45, 30, 20".
 */
export function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("0, 0, 0");
        return;
      }

      // Sample at small size for performance
      const size = 10;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const data = ctx.getImageData(0, 0, size, size).data;

      let r = 0, g = 0, b = 0;
      let count = 0;

      for (let i = 0; i < data.length; i += 4) {
        // Skip very light and very dark pixels to get more interesting color
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness > 30 && brightness < 220) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }

      if (count === 0) {
        // Fallback: use all pixels
        count = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      resolve(`${r}, ${g}, ${b}`);
    };
    img.onerror = () => resolve("0, 0, 0");
    img.src = imageUrl;
  });
}
