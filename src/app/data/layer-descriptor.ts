import { DateRange } from 'map-wald';

export interface MetadataConfig {
  filename?:string;
  meta:string[];
  variables?:string[];
  variable?:string;
}

export interface LayerDescriptor extends MetadataConfig {
  type:string;
  source:string;
  label:string;
  url?: string;
  polygonDrill?: string;
  time:string;
  timeFirst:boolean;
  mapParams?:any;
  timePeriod?:DateRange;
  relatedFiles?:MetadataConfig[];
  relativeOptions?:{[key:string]:string};
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


