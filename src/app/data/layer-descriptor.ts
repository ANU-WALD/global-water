import { DateRange } from 'map-wald';

export interface LayerDescriptor {
  type:string;
  source:string;
  label:string;
  filename:string;
  meta:string[];
  variables?:string[];
  variable?:string;
  time:string;
  timeFirst:boolean;
  mapParams?:any;
  timePeriod?:DateRange
}

// export interface LayerDescriptor {
//   label: string;
//   name: string;
//   options?: {
//     temporal?: boolean;
//     threshold?: boolean;
//     delta?: boolean;
//     range?: number[];
//     deltaOffset?: number;
//   };
//   units: string;
//   help?: string;
// }


