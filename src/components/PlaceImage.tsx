import { useState } from 'react'
import type { Photo } from '@/lib/api'
import { sceneVariantFor, seedFor } from '@/lib/scene'
import { Scene } from './Scene'

interface PlaceImageProps {
  id: string
  name: string
  hue: string
  photo: Photo | null
  className?: string
  /** Larger images load eagerly; cards below the fold should stay lazy. */
  priority?: boolean
}

/**
 * A place's preview: its real photograph when one could be verified, and the
 * generated scene otherwise.
 *
 * Most places take the fallback and always will — only about a quarter of
 * escapes and almost no everyday cafés have a Wikipedia article to source a
 * photo from (see server/src/photos.ts for why nothing looser is used). So the
 * artwork is the normal case, not an error state, and nothing here marks a
 * missing photo as a failure.
 *
 * A photo that 404s or is blocked falls back to the same artwork rather than
 * leaving a broken-image box, since the URL points at Wikimedia rather than
 * anything this app controls.
 */
export function PlaceImage({
  id,
  name,
  hue,
  photo,
  className = '',
  priority = false,
}: PlaceImageProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!photo || failed) {
    return <Scene seed={seedFor(id)} variant={sceneVariantFor(hue)} className={className} />
  }

  return (
    <>
      {/*
       * The artwork stays mounted underneath until the photo paints, so the card
       * never flashes an empty grey box on a slow connection — Wikimedia
       * thumbnails are served from Europe and can take a moment.
       */}
      {!loaded && (
        <Scene seed={seedFor(id)} variant={sceneVariantFor(hue)} className={className} />
      )}
      <img
        src={photo.url}
        alt={name}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${className} object-cover transition-opacity duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  )
}

/**
 * Photographer and licence, required by the CC licences Commons photos carry.
 *
 * Deliberately quiet but always present when a photo is shown — the licences
 * ask for credit, not for prominence.
 */
export function PhotoCredit({ photo, className = '' }: { photo: Photo; className?: string }) {
  const label = photo.credit ?? 'Wikimedia Commons'
  return (
    <a
      href={photo.articleUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(event) => event.stopPropagation()}
      title={`Photo from the Wikipedia article “${photo.articleTitle}” — ${label}`}
      className={`max-w-full truncate text-[11px] leading-none text-white/85 underline-offset-2 hover:underline ${className}`}
    >
      {label}
    </a>
  )
}
