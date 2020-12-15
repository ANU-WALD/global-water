import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { TableRow } from 'map-wald';
import * as Plotly from 'plotly.js/dist/plotly-basic';

export interface ChartSeries {
  data: TableRow[];
}

@Component({
  selector: 'app-chart',
  template: `<div id="chart-div"></div>
  `,
  styles: []
})
export class ChartComponent implements OnInit, OnChanges {
  @Input() title: string;
  @Input() axisLabel: string;
  @Input() series: ChartSeries[];
  @Input() x = 'year';
  @Input() y = 'value';
  constructor() { }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.buildChart();
  }

  buildChart(): void {
    if(!this.series||!this.series.length){
      return;
    }

    const node = document.getElementById('chart-div');
    const chartData = this.series[0].data;
    Plotly.purge(node);

    const series = [
      {
        x: chartData.map(r=>r[this.x]),
        y: chartData.map(r=>r[this.y]),
        name: 'Woody cover',
        mode: 'lines+markers',
        connectgaps: true,
        marker: {
          size: 6
        },
        line: {
          color: '#58723C'
        }
      },
      {
        x: chartData.slice(chartData.length-2).map(r=>r[this.x]),
        y: chartData.slice(chartData.length-2).map(r=>r[this.y]),
        name: '',
        mode: 'lines',
        connectgaps: true,
        // marker: {
        //   size: 6
        // },
        line: {
          dash: 'dash',
          color: '#C8D5C1'
        },
        hoverinfo:'skip'
      }
    ];
    Plotly.plot(node, series, {
      margin: {
        t: 30,
        l: this.axisLabel ? 35 : 20,
        r: 10,
        b: 20
      },
      yaxis: {
        hoverformat: '.2f',
        title: this.axisLabel || '',
        fixedrange: true,
        // range: yRange
      },
      height: 200,
      width: 370, //600,
      title: this.title,
      showlegend: false
    },
    {
      displaylogo: false,
      displayModeBar: true,
      modeBarButtonsToRemove: ['hoverCompareCartesian', 'hoverClosestCartesian',
        'lasso2d', 'select2d', 'toggleSpikelines', 'resetViews', 'sendDataToCloud',
        'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d'/*, 'resetScale2d'*/]
    });
  }
}

