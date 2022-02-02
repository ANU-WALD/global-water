import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { UTCDate } from 'map-wald';
import * as d3 from 'd3';

@Component({
  selector: 'app-time-slider',
  templateUrl: './time-slider.component.html',
  styleUrls: ['./time-slider.component.scss']
})
export class TimeSliderComponent implements OnChanges {
  @Input() dates: UTCDate[] = [];
  @Input() format: string;

  @Input() date: UTCDate = new Date();
  @Output() dateChange = new EventEmitter<UTCDate>();

  firstDate = {year: 1979, month: 1, day: 1};
  lastDate = {year: 2048, month: 12, day: 31};
  ngbDate = {year:0,month:0,day:0};

  userSet = false;
  oldStep = -1;
  currentDate = ''
  currentStep = 0;
  min = 0;
  max = 1;
  markDisabled: (d:any)=>boolean;

  constructor() {

    this.markDisabled = (d:any) => {
      return this.isDisabled(d);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if(changes.dates) {
      this.initSlider();
    }
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

    this.firstDate = this.fromDate(this.dates[0]);
    this.lastDate = this.fromDate(this.dates[this.max]);
    this.stepChanged(false);
  }

  stepChanged(userSet: boolean) {
    this.userSet = this.userSet || userSet;

    if(this.currentStep===this.oldStep) {
      return;
    }

    this.date = this.dates[this.currentStep];
    this.currentDate = d3.time.format(this.format)(this.date);
    this.dateChange.emit(this.date);
    this.ngbDate = this.fromDate(this.date);
    this.oldStep = this.currentStep;
  }

  fromDate(d:UTCDate):any {
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth()+1,
      day: d.getUTCDate()
    };
  }

  toDate(d:any):UTCDate{
    return new Date(Date.UTC(d.year, d.month-1, d.day));
  }

  isDisabled(d:any):boolean {
    if(!this.dates){
      return true;
    }
    for(let i=0;i<this.dates.length;i++){
      if(this.dates[i].getUTCFullYear()!==d.year){
        continue;
      }
      if(this.dates[i].getUTCMonth()!==(d.month-1)){
        continue;
      }
      if(this.dates[i].getUTCDate()!==d.day){
        continue;
      }
      return false;
    }
    return true;
  }

  ngbDateChanged(d:any) {
    const date = this.toDate(d);
    console.log(d,date);
    this.currentStep = this.dates.findIndex(d=>{
      return d.getUTCFullYear()===date.getUTCFullYear() &&
             d.getUTCMonth()===date.getUTCMonth() &&
             d.getUTCDate()===date.getUTCDate();
    });
    this.stepChanged(true);
  }
}
