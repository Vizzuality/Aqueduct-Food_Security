import { createSelector } from 'reselect';
import { widgetsFilter } from 'aqueduct-components';

// Get the datasets and filters from state
const datasets = state => state.datasets;
const filters = state => state.filters;
const compare = state => state.compare;

// Create a function to compare the current active datasets and the current datasetsIds
const getActiveWidgets = (_datasets, _filters, _compare) => {
  // TODO: filter _datasets using _filters
  const widgetList = [];
  let widget;

  _datasets.list.forEach((dataset) => {
    if (dataset.widget && dataset.widget.length) {
      widget = Object.assign({}, dataset.widget[0].attributes, {
        id: dataset.widget[0].id,
        metadata: (dataset.metadata && dataset.metadata.length) ? dataset.metadata[0].attributes : null
      });

      // NOTE: legacy vocabulary stores former used tags
      const vocabulary = dataset.vocabulary.find(v => v.attributes.name === 'legacy');
      const datasetTags = vocabulary ? vocabulary.attributes.tags : null;

      // Vega type widget doesn't have 'type' property
      if (widget.widgetConfig && (!Object.prototype.hasOwnProperty.call(widget.widgetConfig, 'type') || widget.widgetConfig.type === 'text') && widgetsFilter(widget, _filters, _compare, datasetTags)) {
        widgetList.push(widget);
      }
    }
  });
  return widgetList;
};

// Export the selector
export default createSelector(
  datasets,
  filters,
  compare,
  getActiveWidgets
);
