import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import districtsUrl from '../data/bkk_districts.geojson?url';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  center: [100.5018, 13.7563],
  zoom: 15,
  pitch: 60,
  bearing: -20,
  maxPitch: 80,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

map.on('load', () => {
  // Insert our layers under the first label layer so street names stay readable.
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;

  map.addSource('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      'Powered by <a href="https://www.esri.com">Esri</a> | Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  });
  map.addLayer(
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
    firstLabel,
  );

  map.addSource('terrain', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
    attribution:
      '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain Tiles</a> (Mapzen/Tilezen, AWS Open Data; SRTM, GMTED2010, ETOPO1)',
  });

  // OSM building heights from OpenMapTiles (render_height is metres, already
  // defaulted by OpenMapTiles when building:levels / height are missing).
  map.addLayer(
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'], 0, '#3a4a6e', 60, '#5b77a8', 200, '#8fb4e8'],
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.85,
      },
    },
    firstLabel,
  );

  map.addSource('districts', {
    type: 'geojson',
    data: districtsUrl,
    attribution: 'เขต: <a href="https://github.com/chingchai/OpenGISData-Thailand">OpenGISData-Thailand</a> (chingchai)',
  });
  map.addLayer({
    id: 'district-lines',
    type: 'line',
    source: 'districts',
    paint: { 'line-color': '#38bdf8', 'line-width': 1.2, 'line-opacity': 0.7 },
  });

  // Wired after load so a click can't hit layers/sources that don't exist yet.
  const toggle = (id: string, fn: (on: boolean) => void) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.addEventListener('change', () => fn(el.checked));
  };
  const setVis = (layer: string, on: boolean) => map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');

  toggle('lySat', (on) => setVis('satellite', on));
  toggle('lyBuild', (on) => setVis('buildings-3d', on));
  toggle('lyTerrain', (on) => {
    map.setTerrain(on ? { source: 'terrain', exaggeration: 1.5 } : null);
    document.getElementById('terrainNote')!.hidden = !on;
  });
});
