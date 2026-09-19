import type { AppRouterClient } from "@template/web";

type Out<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

export type Signal = Out<AppRouterClient["signals"]["list"]>[number];
export type Overview = Out<AppRouterClient["signals"]["overview"]>;
export type ScanRun = Out<AppRouterClient["signals"]["runs"]>[number];
export type Pair = Out<AppRouterClient["pairs"]["list"]>[number];
export type PairAnalysis = Out<AppRouterClient["pairs"]["analyze"]>;
export type Config = Out<AppRouterClient["config"]["get"]>;
