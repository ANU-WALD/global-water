import { LayerDescriptor } from './layer-descriptor';

export interface MapSettings {
  year: number;
  binary: boolean;
  difference: boolean;
  referenceYear: number;
  threshold: number;
  layer: LayerDescriptor;
  transparency: number;
}

