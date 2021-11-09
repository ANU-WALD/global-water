import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { UTCDate } from 'map-wald';
import { ChartEntry, ChartSeries } from '../chart/chart.component';
import {groupBy} from 'ramda';

const CM_NORMAL='Normal';
const CM_DEVIATION='Deviation from monthly mean';
const CM_YR_ON_YR='Year on year';
const CM_YR_ON_YR_CUMUL='Year on year (cumulative)';

@Component({
  selector: 'app-multi-year-timeseries-chart',
  templateUrl: './multi-year-timeseries-chart.component.html',
  styleUrls: ['./multi-year-timeseries-chart.component.scss']
})
export class MultiYearTimeseriesChartComponent implements OnInit, OnChanges {
  @Input() chartSeries: ChartSeries;
  @Input() chartLabel = '';

  chartModes = [CM_NORMAL,CM_DEVIATION,CM_YR_ON_YR,CM_YR_ON_YR_CUMUL];
  chartMode = CM_NORMAL;

  effectiveChartSeries: ChartSeries[] = [];


  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if(changes.chartSeries){
      this.configureChartMode()      
    }
  }

  ngOnInit(): void {
  }

  configureChartMode(): void {
    if(!this.chartSeries?.data?.length){
      this.effectiveChartSeries = [];
      return;
    }

    switch(this.chartMode){
      case CM_NORMAL:
        this.effectiveChartSeries = [
          this.chartSeries
        ];
        break;
      case CM_DEVIATION:
        this.effectiveChartSeries = [
          {
            title: this.chartSeries.title,
            data: convertToMonthlyVariance(this.chartSeries.data)
          }
        ];
        break;
      case CM_YR_ON_YR:
      case CM_YR_ON_YR_CUMUL:
        const orig = this.chartSeries.data;
        const groups = groupBy(r=>(r.date as UTCDate).getUTCFullYear().toString(),orig);
        const years = Object.keys(groups).map(yr=>+yr).sort().reverse();
        const maxYear = years[0];
        this.effectiveChartSeries = years.map(yr=>{
          const result:ChartSeries = {
            title: `${this.chartSeries.title}: ${yr}`,
            data: groups[yr.toString()].map(r=>{
              const d = new Date(r.date as Date);
              d.setUTCFullYear(maxYear);
              return {
                date:d,
                value:r.value
              };
            })
          };
          if(this.chartMode===CM_YR_ON_YR_CUMUL){
            result.data = toCumulative(result.data/*.reverse()*/);
          }

          return result;
        });
        break;
    }
  }

}

function toCumulative(table:ChartEntry[]):ChartEntry[] {
  let sum = 0.0;
  return table.map(row=>{
    sum += row.value;
    return {
      date:row.date,
      value:sum
    };
  });
}

function convertToMonthlyVariance(chartData: ChartEntry[]): ChartEntry[] {
  const monthlyTotals = new Array<number>(12).fill(0);
  const monthlyCounts = new Array<number>(12).fill(0);
  chartData.forEach(row=>{
    const month = (row.date as UTCDate).getUTCMonth();
    monthlyTotals[month] += row.value;
    monthlyCounts[month]++;
  });
  const monthlyMeans = monthlyCounts.map((c,i)=>(c?(monthlyTotals[i]/c):NaN));
  return chartData.map(row=>{
    return {
      date:row.date,
      value:row.value - monthlyMeans[(row.date as UTCDate).getUTCMonth()]
    };
  });
}

