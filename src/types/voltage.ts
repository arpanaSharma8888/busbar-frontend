
export interface VoltageReading {
  deviceId: string;
  macId: string;
  /** Voltage in millivolts (mV). */
  voltage: number;
  timestring: string;
  receivedAt: string;
}

export interface LatestVoltageResponse {
  success: boolean;
  data: VoltageReading | null;
}

export interface HistoricalVoltageResponse {
  success: boolean;
  deviceId: string;
  count: number;
  data: VoltageReading[];
}
