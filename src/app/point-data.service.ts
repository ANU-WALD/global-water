import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { shareReplay, map, switchAll, tap } from 'rxjs/operators';
import { Observable, forkJoin, of, config } from 'rxjs';
import { MetadataService, OpendapService, TimeSeries, UTCDate } from 'map-wald';
import { FeatureCollection, Feature, GeoJsonProperties } from 'geojson';
import { Point } from 'leaflet';
import { FeatureDataService, FeatureDataConfig } from './feature-data.service';
import { LayersService } from './layers.service';
import { LayerDescriptor } from './data';

const standardVariables = [
  'longitude',
  'latitude',
  'ID',
  'admin_country',
  'admin_province',
  'hydro_basin',
  'hydro_cat'
];

@Injectable({
  providedIn: 'root'
})
export class PointDataService {
  private layers: Observable<LayerDescriptor[]>;

  constructor(private layersService:LayersService,
              private featureData:FeatureDataService,
              http: HttpClient) {
    this.layers = this.layersService.matchingLayers({type:'point'}).pipe(shareReplay());

    // http.get(`${environment.pointConfig}?${(new Date()).getTime()}`).pipe(
    //   tap((cfg:FeatureDataConfig[])=>{
    //     return cfg.forEach(lyr=>{
    //       lyr.meta = [].concat(standardVariables,lyr.meta||[])
    //     });
    //   }),
    //   shareReplay());
  }

  getLayers(): Observable<FeatureDataConfig[]> {
    return this.layers;
  }

  getSites(layer: string,filter?:{[key:string]:any}): Observable<FeatureCollection> {
    return this._layerConfig(layer).pipe(
      map(lyr=>this.featureData.getFeatures(lyr,filter)),
      switchAll());
  }

  getTimes(layer: string): Observable<UTCDate[]> {
    return this._layerConfig(layer).pipe(
      map(lyr=>this.featureData.getTimes(lyr)),
      switchAll());
  }

  _computeRelative(val:number,properties:{[key:string]:any},mode:string):number{
    let prop: string;
    if(mode.includes('[')){
      prop = mode.split('[')[0];
    } else {
      prop = mode;
    }

    let comp = properties[prop];   
    if(mode.includes('[')){
      const idx = +(mode.split('[')[1].split(']')[0]);
      comp = comp[idx];
    }
    return val - comp;
  }

  getValues(layer:string, 
            filter:{[key:string]:any},
            timestep: UTCDate,
            variable?: string,
            relativeMode?: string): Observable<FeatureCollection>{
    return this._layerConfig(layer).pipe(
      map(lyr=>forkJoin([of(lyr),this.featureData.getValues(lyr,filter,timestep,variable)])),
      switchAll(),
      map(([layer,coverage])=>{
        return {
          layer,
          coverage
        };
      }),
      tap(data=>{
        if(!relativeMode||!data.coverage){
          return;
        }
        data.coverage.features.forEach(f=>{
          f.properties.value = this._computeRelative(f.properties.value,f.properties,data.layer.relativeOptions[relativeMode]);
        })
      }),
      map(data=>data.coverage));
  }

  getTimeSeries(layer:string,feature:Feature,variable?:string):Observable<TimeSeries>{
    return this._layerConfig(layer).pipe(
      map(lyr=>this.featureData.getTimeSeries(lyr,feature,variable)),
      switchAll());
  }

  private _layerConfig(lbl:string): Observable<FeatureDataConfig>{
    return this.layers.pipe(
      map(cfg => {
        return cfg.find(lyr => lyr.label === lbl);
      }));
  }
}
