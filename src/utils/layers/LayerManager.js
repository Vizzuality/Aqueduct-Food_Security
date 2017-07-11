import L from 'leaflet/dist/leaflet';
import template from 'lodash/template';

// AQ components
import { CROP_OPTIONS, get, getObjectConversion } from 'aqueduct-components';

// Layers
import BubbleClusterLayer from 'utils/layers/markers/BubbleClusterLayer';

// constants
import layerSpec from 'utils/layers/layer_spec.json';
const ZOOM_DISPLAYS_TOP = [2, 3];

export default class LayerManager {

  // Constructor
  constructor(map, options = {}) {
    this._map = map;
    this._mapLayers = {};
    this._markerLayers = {};
    this._mapRequests = {};
    this._mapLayersLoading = {};
    this._rejectLayersLoading = false;
    this._onLayerAddedSuccess = options.onLayerAddedSuccess;
    this._onLayerAddedError = options.onLayerAddedError;
  }

  /*
    Public methods
  */
  addLayer(layer, opts = {}) {
    const method = {
      cartodb: this._addCartoLayer
    }[layer.provider];

    method && method.call(this, layer, opts);
  }

  removeLayer(layerId) {
    if (this._mapLayers[layerId]) {
      this._map.removeLayer(this._mapLayers[layerId]);
      delete this._mapLayers[layerId];
    }
  }

  removeLayers() {
    Object.keys(this._mapLayers).forEach((id) => {
      if (this._mapLayers[id]) {
        this._map.removeLayer(this._mapLayers[id]);
        delete this._mapLayers[id];
      }
    });
    this._mapLayersLoading = {};
  }

  _addMarkers(geojson, layer) {
    this.removeLayer(layer.id);
    this._mapLayers[layer.id] = new BubbleClusterLayer(
      geojson, layer
    ).addTo(this._map);
  }

  static _getMarkerConfig(markers) {
    const markerValues = markers.map(marker => marker.properties.value);

    return {
      maxValue: Math.max(...markerValues)
    };
  }

  _setMarkers(layer, zoomLevels) {
    const { id } = layer || {};
    const { prevZoom, nextZoom } = zoomLevels || {};

    // prevents set markers if zoom is still in same range
    if ((!!prevZoom &&
      !ZOOM_DISPLAYS_TOP.includes(prevZoom) && !ZOOM_DISPLAYS_TOP.includes(nextZoom)) ||
      ZOOM_DISPLAYS_TOP.includes(prevZoom) && ZOOM_DISPLAYS_TOP.includes(nextZoom)) return;

    const markers = this._getMarkersByZoom(layer, nextZoom);
    const markerConfig = LayerManager._getMarkerConfig(markers);
    this._addMarkers(markers, layer, markerConfig);
  }

  _getMarkersByZoom(layer, zoom) {
    const { id, options } = layer;
    const { sort, topSize } = options || {};
    let newMarkers = this._markerLayers[id];
    if (!newMarkers) return [];

    const sortFunction = (a, b) => {
      const valueA = Math.abs(+a.properties.value);
      const valueB = Math.abs(+b.properties.value);

      if (valueA < valueB) return sort === 'desc' ? 1 : -1;
      if (valueA > valueB) return sort === 'desc' ? -1 : 1;
      return 0;
    };

    if(ZOOM_DISPLAYS_TOP.includes(zoom)) {
      if (sort) newMarkers.sort(sortFunction);
      if (topSize && newMarkers.length >= topSize) newMarkers = newMarkers.slice(0, topSize);
    }

    return newMarkers;
  }

  /**
   * PRIVATE METHODS
   * - _addLoader
   * - _removeLoader
  */
  _addLoader(id) {
    this._mapLayersLoading[id] = true;
  }

  _deleteLoader(id) {
    delete this._mapLayersLoading[id];
    // Check if all the layers are loaded
    if (!Object.keys(this._mapLayersLoading).length) {
      this._onLayerAddedSuccess && this._onLayerAddedSuccess();
    }
  }

  static _generateCartoCSS(_layerConfig, params) {
    const { bucket, crop } = params;
    const cartoCss = _layerConfig.body.layers[0].options.cartocss;
    const cartoCssTemplate = template(cartoCss, { interpolate: /{{([\s\S]+?)}}/g });
    const color = CROP_OPTIONS.find(c => c.value === crop).color;

    return cartoCssTemplate({ bucket, color });
  }

  _getLegendValues(layerConfig, legendConfig, options) {
    const layerConfigConverted = getObjectConversion(layerConfig, options, 'water');
    const legendConfigConverted = getObjectConversion(legendConfig, options, 'water');

    // Save loader
    this._addLoader(layerConfig.id);

    // Save request && send
    this._mapRequests[layerConfig.category] = get({
      url: `https://${layerConfig.account}.carto.com/api/v2/sql?q=${legendConfigConverted.sqlQuery}`,
      onSuccess: (data) => {
        const bucket = data.rows[0].bucket;
        if (bucket === null || !bucket) {
          console.error('No buckets available');
          this._deleteLoader(layerConfig.id);
          return;
        }

        const layerConfigParsed = {
          ...layerConfigConverted,
          ...{ body: LayerManager._getLayerConfigParsed(layerConfigConverted) }
        };

        layerConfigParsed.body.layers[0].options.cartocss = this._generateCartoCSS(layerConfig, { bucket, crop: options.crop });

        const layerTpl = {
          version: '1.3.0',
          stat_tag: 'API',
          layers: layerConfigParsed.body.layers
        };

        // Save request && send
        this._mapRequests[layerConfig.category] = get({
          url: `https://${layerConfigParsed.account}.carto.com/api/v1/map?stat_tag=API&config=${encodeURIComponent(JSON.stringify(layerTpl))}`,
          onSuccess: (layerData) => {
            const tileUrl = `https://${layerConfigParsed.account}.carto.com/api/v1/map/${layerData.layergroupid}/{z}/{x}/{y}.png`;

            this._mapLayers[layerConfigParsed.id] = L.tileLayer(tileUrl).addTo(this._map).setZIndex(999);

            this._mapLayers[layerConfigParsed.id].on('load', () => {
              this._deleteLoader(layerConfigParsed.id);
            });

            this._mapLayers[layerConfigParsed.id].on('tileerror', () => {
              this._deleteLoader(layerConfigParsed.id);
            });
          },
          onError: (layerData) => {
            console.error(layerData);
            this._deleteLoader(layerConfig.id);
          }
        });
      },
      onError: (data) => {
        console.error(data);
        this._deleteLoader(layerConfig.id);
      }
    });
  }

