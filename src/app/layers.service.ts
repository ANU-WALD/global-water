import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, publishReplay, refCount } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { LayerDescriptor } from './data';
import { DateRange } from 'map-wald';

@Injectable({
  providedIn: 'root'
})
export class LayersService {
  layerConfig$: Observable<LayerDescriptor[]>;

  constructor(private http: HttpClient) {
    const url = `${environment.layerConfig}?_=${(new Date()).getTime()}`;
    this.layerConfig$ = this.http.get(url).pipe(
      map((rawLayers:LayerDescriptor[])=>{
        return rawLayers.map(l=>{
          if(l.timePeriod){
            l.timePeriod = DateRange.fromJSON(l.timePeriod);
          }
          return l;
        });
      }),
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
}
