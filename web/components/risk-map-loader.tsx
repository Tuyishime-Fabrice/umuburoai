"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { RiskMapProps } from "./risk-map";

const RiskMap = dynamic(() => import("./risk-map").then((m) => m.RiskMap), {
  ssr: false,
  loading: () => <Skeleton className="w-full" style={{ height: 460 }} />,
});

export function RiskMapLoader(props: RiskMapProps) {
  return <RiskMap {...props} />;
}