  static _getLayerConfigParsed(_layerConfig) {
    return {
      layers: _layerConfig.body.layers.map((l) => {
        const newOptions = { user_name: _layerConfig.account, cartocss_version: l.options.cartocssVersion };
        const options = { ...l.options, ...newOptions };
        return { ...l, options };
      })
    };
  }

  _addCartoLayer(layerSpec, opts) {
    const layerConfig = {
      ...layerSpec.layerConfig,
      ...{ id: layerSpec.id, category: layerSpec.category }
    };
    const legendConfig = layerSpec.legendConfig;

    const options = opts;

    if (this._mapRequests[layerConfig.category]) {
      if (this._mapRequests[layerConfig.category].readyState !== 4) {
        this._mapRequests[layerConfig.category].abort();
        delete this._mapRequests[layerConfig.category];
        this._deleteLoader(layerConfig.id);
      }
    }

    switch (layerConfig.category) {
      case 'water': {
        // Parse config
        const layerConfigConverted = getObjectConversion(layerConfig, options, 'water');
        const layerConfigParsed = {
          ...layerConfigConverted,
          ...{ body: LayerManager._getLayerConfigParsed(layerConfigConverted) }
        };

        const layerTpl = {
          version: '1.3.0',
          stat_tag: 'API',
          layers: layerConfigParsed.body.layers
        };

        // Save loader
        this._addLoader(layerConfig.id);

        // Save request && send
        this._mapRequests[layerConfig.category] = get({
          url: `https://${layerConfig.account}.carto.com/api/v1/map?stat_tag=API&config=${encodeURIComponent(JSON.stringify(layerTpl))}`,
          onSuccess: (data) => {
            const tileUrl = `${data.cdn_url.templates.https.url}/${layerConfig.account}/api/v1/map/${data.layergroupid}/{z}/{x}/{y}.png`;

            this._mapLayers[layerConfig.id] = L.tileLayer(tileUrl).addTo(this._map).setZIndex(998);

            this._mapLayers[layerConfig.id].on('load', () => {
              this._deleteLoader(layerConfig.id);
            });
            this._mapLayers[layerConfig.id].on('tileerror', () => {
              this._deleteLoader(layerConfig.id);
            });
          },
          onError: (data) => {
            console.error(data);
            this._deleteLoader(layerConfig.id);
          }
        });
        break;
      }

      case 'food': {
        // Parse config
        const layerConfigConverted = getObjectConversion(layerConfig, options, 'food');

        // Save loader
        this._addLoader(layerConfig.id);

        // Save request && send
        this._mapRequests[layerConfig.category] = get({
          url: layerConfigConverted.body.url,
          onSuccess: (data) => {
            const geojson = data.rows[0].data.features || [];
            const nextZoom = this._map.getZoom();
            this._markerLayers[layerConfig.id] = geojson;

            this._setMarkers(layerSpec, { nextZoom });
            this._deleteLoader(layerConfig.id);
          },
          onError: (data) => {
            console.error(data);
            this._deleteLoader(layerConfig.id);
          }
        });
        break;
      }

      default: {
        if (legendConfig.sqlQuery) {
          return this._getLegendValues(layerConfig, legendConfig, options);
        }
        const layerConfigConverted = getObjectConversion(layerConfig, options, 'water');
        const layerConfigParsed = {
          ...layerConfigConverted,
          ...{ body: LayerManager._getLayerConfigParsed(layerConfigConverted) }
        };

        const layerTpl = {
          version: '1.3.0',
          stat_tag: 'API',
          layers: layerConfigParsed.body.layers
        };

        // Save loader
        this._addLoader(layerConfig.id);

        // Save request && send
        this._mapRequests[layerConfig.category] = get({
          url: `https://${layerConfig.account}.carto.com/api/v1/map?stat_tag=API&config=${encodeURIComponent(JSON.stringify(layerTpl))}`,
          onSuccess: (data) => {
            const tileUrl = `${data.cdn_url.templates.https.url}/${layerConfig.account}/api/v1/map/${data.layergroupid}/{z}/{x}/{y}.png`;

            this._mapLayers[layerConfig.id] = L.tileLayer(tileUrl).addTo(this._map).setZIndex(999);

            this._mapLayers[layerConfig.id].on('load', () => {
              this._deleteLoader(layerConfig.id);
            });
            this._mapLayers[layerConfig.id].on('tileerror', () => {
              this._deleteLoader(layerConfig.id);
            });
          },
          onError: (data) => {
            console.error(data);
            this._deleteLoader(layerConfig.id);
          }
        });
        break;
      }
    }
  }
}
