import { useRef, useState, type KeyboardEvent } from 'react'
import type { Image } from '../api'
import { imageUrl, srcSet } from '../cloudinary'
import { Icon } from './Icon'

/** `card`: fixed 4:5 crop for the feed. `post`: whole images, edge-to-edge inside the post card. */
export function ImageSlider({ images, title, variant }: { images: Image[]; title: string; variant?: 'card' | 'post' }) {
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const total = images.length

  function go(next: number) {
    const i = Math.max(0, Math.min(total - 1, next))
    setIndex(i)
    const track = trackRef.current
    track?.scrollTo?.({ left: i * track.clientWidth })
    // The arrow at the end gets disabled (and hidden); keep keyboard focus on the other one instead of losing it.
    // (after the re-render, since the other arrow may still be disabled right now).
    const active = document.activeElement
    if (i === total - 1 && active === nextRef.current) setTimeout(() => prevRef.current?.focus())
    if (i === 0 && active === prevRef.current) setTimeout(() => nextRef.current?.focus())
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  // Keep the counter in sync when the reader swipes.
  function onScroll() {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const i = Math.round(track.scrollLeft / track.clientWidth)
    if (i !== index) setIndex(i)
  }

  return (
    <section aria-roledescription="carousel" aria-label={`Images for ${title}`} onKeyDown={onKeyDown}>
      <div className={variant ? `slider ${variant}-slider` : 'slider'}>
        <div ref={trackRef} className="slider-track" onScroll={onScroll}>
          {images.map((img, i) => (
            <div key={img.publicId} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`} aria-hidden={i !== index}>
              <img
                src={imageUrl(img.publicId, 1200)}
                srcSet={srcSet(img.publicId)}
                sizes="(max-width: 640px) 100vw, 640px"
                width={img.width}
                height={img.height}
                alt={img.altText || `Image ${i + 1} of ${total} for ${title}`}
                loading={i === 0 && variant !== 'card' ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
        {total > 1 && (
          <>
            <span className="badge" aria-live="polite" aria-atomic="true">
              {index + 1} / {total}
            </span>
            <button ref={prevRef} type="button" className="slider-nav prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous image">
              <Icon name="chevronLeft" size={20} />
            </button>
            <button ref={nextRef} type="button" className="slider-nav next" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Next image">
              <Icon name="chevronRight" size={20} />
            </button>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="dots">
          {images.map((img, i) => (
            <button
              key={img.publicId}
              type="button"
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
