import { Component, OnInit, Input, OnChanges, SimpleChanges, ViewChild, NgModuleRef } from '@angular/core';
import * as L from 'leaflet';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { parseCSV, TableRow, Bounds, InterpolationService, UTCDate, RangeStyle, PaletteService } from 'map-wald';
import { ChartSeries } from '../chart/chart.component';
import { LayerDescriptor, LegendResponse, MapSettings, DisplaySettings } from '../data';
import { ConfigService } from '../config.service';
import { LeafletService, OneTimeSplashComponent, BasemapDescriptor,
  VectorLayerDescriptor, PointMode } from 'map-wald-leaflet';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
// import { DownloadFormComponent } from '../download-form/download-form.component';
// import * as store from 'store';
// import * as FileSaver from 'file-saver';
import area from '@turf/area';
import { LayersService } from '../layers.service';
import { PointDataService } from '../point-data.service';
import { forkJoin } from 'rxjs';

declare var gtag: (a: string,b: string,c?: any) => void;

// const VECTOR_TILE_URL = 'https://storage.googleapis.com/wald-vector/tileserver/{z}/{x}/{y}.pbf';
// const FEATURE_ID_COL='PR_PY_PID';
const SUPER2='²';
const EMAIL_KEY='tree-change-email-submitted';
const DECIMAL_PLACES=1;
const FULL_EXTENT: Bounds = {
  east: -180,
  north: 40,
  south: 40,
  west: 180
};
const DATA_COLUMNS=['year','value'];
const DEFAULT_DELTA_OFFSET=-50;

@Component({
  selector: 'app-main-map',
  templateUrl: './main-map.component.html',
  styleUrls: ['./main-map.component.scss']
})
export class MainMapComponent implements OnInit, OnChanges {
  @Input() date: UTCDate;
  @Input() layer: LayerDescriptor;
  @ViewChild('splash', { static: true }) splash: OneTimeSplashComponent;

  pointMode = PointMode;
  selectionNum = 0;
  zoom: number;
  vectorLayers: VectorLayerDescriptor[];
  vectorLayer: VectorLayerDescriptor;
  showWindows = true;
  basemap: BasemapDescriptor;
  transparency = 0;

  pointLayerFeatures: any;

  get opacity(): number {
    return 1-0.01*this.transparency;
  }

  layers: LayerDescriptor[];
  basemaps: BasemapDescriptor[];

  bounds: Bounds;
  map: L.Map;
  mapLayer: L.TileLayer;
  baseMapURL: string;
  wmsURL:string;
  wmsParams: any = {};
  vectorStyles: any = {};
  chartSeries: ChartSeries[] = [];
  legendColours: string[] = [];
  legendLabels: string[] = [];
  polygonMode: 'predefined' | 'draw' = 'predefined';
  showVectors = true;

