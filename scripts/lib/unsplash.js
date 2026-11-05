// Unsplash API. Images are hotlinked and credited, and the download endpoint is called on use.
const { retry } = require("./retry");

const API = "https://api.unsplash.com";
const headers = (key) => ({ Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });

async function searchPhotos(query, key, fetchImpl = fetch) {
  return retry(async () => {
    const url = `${API}/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=8&content_filter=high`;
    const response = await fetchImpl(url, { headers: headers(key), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Unsplash search HTTP ${response.status}`);
    return (await response.json()).results || [];
  }, { label: "Unsplash search" });
}

function toCandidate(photo) {
  return {
    id: photo.id,
    url: photo.urls.raw,
    thumb: photo.urls.small,
    width: photo.width,
    height: photo.height,
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html,
    downloadLocation: photo.links.download_location,
    description: photo.alt_description || photo.description || "",
  };
}

// Required by Unsplash once a photo is really used.
async function triggerDownload(downloadLocation, key, fetchImpl = fetch) {
  return retry(async () => {
    const response = await fetchImpl(downloadLocation, { headers: headers(key), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Unsplash download HTTP ${response.status}`);
  }, { label: "Unsplash download" });
}

async function downloadThumb(url, fetchImpl = fetch) {
  return retry(async () => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Thumbnail HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }, { label: "Thumbnail" });
}

module.exports = { searchPhotos, toCandidate, triggerDownload, downloadThumb };
