import type { ImageInput, UploadSignature } from './api'

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined

export const MAX_IMAGES = 10
export const MAX_BYTES = 10 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function imageUrl(publicId: string, width: number) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width}/${publicId}`
}

export function srcSet(publicId: string) {
  return [400, 800, 1200, 1600].map((w) => `${imageUrl(publicId, w)} ${w}w`).join(', ')
}

/** Returns an error message, or null when the file may be uploaded. */
export function checkFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return `${file.name}: only JPEG, PNG, WebP or GIF images are allowed.`
  if (file.size > MAX_BYTES) return `${file.name}: images must be 10 MB or smaller.`
  return null
}

export async function uploadImage(file: File, sig: UploadSignature): Promise<ImageInput> {
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('folder', sig.folder)
  form.append('allowed_formats', sig.allowedFormats)
  form.append('signature', sig.signature)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed for ${file.name}`)
  const data = await res.json()
  return {
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    format: data.format,
    bytes: data.bytes,
    altText: null,
  }
}
