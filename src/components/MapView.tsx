import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { cx } from '@/lib/cx'

/*
 * Leaflet with OpenStreetMap tiles — the same data the rest of the app uses, and
 * no key or account required.
 *
 * Plain Leaflet rather than react-leaflet: the wrapper's value is mostly in
 * declarative children, and this needs one imperative effect that diffs markers.
 * It also sidesteps react-leaflet's version coupling to React.
 *
 * Default Leaflet markers are avoided deliberately — their icon URLs break under
 * bundlers. These are `divIcon`s, which also lets them carry the app's palette.
 */

export interface MapMarker {
  id: string
  lat: number
  lon: number
  label: string
  kind: 'place' | 'event'
}

const MARKER_STYLES: Record<MapMarker['kind'], { fill: string; ring: string }> = {
  place: { fill: '#FFC820', ring: '#8F5E00' },
  event: { fill: '#FB6C9C', ring: '#8D2650' },
}

function markerIcon(marker: MapMarker, selected: boolean): L.DivIcon {
  const { fill, ring } = MARKER_STYLES[marker.kind]
  const size = selected ? 30 : 20

  return L.divIcon({
    className: '',
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:9999px;
      background:${fill};border:2.5px solid #fff;
      box-shadow:0 2px 6px rgb(59 42 26 / .45)${selected ? `, 0 0 0 4px ${ring}55` : ''};
      transition:width .15s, height .15s;
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function youAreHereIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;
      background:#16A48F;border:3px solid #fff;box-shadow:0 0 0 6px rgb(22 164 143 / .25);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

interface MapViewProps {
  center: { lat: number; lon: number }
  markers: MapMarker[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}

export function MapView({ center, markers, selectedId, onSelect, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const youRef = useRef<L.Marker | null>(null)
  // Keeps the marker effect from depending on a new function identity each render.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Create once. Leaflet owns this DOM node, so React must not re-render into it.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lon],
      zoom: 13,
      zoomControl: true,
      // Trackpad pinch on a page-length map otherwise hijacks scrolling.
      scrollWheelZoom: false,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      youRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once on purpose
  }, [])

  // Recentre when the user's location changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    map.setView([center.lat, center.lon], map.getZoom(), { animate: true })

    youRef.current?.remove()
    youRef.current = L.marker([center.lat, center.lon], {
      icon: youAreHereIcon(),
      interactive: false,
      zIndexOffset: -100,
    }).addTo(map)
  }, [center.lat, center.lon])

  // Redraw markers on any change to the set or the selection.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    layer.clearLayers()

    for (const marker of markers) {
      const selected = marker.id === selectedId
      L.marker([marker.lat, marker.lon], {
        icon: markerIcon(marker, selected),
        title: marker.label,
        // Keeps the selected pin above its neighbours.
        zIndexOffset: selected ? 1000 : 0,
        keyboard: true,
        alt: marker.label,
      })
        .on('click', () => onSelectRef.current(marker.id))
        .bindTooltip(marker.label, { direction: 'top', offset: [0, -12] })
        .addTo(layer)
    }
  }, [markers, selectedId])

  // Pan a newly-selected marker into view without changing zoom.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return

    const selected = markers.find((marker) => marker.id === selectedId)
    if (selected) map.panTo([selected.lat, selected.lon], { animate: true })
  }, [selectedId, markers])

  return (
    <div
      ref={containerRef}
      /*
       * `isolate` is load-bearing. Leaflet gives its internal panes z-index values
       * up to 800, and `.leaflet-container` itself has `z-index: auto`, so those
       * panes escape into the root stacking context and paint over the sticky
       * header and the detail panel's scrim. Creating a stacking context here
       * traps them inside the map, where they belong.
       */
      className={cx('isolate', className)}
      role="application"
      aria-label="Map of nearby places"
    />
  )
}
