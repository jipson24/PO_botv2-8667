import type { AppRouterClient } from "../../api";

type Out<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export type Signal = Out<AppRouterClient["signals"]["list"]>[number];
export type Overview = Out<AppRouterClient["signals"]["overview"]>;
export type ScanRun = Out<AppRouterClient["signals"]["runs"]>[number];
export type Pair = Out<AppRouterClient["pairs"]["list"]>[number];
export type PairAnalysis = Out<AppRouterClient["pairs"]["analyze"]>;
export type Config = Out<AppRouterClient["config"]["get"]>;
export type DayStats = Out<AppRouterClient["stats"]["day"]>;
export type DaySummary = Out<AppRouterClient["stats"]["days"]>[number];
export type StatsSummary = Out<AppRouterClient["stats"]["summary"]>;
export type DayBucket = DayStats["byDirection"][number];
export type DayTrade = DayStats["trades"][number];
export type DayFactor = DayStats["factors"][number];
export type DayReport = Out<AppRouterClient["stats"]["report"]>;
