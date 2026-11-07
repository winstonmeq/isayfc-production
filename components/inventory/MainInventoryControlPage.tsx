"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StockControlPage } from "./StockControlPage";
import { MainCustomerReturns } from "./MainCustomerReturns";
export function MainInventoryControlPage() {
  const [tab, setTab] = useState("adjustment");
  return <div><nav className="flex flex-wrap gap-2 px-6 pt-4"><Button variant={tab === "adjustment" ? "default" : "outline"} onClick={() => setTab("adjustment")}>Stock Corrections</Button><Button variant={tab === "return" ? "default" : "outline"} onClick={() => setTab("return")}>Customer Returns</Button><Button variant={tab === "review" ? "default" : "outline"} onClick={() => setTab("review")}>Return Reviews</Button></nav>{tab === "adjustment" ? <StockControlPage mode="adjustment" /> : <MainCustomerReturns key={tab} reviewMode={tab === "review"} />}</div>;
}
