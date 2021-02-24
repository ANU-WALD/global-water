import { Component, OnInit, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { LayerDescriptor, MapSettings } from '../data';
import { LayersService } from '../layers.service';

const MIN_YEAR=1990;

@Component({
  selector: 'app-map-controls',
  templateUrl: './map-controls.component.html',
  styleUrls: ['./map-controls.component.scss']
})
export class MapControlsComponent implements OnInit, OnChanges {
  @Input() orientation: 'vertical' | 'horizontal' = 'horizontal';
  @Input() layers: LayerDescriptor[];

  settings: MapSettings = {
    date: new Date(),
    layer: null as LayerDescriptor,
    transparency: 0,
    relative: false,
    relativeVariable: '',
    dateStep: 7
  };

  @Output() optionsChanged = new EventEmitter<MapSettings>();

  constructor(private layersService: LayersService) {
    // this.years = (new Array(31)).fill(0).map((_,ix) => MIN_YEAR+ix);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if(this.layers&&!this.settings.layer){
      this.settings.layer = this.layers[0];
    }

    if(this.settings.layer&&this.settings.date){
      this.constrainDate();
    }
  }

  ngOnInit(): void {
  }

  formControlChanged(): void {
    this.optionsChanged.emit(this.settings);
  }

  layerChanged(): void {
    this.constrainDate();
    this.formControlChanged();
  }

  constrainDate(): void {
    this.settings.date = this.layersService.constrainDate(this.settings.date,this.settings.layer);
  }

  dateChanged(date: Date): void {
    this.settings.date = date;
    this.constrainDate();
    this.formControlChanged();
  }
}
