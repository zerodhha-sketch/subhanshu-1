import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getPositions } from "@/lib/trades";

/**
 * GET /api/trades/positions — user's open positions with live P&L.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const positions = await getPositions(user._id.toString());

    const totalInvested = positions.reduce((s, p) => s + p.investedValue, 0);
    const totalCurrent = positions.reduce((s, p) => s + p.currentValue, 0);
    const totalPnl = totalCurrent - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return NextResponse.json({
      positions: positions.map((p) => ({
        id: p._id?.toString(),
        symbol: p.symbol,
        exchange: p.exchange,
        side: p.side,
        qty: p.qty,
        avgPrice: p.avgPrice,
        ltp: p.ltp,
        pnl: p.pnl,
        pnlPct: p.pnlPct,
        currentValue: p.currentValue,
        investedValue: p.investedValue,
        productType: p.productType,
        optionType: p.optionType,
        strikePrice: p.strikePrice,
        expiry: p.expiry,
      })),
      summary: {
        totalInvested,
        totalCurrent,
        totalPnl,
        totalPnlPct,
        count: positions.length,
      },
    });
  } catch (err: any) {
    console.error("[trades/positions]", err);
    return NextResponse.json(
      { message: err.message || "Failed to load positions" },
      { status: 500 },
    );
  }
}
