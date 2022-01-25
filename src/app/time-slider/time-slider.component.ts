import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { UTCDate } from 'map-wald';
import * as d3 from 'd3';

@Component({
  selector: 'app-time-slider',
  templateUrl: './time-slider.component.html',
  styleUrls: ['./time-slider.component.scss']
})
export class TimeSliderComponent implements OnInit, OnChanges {
  @Input() dates: UTCDate[] = [];
  @Input() format: string;

  @Input() date: UTCDate = new Date();
  @Output() dateChange = new EventEmitter<UTCDate>();

  userSet = false;
  oldStep = -1;
  currentDate = ''
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
    this.oldStep = -1;
    this.max = this.dates.length-1;
    if(!this.userSet) {
      this.currentStep = this.max;
    } else if(this.currentStep > this.max) {
      this.currentStep = this.max;
      this.userSet = false;
    }

    this.stepChanged(false);
  }

  ngOnInit(): void {
  }

  stepChanged(userSet: boolean) {
    // console.log('stepChanged', userSet, this.currentStep, this.dates[this.currentStep]);
    this.userSet = this.userSet || userSet;

    if(this.currentStep===this.oldStep) {
      return;
    }

    this.date = this.dates[this.currentStep];
    this.currentDate = d3.time.format(this.format)(this.date);
    this.dateChange.emit(this.date);
    this.oldStep = this.currentStep;
  }
}