  treeCover: number[] = [0,0];
  canopy: number;
  biomass: number;
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
    console.log('MainMapComponent');
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
      this.layer = this.layers[0];
      this.date = this.layer.timePeriod?.end;
      this.setupMapLayer();
    });
  }

  ngOnInit(): void {
    gtag('send', 'pageview');
    this.setupMapLayer();

    this._map.withMap(m=>{
      this.zoom = m.getZoom();
      m.on('zoom',()=>{
        this.zoom = m.getZoom();
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.setupMapLayer();
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

  mapFilename(): string {
    if(!this.layer){
      return '';
    }
    return InterpolationService.interpolate(this.layer.filename || '',this.interpolationSubstitutions());
  }

  mapUrl(): string {
    if(!this.layer){
      return null;
    }

    if(this.layer.type!=='grid'){
      return null;
    }

    if(this.layer.source==='tds'){
      return `${environment.tds}/wms/${this.mapFilename()}`;
    }

    return this.layer.url || environment.wms;
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

  setupMapLayer(): void {
    if(!this.layer){
      return;
    }

    this.wmsParams = null;
    this.pointLayerFeatures = null;

    if(this.layer.type==='grid'){
      this.setupWMSLayer();
    } else {
      this.setupPointLayer();
    }
  }

  private setupPointLayer(): void {
    forkJoin([
      this.pointData.getValues(this.layer.label,{},this.date),
      this.palettes.getPalette('PuBu',false,5)
    ]).subscribe(([features,palette]) => {
      this.pointLayerFeatures = features;
      const max = Math.max(...(features.features).map(f=>f.properties.value));
      const breaks = [0, max/10, 2*max/10, 3*max/10, 4*max/10, 5*max/10];
      this.siteFill = new RangeStyle('value',palette,breaks);
      this.siteSize = new RangeStyle('value',[2,3,5,8,13],breaks);

    });
  }

  private setupWMSLayer(): void {
    this.wmsURL = this.mapUrl();

    const options: any =  {
      layers: this.layer.variable?this.layer.variable:this.layer.variables[0],
      opacity: this.opacity,
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

    this.wmsParams = this.substituteParameters(Object.assign({},options,this.layer.mapParams||{}));
    // this.mapLayer = L.tileLayer.wms(environment.wms,options as L.WMSOptions);

    // this.mapLayer.addTo(this.map);
    this.getLegendData();
  }

  getLegendData(): void {
    return;

    // let url = `${environment.wms}?`;
    // url += `layers=${this.wmsParams.layers}`;
    // url += '&request=GetLegendGraphic&service=WMS&version=1.1.1';

    // this.http.get(url).subscribe((data: LegendResponse)=>{
    //   const TARGET_N_COLOURS = 6;
    //   let filter = (v:any,i:number)=>true;
    //   if(data.palette.length > TARGET_N_COLOURS) {
    //     filter = (v:any,i:number)=>{
    //       return (i===1) ||
    //              (i===data.palette.length-1)||
    //              (i&&(i%(Math.floor(data.palette.length / (TARGET_N_COLOURS-2)))===0));
    //     };
    //   }
    //   // this.legendLabels = data.values.filter(filter).map(v=>(v+valueOffset).toFixed()).reverse();
    //   // if(!this.difference){
    //   //   this.legendLabels[0] = this.layer.options.range[1].toFixed();
    //   // }
    //   this.legendColours = data.palette.filter(filter).map(c=>makeColour(c.R,c.G,c.B,c.A/255)).reverse();
    // });
  }

  // setupChart(chartData: TableRow[]): void{
  //   if(!chartData) {
  //     this.chartSeries = [];
  //     return;
  //   }

  //   this.chartSeries = [
  //     {
  //       data:chartData
  //     }
  //   ];
  // }

  mapOptionsChanged(event: MapSettings): void {
    this.gaEvent('layer','wms',
      `${event.layer.label}:${event.date.toUTCString()}:${event.relative?event.relativeVariable:'-'}`);
    this.layer = event.layer;
    this.date = event.date;
    this.transparency = event.transparency;
    this.setupMapLayer();
  }

  displayOptionsChanged(event: DisplaySettings): void {
    if(event.opacity!==undefined){
      this.transparency = 100*(1-event.opacity);
      this.setOpacity();
    }

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
    this.pointData.getTimeSeries(this.layer.label,geoJSON).subscribe(timeseries=>{
      const chartData = timeseries.dates.map((d,i)=>{
        return {
          date:d,
          value:timeseries.values[i]
        };
      }).filter(row=>(row.value!==null)&&!isNaN(row.value));
      this.chartSeries = [
        {
          data:chartData
        }
      ];
    });
  }

  // getValues(geoJSON: any, layer: string, callback: ((data: TableRow[])=>void)): void {
  //   const currentSelection = this.selectionNum;

  //   this.http.post(environment.wps,{
  //     layer_name:layer,
  //     vector:geoJSON
  //   }, {
  //     responseType:'text'
  //   }).subscribe(res=>{
  //     if(this.selectionNum !== currentSelection) {
  //       return;
  //     }

  //     const data = parseCSV(res,{
  //       columns:DATA_COLUMNS
  //     });
  //     callback(data);
  //   });
  // }

  // vectorFeatureClicked(geoJSON: any): void {
  //   this.selectionNum++;
  //   const currentSelection = this.selectionNum;
  //   this.gaEvent('action','select-polygon',`${this.showVectors?this.vectorLayer.name:'custom-drawn'}`);
  //   this.area = area(geoJSON);
  //   if(this.area < 10000) {
  //     this.areaUnits = 'm'+SUPER2;
  //   } else if(this.area < 1000000) {
  //     this.area /= 10000;
  //     this.areaUnits = 'ha';
  //   } else {
  //     this.area /= 1000000;
  //     this.areaUnits = 'km'+SUPER2;
  //   }

  //   this.area = +this.area.toFixed(DECIMAL_PLACES);

  //   setTimeout(()=>{
  //     if(this.selectionNum!==currentSelection){
  //       return;
  //     }

  //     this.setupChart(null);

  //     this.getValues(geoJSON,'wcf',data=>{
  //       this.setupChart(data);
  //       this.treeCover[0] = +Math.min(...data.map(r=>r.value)).toFixed(DECIMAL_PLACES);
  //       this.treeCover[1] = +Math.max(...data.map(r=>r.value)).toFixed(DECIMAL_PLACES);
  //     });

  //     this.getValues(geoJSON,'vegh',data=>{
  //       this.canopy = +data[0].value.toFixed(DECIMAL_PLACES);
  //     });

  //     this.getValues(geoJSON,'wagb',data=>{
  //       this.biomass = +data[0].value.toFixed(DECIMAL_PLACES);
  //     });
  //   });
  // }

  resetBounds(): void {
    this.bounds = Object.assign({},FULL_EXTENT);
  }

  configureVectorLayer(l: VectorLayerDescriptor): void {
    if(this.vectorLayer){
      this.gaEvent('layer', 'vector', l.name);
    }

    this.vectorLayer = l;
    if(!l||!l.tiles){
      return;
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
    this.wmsParams = Object.assign({},this.wmsParams,{opacity:this.opacity});
  }

  vectorLayerChanged(vl: VectorLayerDescriptor): void {
    this.configureVectorLayer(vl);
  }

  basemapChanged(): void {
    this.baseMapURL = this.basemap.urlTemplate;
  }

  // polygonModeChanged(): void {
  //   this.showVectors = this.polygonMode==='predefined';
  // }

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
