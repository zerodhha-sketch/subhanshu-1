import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getTradeHistory } from "@/lib/trades";

/**
 * GET /api/trades/orders — user's trade history.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const trades = await getTradeHistory(user._id.toString(), limit);

    return NextResponse.json({
      orders: trades.map((t) => ({
        id: t._id?.toString(),
        symbol: t.symbol,
        exchange: t.exchange,
        side: t.side,
        qty: t.qty,
        price: t.price,
        orderType: t.orderType,
        status: t.status,
        productType: t.productType,
        totalValue: t.totalValue,
        pnl: t.pnl,
        optionType: t.optionType,
        strikePrice: t.strikePrice,
        expiry: t.expiry,
        createdAt: t.createdAt,
        executedAt: t.executedAt,
      })),
    });
  } catch (err: any) {
    console.error("[trades/orders]", err);
    return NextResponse.json(
      { message: err.message || "Failed to load orders" },
      { status: 500 },
    );
  }
}
