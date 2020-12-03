import { Injectable } from '@angular/core';
import { Feature, FeatureCollection } from 'geojson';
import { Observable, forkJoin, of } from 'rxjs';
import { TimeSeries, MetadataService, OpendapService } from 'map-wald';
import { map, switchAll } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LayerDescriptor } from './data';

const DEFAULT_ID_COLUMN = 'ID';

export interface FeatureDataConfig extends LayerDescriptor {
  id?:string;
  skipGeometry?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureDataService {
  private layerCache: { [key: string]: Observable<FeatureCollection> } = {};

  constructor(    private metadata: MetadataService,    private dap: OpendapService) {
 }


  getFeatures(layer: FeatureDataConfig,filter?:{[key:string]:any}): Observable<FeatureCollection> {
    const res$ = of(layer).pipe(
      map(lyr => {
        if (!this.layerCache[lyr.label]) {
          this.layerCache[lyr.label] = this._retrieveLayer(lyr);
        }
        return this.layerCache[lyr.label];
      }),
      switchAll()
    );

    if(!filter){
      return res$;
    }

    return res$.pipe(
      map(fc=>{
        return {
          type: 'FeatureCollection',
          features: fc.features.filter(f=>{
            return Object.keys(filter).every(k=>{
              return f.properties[k]===filter[k];
            });
          })
        };
      }));
  }

  getTimes(layer: FeatureDataConfig): Observable<Date[]> {
    return of(layer).pipe(
      map(cfg=>{
        const url = `${environment.tds}/dodsC/${cfg.filename}`;
        return this.metadata.getTimeDimensionForURL(url)
      }),
      switchAll()
    );
  }

  getValues(layer:FeatureDataConfig, filter:{[key:string]:any}, timestep: Date, variable?: string): Observable<FeatureCollection>{
    return this.getFeatures(layer).pipe(
      map((f)=>{
        const features:FeatureCollection = f;
        const config:FeatureDataConfig = layer;
        variable = variable || config.variables[0];
        return {
          features,
          variable,
          config,
          url: ''
        };
      }),
      map(query=>{
        query.url = `${environment.tds}/dodsC/${query.config.filename}`;
        return forkJoin([
          this.metadata.dasForUrl(query.url),
          this.metadata.getTimeDimensionForURL(query.url),
          of(query)
        ]);
      }),
      switchAll(),
      map(([das,timeDim,query])=>{
        const featureRange = this.dap.dapRangeQuery(0,query.features.features.length-1);
        const timeStepIdx = timeDim.indexOf(timestep);
        if(timeStepIdx<0){
          // Error
        }
        const timeQuery =  this.dap.dapRangeQuery(timeStepIdx)
        return forkJoin([
          this.dap.getData(`${query.url}.ascii?${query.variable}${featureRange}${timeQuery}`,das),
          of(query)
        ]);
      }),
      switchAll(),
      map(([data,query])=>{
        const vals = data[query.variable] as number[];
        const result:FeatureCollection = {
          type:'FeatureCollection',
          features:[]
        };
        result.features = query.features.features.map(f=>{
          const newF: Feature = {
            type: 'Feature',
            geometry:f.geometry,
            properties:Object.assign({},f.properties)
          };
          const idCol = layer.id||DEFAULT_ID_COLUMN;
          const idx = (data[idCol] as number[]).indexOf(newF.properties[idCol]);
          newF.properties.value = data[query.variable][idx];
          return newF;
        })
        return result;
      }));
  }

  getTimeSeries(layer:FeatureDataConfig,feature:Feature,variable?:string):Observable<TimeSeries>{
    const res$ = this.getFeatures(layer).pipe(
      map(features=>{
        // const features:FeatureCollection = f;
        const config:FeatureDataConfig = layer;
        variable = variable || config.variables[0];
        const idCol = layer.id||DEFAULT_ID_COLUMN;
        return {
          variable,
          config,
          idx: features.features.findIndex(f=>f.properties[idCol]===feature.properties[idCol]),
          url: ''
        };
      }),
      map(query=>{
        query.url = `${environment.tds}/dodsC/${query.config.filename}`;
        return forkJoin([this.metadata.dasForUrl(query.url), this.metadata.ddxForUrl(query.url), of(query)]);
      }),
      switchAll(),
      map(([das,ddx,query])=>{
        const range = this.dap.dapRangeQuery(query.idx);

        let dateRange = '';
        if(query.config.timeFirst){
          const timeSize = +ddx.variables[query.config.time].dimensions[0].size;
          dateRange = this.dap.dapRangeQuery(0,timeSize-1);
        }
        const url = `${query.url}.ascii?${query.variable}${dateRange}${range}`;
        return forkJoin([this.dap.getData(url,das),of(query)]);
      }),
      switchAll(),
      map(([data,query])=>{
        const vals = data[query.variable] as number[];
        return {
          dates:data[query.config.time] as Date[],
          values:vals
        };
      }),
      map(ts=>{
        return {
          dates:ts.dates.filter((_,i)=>!isNaN(ts.values[i])&&(ts.values[i]!==null)),
          values:ts.values.filter(v=>!isNaN(v)&&(v!==null))
        };
      }));
    return res$;
  }

  private _retrieveLayer(lyr: FeatureDataConfig): Observable<FeatureCollection> {
    const variables = lyr.meta || [];
    const url = `${environment.tds}/dodsC/${lyr.filename}`;
    const idCol = lyr.id||DEFAULT_ID_COLUMN;
    return forkJoin([this.metadata.dasForUrl(url),this.metadata.ddxForUrl(url)]).pipe(
      map(([das,ddx]) => {
        const size = +ddx.variables[idCol].dimensions[0].size;
        const rangeQuery = this.dap.dapRangeQuery(0,size-1);
        return forkJoin(variables.map(v => {
          return this.dap.getData(`${url}.ascii?${v}`, das);
        }));
      }),
      switchAll(),
      map(data=>{
        const result:{[key:string]:number[]} = {};
        data.forEach((d,i)=>{
          result[variables[i]] = d[variables[i]] as number[];
        })
        return result;
      }),
      map(data => {
        const result: FeatureCollection = {
          type: 'FeatureCollection',
          features: []
        };

        result.features = data[idCol].map((_,i)=>{
          const f: Feature = {
            type: 'Feature',
            geometry: null,
            properties:{}
          };
          if(!lyr.skipGeometry){
            f.geometry = {
              type: 'Point',
              coordinates: [data.longitude[i],data.latitude[i]],
            };
          }

          variables.filter(v=>(v!=='latitude')&&(v!=='longitude')).forEach(v=>{
            f.properties[v] = data[v][i];
          });
          return f;
        });
        return result;
      }));
  }
}
