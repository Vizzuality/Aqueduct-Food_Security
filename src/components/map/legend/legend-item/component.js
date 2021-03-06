import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { format } from 'd3-format';
import isEqual from 'lodash/isEqual';
import capitalize from 'lodash/capitalize';
import { Spinner } from 'aqueduct-components';
import axios from 'axios';
import { concatenation } from 'layer-manager/dist/layer-manager';
import { reduceSqlParams } from 'utils/layers/params-parser';

// constants
import { LEGEND_OPACITY_RANGE } from 'components/map/legend/constants';
import { CROP_OPTIONS } from 'constants/crops';

// utils
import { getObjectConversion } from 'utils/filters';
import { applyOpacity } from './helpers';

// components
import LegendGraph from './legend-graph';

class LegendItem extends PureComponent {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      loading: true,
      layer: props.layer
    };
  }

  componentDidMount() {
    this.getLegendData();
  }

  componentWillReceiveProps(nextProps) {
    if (isEqual(this.props, nextProps)) return;
    const newState = {
      ...nextProps,
      loading: true
    };
    this.setState(newState, this.getLegendData);
  }

  getLegendData() {
    const { filters } = this.props;
    const { layer } = this.state;
    const { layerConfig, legendConfig } = layer;


    if (!legendConfig.sql_query) {
      this.setState({ loading: false });

      return;
    }

    const legendConfigConverted = Object.assign({}, getObjectConversion(
      legendConfig,
      {
        ...filters,
        iso: filters.iso || 'WORLD'
      },
      'water',
      legendConfig.params_config,
      legendConfig.sql_config
    ));

    const _filters = {
      ...filters,
      iso: filters.iso || 'WORLD'
    };
    const { crop } = _filters;
    const { sql_query: sqlQuery, sql_config: sqlConfig } = legendConfig;
    const _sqlParams = reduceSqlParams(sqlConfig, _filters);
    const query = concatenation(sqlQuery, _sqlParams);

    axios.get(`https://${layerConfig.account}.carto.com/api/v2/sql?q=${query}`)
      .then(({ data }) => {
        const buckets = data.rows[0].bucket;

        if (buckets === null || !buckets.length) {
          this.setState({
            loading: false,
            error: 'Data not available',
            layer: {
              ...layer,
              name: capitalize(crop)
            }
          });

          return;
        }

        const { color } = CROP_OPTIONS.find(c => c.value === crop) || {};
        const items = buckets.map((bucket, i) => ({
          value: `(< ${format('.3s')(bucket)})`,
          color: applyOpacity(color, LEGEND_OPACITY_RANGE[i]),
          name: ''
        }));

        const newlegendConfig = {
          ...legendConfigConverted,
          ...{ items }
        };

        this.setState({
          error: null,
          loading: false,
          layer: {
            ...layer,
            legendConfig: newlegendConfig,
            name: capitalize(crop)
          }
        });
      })
      .catch((err) => { throw err; });
  }


  triggerAction(action) {
    const { onToggleInfo, layer } = this.props;
    if (action === 'info') {
      if (onToggleInfo) onToggleInfo(layer);
    }
  }

  render() {
    const {
      layer,
      loading,
      error
    } = this.state;

    return (
      <li className="c-legend-item">
        {!error
          ? <LegendGraph config={layer.legendConfig} />
          : <span className="error-message">{error}</span>
        }
        {loading && <Spinner isLoading={loading} />}
      </li>
    );
  }
}

LegendItem.propTypes = {
  layer: PropTypes.object.isRequired,
  filters: PropTypes.object.isRequired,
  onToggleInfo: PropTypes.func
};

LegendItem.defaultProps = {
  onToggleInfo: null,
  waterLayerName: null
};

export default LegendItem;
