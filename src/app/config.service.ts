import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { shareReplay, map } from 'rxjs/operators';
import { BasemapDescriptor, VectorLayerDescriptor } from 'map-wald-leaflet';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  vectorLayers$: Observable<VectorLayerDescriptor[]>;
  basemaps$: Observable<BasemapDescriptor[]>;

  constructor(private http: HttpClient) {
    this.vectorLayers$ = this.http.get('assets/foci.json').pipe(
      map((layers: VectorLayerDescriptor[])=>{
        return layers.map(l=>{
          if(l.source){
            l.source = environment.geojsons + l.source + '.json';
          }
          return l;
        });
      }),
      shareReplay()
    );

    this.basemaps$ = this.http.get(environment.basemapConfig).pipe(shareReplay()) as Observable<BasemapDescriptor[]>;
  }
}
