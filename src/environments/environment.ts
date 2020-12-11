// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  layerConfig:'assets/config/layers.json',
  basemapConfig:'assets/config/basemaps.json',
  tds:'http://dapds00.nci.org.au/thredds',
  pointConfig:'assets/config/points.json',
  wms: 'https://australia-southeast1-wald-1526877012527.cloudfunctions.net/tree-change',
  wps: 'https://australia-southeast1-wald-1526877012527.cloudfunctions.net/tree-change-drill',
  registration: 'https://australia-southeast1-wald-1526877012527.cloudfunctions.net/tree_change_users',
  geojsons: 'assets/selection_layers/'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.