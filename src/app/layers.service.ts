import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { map, publishReplay, refCount, switchAll } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LayerDescriptor } from './data';
import { DateRange, UTCDate } from 'map-wald';
import { FeatureDataService } from './feature-data.service';

const DEFAULT_ATTRIBUTION_TEXT='ANU Centre for Water and Landscape Dynamics';
const DEFAULT_ATTRIBUTION_URL='http://wald.anu.edu.au/';
const DEFAULT_LAYER_SETTINGS={
  attribution:DEFAULT_ATTRIBUTION_TEXT,
  attributionURL:DEFAULT_ATTRIBUTION_URL
}

@Injectable({
  providedIn: 'root'
})
export class LayersService {
  layerConfig$: Observable<LayerDescriptor[]>;

  constructor(private http: HttpClient,
              private featureData: FeatureDataService) {
    const url = `${environment.layerConfig}?_=${(new Date()).getTime()}`;
    this.layerConfig$ = this.http.get(url).pipe(
      map((origLayers:LayerDescriptor[])=>{
        return origLayers.map(l=>{
          return Object.assign({},DEFAULT_LAYER_SETTINGS,l)
        });
      }),
      map((rawLayers:LayerDescriptor[])=>{
        return forkJoin(rawLayers.map(l=>{
          if(l.timePeriod){
            l.timePeriod = DateRange.fromJSON(l.timePeriod);
          } else if(l.time) {
            // infer time period
            return this.featureData.getTimes(l).pipe(
              map(times=>{
                l.timePeriod = new DateRange();
                l.timePeriod.start = times[0];
                l.timePeriod.end = times[times.length-1];
                return l;
              })
            );
          }
          return of(l);
        }));
      }),
      switchAll(),
      publishReplay(),
      refCount()) as Observable<LayerDescriptor[]>;
  }

  matchingLayers(params?: any): Observable<LayerDescriptor[]>{
    if(!params){
      return this.layerConfig$;
    }

    const keys = Object.keys(params);

    if(keys.length){
      return this.layerConfig$;
    }

    return this.layerConfig$.pipe(
      map(allLayers=>{
        return allLayers.filter(l=>{
          return keys.every(k=>l[k]===params[k]);
        });
      })
    );
  }

  constrainDate(d: UTCDate, lyr: LayerDescriptor): UTCDate {
    if(!lyr.timePeriod){
      return d;
    }
    if(lyr.timePeriod.contains(d)){
      return d;
    }
    if(d.getTime()<lyr.timePeriod.start.getTime()){
      return lyr.timePeriod.start;
    }
    return lyr.timePeriod.end;
  }
}
