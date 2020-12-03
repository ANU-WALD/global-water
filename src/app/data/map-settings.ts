import { LayerDescriptor } from './layer-descriptor';

export interface MapSettings {
  date: Date;
  // binary: boolean;
  // difference: boolean;
  // referenceYear: number;
  // threshold: number;
  layer: LayerDescriptor;
  transparency: number;
  relative: boolean;
  relativeVariable: string;
}

