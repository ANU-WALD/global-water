import { Component, OnInit, Input, OnChanges, SimpleChanges, ViewChild, NgModuleRef } from '@angular/core';
import * as L from 'leaflet';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
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

declare var gtag: (a: string,b: string,c?: any) => void;

// const VECTOR_TILE_URL = 'https://storage.googleapis.com/wald-vector/tileserver/{z}/{x}/{y}.pbf';
// const FEATURE_ID_COL='PR_PY_PID';
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

  mapSettings: MapSettings = Object.assign({},INITIAL_MAP_SETTINGS);
  pointMode = PointMode;
  selectedFeatureNumber = 0;
  selectedPolygonFeature: GeoJSON.Feature<GeoJSON.GeometryObject>;

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
  map: L.Map;
  mapLayer: L.TileLayer;
  baseMapURL: string;
  wmsURL:string;
  wmsParams: any = {};
  vectorStyles: any = {};
  rawChartData: ChartSeries;
  chartPolygonLabel: string;
  legendColours: string[] = [];
  legendLabels: string[] = [];
  legendShape: string[] = [''];
  polygonMode: 'predefined' | 'draw' = 'predefined';
  showVectors = true;

  layerVariants:LayerVariant[] = [];
  selectedVariant:LayerVariant;
  layerSettingsFlat: FlattenedLayerDescriptor;

  area: number;
  areaUnits = 'km'+SUPER2;
  siteFill: RangeStyle<string>;
  siteSize: RangeStyle<number>;

  constructor(private http: HttpClient,
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
      console.log(this.layers,layers);
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
      this.pointLayerFeatures = features;
      const max = Math.max(...(features.features).map(f=>f.properties.value));
      const breaks = [0, max/10, 2*max/10, 3*max/10, 4*max/10, 5*max/10];
      this.siteFill = new RangeStyle('value',palette,breaks);
      this.siteSize = new RangeStyle('value',[1,2,3,5,8,13,21],breaks);
      this.legendColours = palette;
      this.legendLabels = this.getLabels(this.siteFill);
      this.legendShape[0] = 'circle';
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
    console.log(this.wmsParams);
    // this.mapLayer = L.tileLayer.wms(environment.wms,options as L.WMSOptions);

    // this.mapLayer.addTo(this.map);
    this.getLegendData();
  }

  getLegendData(): void {
    this.legendColours = [];
    this.legendColours = [];
    this.legendShape = [];

    if(!this.layerSettingsFlat?.metadata){
      return;
    }

    const url = InterpolationService.interpolate(
      this.layerSettingsFlat.metadata,this.layerSettingsFlat);

    this.http.get(url).subscribe((metadata: LegendResponse)=>{
      let vals:number[];
      if(metadata.values){
        vals = metadata.values;
      } else {
        const range = metadata.max_value-metadata.min_value;
        const step = range/(metadata.palette.length-2);
        vals = [metadata.min_value];
        for(let i=1;i<metadata.palette.length-1;i++){
          vals.push(vals[i-1]+step);
        }
        vals.push(metadata.max_value);
        console.assert(vals.length===metadata.palette.length);
      }

      this.legendLabels = 
      vals.map((v,i)=>{
        const txt = v.toFixed();
        if(!i){
          return `< ${txt}`;
        }
        if(i===vals.length-1){
          return `> ${txt}`;
        }
        return `${vals[i-1].toFixed()}-${txt}`;
      }).reverse();

      this.legendColours = metadata.palette.map(c=>makeColour(c.R,c.G,c.B,c.A/255)).reverse();
      this.legendShape[0] = '';
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
    console.log(event);
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

    if((this.layer?.type==='grid')&&this.selectedPolygonFeature){
      this.chartPolygonTimeSeries();
    } else {
      this.selectedPolygonFeature = null;
    }
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

  pointClicked(geoJSON: any): void {
    console.log(geoJSON);
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

  getValues(geoJSON: any): Observable<TableRow[]> {
    if(!this.layer.polygonDrill){
      return of(null);
    }

    const currentSelection = this.selectedFeatureNumber;

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
    const drawn = !this.showVectors;
    this.gaEvent('action','select-polygon',`${this.showVectors?this.vectorLayer.name:'custom-drawn'}`);
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
      if (this.vectorLayer.label) {
        this.chartPolygonLabel = InterpolationService.interpolate(this.vectorLayer.label, this.selectedPolygonFeature['properties']);
      }
      this.setupChart(layer.label, data as ChartEntry[]);
    });
  }

  private setFeatureArea(feature) {
    this.area = area(feature);
    if (this.area < 10000) {
      this.areaUnits = 'm' + SUPER2;
    } else if (this.area < 1000000) {
      this.area /= 10000;
      this.areaUnits = 'ha';
    } else {
      this.area /= 1000000;
      this.areaUnits = 'km' + SUPER2;
    }

    this.area = +this.area.toFixed(DECIMAL_PLACES);
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
    console.log(this.wmsParams);
  }

  vectorLayerChanged(vl: VectorLayerDescriptor): void {
    this.configureVectorLayer(vl);
  }

  basemapChanged(): void {
    this.baseMapURL = this.basemap.urlTemplate;
  }

  polygonModeChanged(): void {
    this.showVectors = this.polygonMode==='predefined';
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
