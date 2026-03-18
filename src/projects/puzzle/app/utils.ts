export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function getDpr(): number {
  const raw = window.devicePixelRatio || 1;
  const maxDpr = /Mobi|Android/i.test(navigator.userAgent) ? 2 : 3;
  return Math.max(1, Math.min(maxDpr, raw));
}


