import type { EventCategory } from "@hotspot-map/shared";

/**
 * CAMEO 2.0 根事件编码（01~20）→ 人类可读描述 + 顶层分类映射。
 * 参考: https://www.gdeltproject.org/data/lookups/CAMEO.eventcodes.txt
 */
const ROOT_EVENTS: Record<string, { label: string; category: EventCategory }> = {
  "01": { label: "发表公开声明", category: "politics" },
  "02": { label: "呼吁", category: "politics" },
  "03": { label: "表达意图", category: "politics" },
  "04": { label: "协商", category: "politics" },
  "05": { label: "外交合作", category: "politics" },
  "06": { label: "物质合作", category: "economy" },
  "07": { label: "提供援助", category: "politics" },
  "08": { label: "让步", category: "politics" },
  "09": { label: "调查", category: "politics" },
  "10": { label: "提出要求", category: "politics" },
  "11": { label: "反对/谴责", category: "politics" },
  "12": { label: "拒绝", category: "politics" },
  "13": { label: "威胁", category: "conflict" },
  "14": { label: "抗议", category: "politics" },
  "15": { label: "展示军事姿态", category: "conflict" },
  "16": { label: "关系降级", category: "politics" },
  "17": { label: "胁迫", category: "conflict" },
  "18": { label: "袭击", category: "conflict" },
  "19": { label: "战斗", category: "conflict" },
  "20": { label: "非常规大规模暴力", category: "conflict" },
};

/** 根据 CAMEO 根事件编码返回描述与分类（未知编码归为 other） */
export function classifyByRootCode(rootCode: string): { label: string; category: EventCategory } {
  return ROOT_EVENTS[rootCode] ?? { label: "事件", category: "other" };
}
