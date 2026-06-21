const createAssetId = () =>
  `img_${Date.now().toString(36)}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readImageSize = (src) =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    image.onerror = reject;
    image.src = src;
  });

export async function loadImageAsset(file) {
  const src = await readFileAsDataUrl(file);
  const dimensions = await readImageSize(src);

  return {
    assetId: createAssetId(),
    src,
    name: file.name,
    mimeType: file.type,
    byteSize: file.size,
    ...dimensions,
  };
}
