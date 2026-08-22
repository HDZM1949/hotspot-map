/** 处理管道输出的规范化事件（预留，M2 完善字段） */
export interface ProcessedEvent {
  fingerprint: string;
  title: string;
  lat: number;
  lon: number;
}
