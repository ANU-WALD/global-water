import { Component, OnInit, Input, OnChanges, SimpleChanges, ViewChild, NgModuleRef } from '@angular/core';
import * as L from 'leaflet';
import { environment } from 'src/environments/environment';
import { parseCSV, TableRow, Bounds, InterpolationService, UTCDate, RangeStyle, PaletteService } from 'map-wald';
import { ChartEntry, ChartSeries } from '../chart/chart.component';
import { LayerDescriptor, LegendResponse, MapSettings, DisplaySettings, PaletteDescriptor, 
         DisplaySettingsChange, LayerVariant, FlattenedLayerDescriptor } from '../data';
import { ConfigService } from '../config.service';
import { LeafletService, OneTimeSplashComponent, BasemapDescriptor,
  VectorLayerDescriptor, PointMode, makeColour } from 'map-wald-leaflet';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
// import { DownloadFormComponent } from '../download-form/download-form.component';
// import * as store from 'store';
// import * as FileSaver from 'file-saver';
import area from '@turf/area';
import { LayersService } from '../layers.service';
import { PointDataService } from '../point-data.service';
import { forkJoin, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import * as R from 'ramda';
import { CacheService } from '../cache.service';

declare var gtag: (a: string,b: string,c?: any) => void;

// const VECTOR_TILE_URL = 'https://storage.googleapis.com/wald-vector/tileserver/{z}/{x}/{y}.pbf';
// const FEATURE_ID_COL='PR_PY_PID';

const POINT_FEATURE_SIZE = 1;

const SUPER2='²';
const DECIMAL_PLACES=1;
const FULL_EXTENT: Bounds = {
  west: -165,
  north: 40,
  south: -40,
  east: 165
};
const DATA_COLUMNS=['date','value'];
const DEFAULT_DELTA_OFFSET=-50;
const INITIAL_OPACITY=75;//%
const DEFAULT_PALETTE:PaletteDescriptor = {
  name:'YlOrBr',
  count:6,
  reverse:false
};

const INITIAL_MAP_SETTINGS:MapSettings = {
  date: new Date(),
  layer: null as LayerDescriptor,
  opacity: INITIAL_OPACITY,
  relative: false,
  relativeVariable: '',
  dateStep: 7
};

const CHART_PROMPTS = {
  predefined: 'Select a region',
  draw: 'Draw a region',
  point: 'Select a point'
};

@Component({
  selector: 'app-main-map',
  templateUrl: './main-map.component.html',
  styleUrls: ['./main-map.component.scss']
})
export class MainMapComponent implements OnInit, OnChanges {
  @Input() date: UTCDate;
  @Input() layer: LayerDescriptor;
  @ViewChild('splash', { static: true }) splash: OneTimeSplashComponent;

  layerDates: UTCDate[] = [];
  dateFormat = '%B/%Y';

  mapConfig = {
    latLngSelection: false,
    enableDrawing: false,
    showVectors: false
  };

  mapSettings: MapSettings = Object.assign({},INITIAL_MAP_SETTINGS);
  pointMode = PointMode;
  selectedFeatureNumber = 0;
  selectedPolygonFeature: GeoJSON.Feature<GeoJSON.GeometryObject>;
  polygonFeaturesForSelectedPoint: GeoJSON.FeatureCollection<GeoJSON.Polygon>;

  zoom: number;
  vectorLayers: VectorLayerDescriptor[];
  vectorLayer: VectorLayerDescriptor;
  showWindows = true;
  basemap: BasemapDescriptor;
  // transparency = 0;
  mapRelativeMode: string;

  pointLayerFeatures: any;

  opacity = INITIAL_OPACITY;
  // get opacity(): number {
  //   return 1-0.01*this.transparency;
  // }

  layers: LayerDescriptor[];
  basemaps: BasemapDescriptor[];
  bounds: Bounds;
  maxBounds = Object.assign({},FULL_EXTENT);
  map: L.Map;
  mapLayer: L.TileLayer;
  baseMapURL: string;
  wmsURL:string;
  wmsParams: any = {};
  vectorStyles: any = {};
  rawChartData: ChartSeries;
  chartPolygonLabel: string;
  legend = {
    colours: [] as string[],
    labels: [] as string[],
    shape: ['']
  }

  polygonMode: 'point' | 'predefined' | 'draw' = 'predefined';
  chartPrompt = CHART_PROMPTS;

  layerVariants:LayerVariant[] = [];
  selectedVariant:LayerVariant;
  layerSettingsFlat: FlattenedLayerDescriptor;

  // Not used?
  featureStats = {
    area: null as number,
    areaUnits: 'km'+SUPER2
  };

  siteStyles = {
    fill: null as RangeStyle<string>,
    size: null as RangeStyle<number>
  }

  constructor(private http: CacheService,
              private appConfig: ConfigService,
              private _map: LeafletService,
              private modalService: NgbModal,
              private layersService: LayersService,
              private pointData: PointDataService,
              private palettes: PaletteService ) {
    this.resetBounds();

    this.appConfig.vectorLayers$.subscribe(layers=>{
      this.vectorLayers = layers;
      this.configureVectorLayer(layers[0]);
    });

    this.appConfig.basemaps$.subscribe(basemaps=>{
      this.basemaps = basemaps;
      this.basemap = this.basemaps[0];
      this.basemapChanged();
    });

    this.layersService.layerConfig$.subscribe(layers=>{
      this.layers = layers;
      this.mapSettings.layer = this.layers[0];
      this.date = this.mapSettings.layer.timePeriod?.end;
      this.applySettings();
    });
  }

  ngOnInit(): void {
    gtag('send', 'pageview');
    this.applySettings();

    this._map.withMap(m=>{
      this.zoom = m.getZoom();
      m.on('zoom',()=>{
        this.zoom = m.getZoom();
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.applySettings();
  }

  updateMapConfig(): void {
    const cfg = this.mapConfig;
    const pd = this.layer?.polygonDrill;
    cfg.latLngSelection = pd && (this.polygonMode==='point');
    cfg.enableDrawing =   pd && (this.polygonMode==='draw');
    cfg.showVectors =     pd && (this.polygonMode==='predefined');
    // this.mapConfig = Object.assign({},cfg);
    console.log('updateMapConfig',this.mapConfig);
  }

  interpolationSubstitutions(): any {
    const subs:any = {};

    if(this.date){
      subs.year = this.date.getUTCFullYear();
      subs.month = pad(this.date.getUTCMonth() + 1);
      subs.day = pad(this.date.getUTCDate());
    }
    return subs;
  }

  dateChange(): void {
    this.setupMapLayer();
  }

  mapFilename(): string {
    // TODO: Should this be layerSettingsFlat?
    if(!this.layer){
      return '';
    }
    return InterpolationService.interpolate(this.layer.filename || '',this.interpolationSubstitutions());
  }

  mapUrl(): string {
    // TODO: Should this be layerSettingsFlat?
    if(!this.layer){
      return null;
    }

    if(this.layer.type!=='grid'){
      return null;
    }

    if(this.layer.source==='tds'){
      return `${environment.tds}/wms/${this.mapFilename()}`;
    }

    return this.layer.url;
  }

  substituteParameters(params: any): any{
    const subs = this.interpolationSubstitutions();

    const result:any = {};
    Object.keys(params).forEach(k=>{
      if(typeof(k)==='string'){
        result[k] = InterpolationService.interpolate(params[k],subs);
      } else {
        result[k] = params[k];
      }
    });

    return result;
  }

  variantChanged():void{
    this.setupMapLayer();
    this.chartPolygonTimeSeries();
  }

  setupMapLayer(): void {
    if(!this.layer){
      return;
    }

    this.layerSettingsFlat = Object.assign({},this.layer,this.selectedVariant);
    this.wmsParams = null;
    this.pointLayerFeatures = null;

    if(this.layerSettingsFlat.type==='grid'){
      this.setupWMSLayer();
    } else {
      this.setupPointLayer();
    }
  }

  private setupPointLayer(): void {
    let palette = this.layerSettingsFlat.palette || DEFAULT_PALETTE;
    // if(this.mapRelativeMode){
    //   palette = this.layer.relativeOptions[this.mapRelativeMode]?.palette || palette;
    // }

    forkJoin([
      this.pointData.getValues(this.layerSettingsFlat,{},this.date,null,this.mapRelativeMode),
      this.palettes.getPalette(palette.name,palette.reverse,palette.count)
    ]).subscribe(([features,palette]) => {
      palette = palette.map(c=>c.replace(')',',0.5)').replace('rgb','rgba'));
      this.pointLayerFeatures = features;
      const max = Math.max(...(features.features).map(f=>f.properties.value));
      const breaks = [0, max/10, 2*max/10, 3*max/10, 4*max/10, 5*max/10];
      this.siteStyles.fill = new RangeStyle('value',palette,breaks);
      // this.siteSize = new RangeStyle('value',[1,2,3,5,8,13,21],breaks);
      this.siteStyles.size = new RangeStyle('value',[5,5,5,5,5,5,5],breaks);
      this.legend.colours = palette.slice().reverse();
      this.legend.labels = this.getLabels(this.siteStyles.fill).reverse();
      this.legend.shape[0] = 'circle';
    });
  }

  getLabels(range:RangeStyle<any>,digits?:number):string[] {
    const fmt = (v:number) => v.toFixed(digits||0);
    return range.breakpoints.map((b,i)=>{
      if(i<(range.breakpoints.length-1)){
        return `${fmt(b)}-${fmt(range.breakpoints[i+1])}`;
      }
      return `> ${fmt(b)}`;
    })
  }

  private setupWMSLayer(): void {
    this.wmsURL = this.mapUrl();

    const options: any =  {
      layers: this.layerSettingsFlat.variable?this.layerSettingsFlat.variable:this.layerSettingsFlat.variables[0],
      opacity: this.opacity*0.01,
      updateWhenIdle: true,
      updateWhenZooming: false,
      updateInterval: 500,
      attribution: '<a href="http://wald.anu.edu.au/">WALD ANU</a>'
    };

    // if(this.layer.options&&this.layer.options.temporal){
    //   options.time =`${this.year}-01-01T00:00:00.000Z`;

    //   if(this.layer.options.delta&&this.difference){
    //     options.time_diff=`${this.referenceYear}-01-01T00:00:00.000Z`;
    //     options.layers += 'd';
    //   }
    // }

    // if(this.binary&&this.layer.options.threshold){
    //   options.threshold = this.threshold;
    // }

    this.wmsParams = this.substituteParameters(Object.assign({},options,this.layerSettingsFlat.mapParams||{}));
    // this.mapLayer = L.tileLayer.wms(environment.wms,options as L.WMSOptions);

    // this.mapLayer.addTo(this.map);
    this.getLegendData();
  }

  getLegendData(): void {
    this.legend.colours = [];
    this.legend.colours = [];
    this.legend.shape = [];

    if(!this.layerSettingsFlat?.metadata){
      return;
    }

    const url = InterpolationService.interpolate(
      this.layerSettingsFlat.metadata,this.layerSettingsFlat);

    this.http.get(url).subscribe((metadata: LegendResponse)=>{
      const colours = R.uniq(metadata.palette.map(c=>makeColour(c.R,c.G,c.B,c.A/255)).reverse());
      this.legend.colours = colours;
      this.legend.labels = this.layerSettingsFlat.legendLabels;
      if(!this.legend.labels){
        let vals:number[];
        if(metadata.values){
          vals = metadata.values;
        } else {
          const range = metadata.max_value-metadata.min_value;
          const step = range/(colours.length-2);
          vals = [metadata.min_value];
          for(let i=1;i<colours.length-1;i++){
            vals.push(vals[i-1]+step);
          }
          vals.push(metadata.max_value);
          console.assert(vals.length===metadata.palette.length);
        }

        this.legend.labels = vals.map((v,i)=>{
          const txt = v.toFixed();
          if(!i){
            return `< ${txt}`;
          }
          if(i===vals.length-1){
            return `> ${txt}`;
          }
          return `${vals[i-1].toFixed()}-${txt}`;
        }).reverse();
      }

      this.legend.shape[0] = '';
    });
  }

  setupChart(title: string, chartData: ChartEntry[]): void{
    if(!chartData) {
      this.chartPolygonLabel=null;
      this.rawChartData = null;
      return;
    }

    this.rawChartData = {
      title,
      data:chartData
    };
  }

  mapOptionsChanged(event: MapSettings): void {
    this.gaEvent('layer','wms',
      `${event.layer.label}:${(event.date as Date).toUTCString()}:${event.relative?event.relativeVariable:'-'}`);

      this.mapSettings = event;
    this.applySettings();
  }

  mapSettingChanged(event:DisplaySettingsChange): void {
    if(this[event.setting]!==undefined){
      this[event.setting] = event.value;
    }

    if(event.setting==='opacity'){
      this.setOpacity();
    }
  }

  applySettings() {
    this.mapRelativeMode = this.mapSettings.relative?this.mapSettings.relativeVariable:null;
    this.setLayer(this.mapSettings.layer);
  }

  setLayer(layer: LayerDescriptor) {
    if(this.layer===layer){
      return;
    }

    this.layer = layer;
    this.layerVariants = layer?.variants||[];
    this.selectedVariant = this.layerVariants[0];

    if(this.layer){
      this.initLayerDates();
    }

    this.setupMapLayer();

    if(!this.layer?.polygonDrill){
      this.polygonMode = 'point';
    }

    if((this.layer?.type==='grid')&&this.selectedPolygonFeature){
      this.chartPolygonTimeSeries();
    } else {
      this.selectedPolygonFeature = null;
    }

    this.updateMapConfig();
  }

  initLayerDates() {
    this.date = this.layersService.constrainDate(this.mapSettings.date,this.layer);
    this.layersService.availableDates(this.layer).subscribe(dates=>{
      this.layerDates = dates;

      if(this.layer.timePeriod?.format){
        this.dateFormat = this.layer.timePeriod.format;
      } else if(this.layer.timePeriod?.interval){
        const interval = this.layer.timePeriod.interval;
        if(interval.days){
          this.dateFormat = '%B %d, %Y';
        } else if(interval.months){
          this.dateFormat = '%B %Y';
        } else {
          this.dateFormat = '%Y';
        }
      }
    });
  }

  displayOptionsChanged(event: DisplaySettings): void {
    this.setOpacity();

    if(event.resetBounds){
      this.resetBounds();
    }

    if(event.showWindows!==undefined){
      this.showWindows = event.showWindows;
    }

    if(event.basemap){
      this.basemap = event.basemap;
      this.basemapChanged();
    }

    if(event.vectorLayer!==undefined){
      setTimeout(()=>{
        this.configureVectorLayer(event.vectorLayer);
      });
    }
  }

  pointSelected(latlng: L.LatLng): void {
    const f = makeSquareFeature(latlng);
    this.polygonFeaturesForSelectedPoint = makeFeatureCollection(f)
    this.setSelectedPolygon(f);
  }

  pointClicked(geoJSON: any): void {
    const layer = this.layer;
    this.pointData.getTimeSeries(layer.label,geoJSON).subscribe(timeseries=>{
      const chartData:ChartEntry[] = timeseries.dates.map((d,i)=>{
        return {
          date:d,
          value:timeseries.values[i]
        };
      }).filter(row=>(row.value!==null)&&!isNaN(row.value));
      this.setupChart(layer.label,chartData);
      this.chartPolygonLabel=null;
    });
  }

  cleanFeature(geoJSON:any):any {
    let points:number[][][] = geoJSON.geometry.coordinates;
    let shiftEast = false;
    let shiftWest = false; 
    do{
      shiftEast = points.every(poly=>poly.every(point=>point[0]<-180));
      shiftWest = points.every(poly=>poly.every(point=>point[0]>180));

      const shift = function(direction:number) {
        return points.map(poly=>poly.map(point=>[point[0]+direction,point[1]]));
      };
  
      if(shiftEast){
        points = shift(360);
      } else if(shiftWest){
        points = shift(-360);
      }
    } while(shiftEast||shiftWest);

    geoJSON.geometry.coordinates = points;
    return geoJSON;
  }

  getValues(geoJSON: any): Observable<TableRow[]> {
    if(!this.layer.polygonDrill){
      return of(null);
    }

    const currentSelection = this.selectedFeatureNumber;

    geoJSON = this.cleanFeature(geoJSON);
    const result$ = this.http.post(this.layer.polygonDrill,{
      product:this.layerSettingsFlat.variable,
      feature:geoJSON
    }, {
      responseType:'text'
    }).pipe(
      map(res=>{
        if(this.selectedFeatureNumber !== currentSelection) {
          return null;
        }

        const data = parseCSV(res,{
          columns:DATA_COLUMNS,
          headerRows:1
        });
        return data;
      }));
    return result$;
  }

  vectorFeatureClicked(geoJSON: any): void {
    this.selectedFeatureNumber++;
    const currentSelection = this.selectedFeatureNumber;
    const drawn = !this.mapConfig.showVectors;
    const polygonSource = drawn?'custom-drawn':this.vectorLayer.name;
    geoJSON.properties.source = polygonSource;
    this.gaEvent('action','select-polygon',`${polygonSource}`);
    const realFeature$ = (this.vectorLayer.tiles&&!drawn) ? this.fetchGeoJSON(geoJSON) : of(geoJSON);

    setTimeout(()=>{
      realFeature$.subscribe(feature=>{
        if(this.selectedFeatureNumber!==currentSelection){
          return;
        }

        this.setSelectedPolygon(feature);
      });

    });
  }

  setSelectedPolygon(feature: GeoJSON.Feature<GeoJSON.GeometryObject>) {
    this.selectedPolygonFeature = feature;
    this.setFeatureArea(feature);

    this.setupChart(null,null);
    this.chartPolygonTimeSeries();
  }

  private chartPolygonTimeSeries() {
    const layer = this.layer;
    if (!layer.polygonDrill||!this.selectedPolygonFeature) {
      return;
    }

    this.getValues(this.selectedPolygonFeature).subscribe(data => {
      if (!data?.length) {
        return;
      }

      if(layer!==this.layer){
        return;
      }

      data = data.filter(rec => rec.value !== -9999).map(rec => {
        let theDate: Date;
        if (rec.date?.getUTCFullYear) {
          theDate = rec.date;
        } else {
          const dString = '' + rec.date;
          theDate = new Date(+dString.slice(0, 4), +dString.slice(4, 6) - 1, +dString.slice(6, 8));
        }

        const result: ChartEntry = {
          date: theDate,
          value: rec.value
        };
        return result;
      });
      // data = data.reverse();
      if ((this.selectedPolygonFeature.properties.source!=='custom-drawn')&&this.vectorLayer.label) {
        this.chartPolygonLabel = InterpolationService.interpolate(this.vectorLayer.label, this.selectedPolygonFeature.properties);
      }
      this.setupChart(layer.label, data as ChartEntry[]);
    });
  }

  private setFeatureArea(feature) {
    this.featureStats.area = area(feature);
    if (this.featureStats.area < 10000) {
      this.featureStats.areaUnits = 'm' + SUPER2;
    } else if (this.featureStats.area < 1000000) {
      this.featureStats.area /= 10000;
      this.featureStats.areaUnits = 'ha';
    } else {
      this.featureStats.area /= 1000000;
      this.featureStats.areaUnits = 'km' + SUPER2;
    }

    this.featureStats.area = +this.featureStats.area.toFixed(DECIMAL_PLACES);
  }

  fetchGeoJSON(proxyFeature:any):Observable<any>{
    const id = proxyFeature.properties[this.vectorLayer.tileLayers[0].keyField];
    const url = InterpolationService.interpolate(environment.splitGeoJSONS,Object.assign({id},this.vectorLayer,proxyFeature.properties));
    return this.http.get(url).pipe(
      map((featurecollection:any)=>featurecollection.features[0])
    );
  }

  resetBounds(): void {
    this.bounds = Object.assign({},FULL_EXTENT);
  }

  configureVectorLayer(l: VectorLayerDescriptor): void {
    if(this.vectorLayer){
      this.gaEvent('layer', 'vector', l.name);
    }

    this.vectorLayer = l;
    if(!l||!l.tileLayers){
      return;
    }

    if(!l.tiles){
      l.tiles = InterpolationService.interpolate(environment.tiles,l);
    }

    this.vectorStyles = {};
    l.tileLayers.forEach(tl=>{
      this.vectorStyles[tl.layer] = {
        weight:0.5,
        fill:true,
        fillOpacity:0
      };
    });
  }

  setOpacity(): void {
    this.wmsParams = Object.assign({},this.wmsParams,{opacity:this.opacity*0.01});
  }

  vectorLayerChanged(vl: VectorLayerDescriptor): void {
    this.configureVectorLayer(vl);
  }

  basemapChanged(): void {
    this.baseMapURL = this.basemap.urlTemplate;
  }

  polygonModeChanged(): void {
    this.updateMapConfig();
  }

  closeAbout(): void {
    this.splash.close();
  }

  showAbout(event: any): void{
    event.stopPropagation();
    event.preventDefault();
    this.splash.show();
  }

  gaEvent(category: string, action: string, context: string): void {
    gtag('event', 'category', {
      event_category: action,
      event_label: context
    });
  }
}

function pad(n: number,digits?: number): string{
  digits = digits || 2;

  let result = n.toString();
  while (result.length<digits){
    result = '0' + result;
  }
  return result;
}

// &threshold=50&styles=

// &styles=time=2008-01-01T00%3A00%3A00.000Z&time_diff=2010-01-01T00%3A00%3A00.000Z

function makeFeatureCollection(...features:GeoJSON.Feature<GeoJSON.Polygon>[]):GeoJSON.FeatureCollection<GeoJSON.Polygon>{
  return {
    type:'FeatureCollection',
    features:features
  };
}

function makeSquareFeature(latlng: L.LatLng): GeoJSON.Feature<GeoJSON.Polygon> {
  const w = latlng.lng - POINT_FEATURE_SIZE/2;
  const e = latlng.lng + POINT_FEATURE_SIZE/2;
  const n = latlng.lat + POINT_FEATURE_SIZE/2;
  const s = latlng.lat - POINT_FEATURE_SIZE/2;

  const square = [[
    [w,n],
    [w,s],
    [e,s],
    [e,n],
    [w,n]
  ]];

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: square
    },
    properties: {
    }
  };
}
