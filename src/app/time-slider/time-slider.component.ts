import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { UTCDate } from 'map-wald';

@Component({
  selector: 'app-time-slider',
  templateUrl: './time-slider.component.html',
  styleUrls: ['./time-slider.component.scss']
})
export class TimeSliderComponent implements OnInit, OnChanges {
  @Input() dates: UTCDate[] = [];

  @Input() date: UTCDate = new Date();
  @Output() dateChange = new EventEmitter<UTCDate>();

  currentStep = 0;
  min = 0;
  max = 1;

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if(changes.dates) {
      this.initSlider();
    }
    // throw new Error('Method not implemented.');
  }

  initSlider() {
    this.min=0;
    if(!this.dates?.length){
      this.max=1;
      return;
    }

    this.max = this.dates.length-1;
  }

  ngOnInit(): void {
  }

  stepChanged() {
    this.date = this.dates[this.currentStep];
    this.dateChange.emit(this.date);
  }
}
