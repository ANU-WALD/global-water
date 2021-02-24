import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { MapWaldLeafletModule } from 'map-wald-leaflet';

import { AppComponent } from './app.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MainMapComponent } from './main-map/main-map.component';
import { MapControlsComponent } from './map-controls/map-controls.component';
import { MapButtonsComponent } from './map-buttons/map-buttons.component';
import { ChartComponent } from './chart/chart.component';
import { VectorLayerSelectionComponent } from './vector-layer-selection/vector-layer-selection.component';
import { AboutComponent } from './about/about.component';
// import { DownloadFormComponent } from './download-form/download-form.component';
import { FeatureDataService } from './feature-data.service';
import { PointDataService } from './point-data.service';
import { LayersService } from './layers.service';

@NgModule({
  declarations: [
    AppComponent,
    MainMapComponent,
    MapControlsComponent,
    MapButtonsComponent,
    ChartComponent,
    VectorLayerSelectionComponent,
    AboutComponent,
    // DownloadFormComponent
  ],
  imports: [
    HttpClientModule,
    FormsModule,
    BrowserModule,
    NgbModule,
    MapWaldLeafletModule.forRoot({})
  ],
  providers: [
    FeatureDataService,
    PointDataService,
    LayersService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
