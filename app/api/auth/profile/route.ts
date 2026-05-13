import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PATCH(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const fullName = (body?.fullName ?? "").toString().trim();
    const email = (body?.email ?? "").toString().trim();
    const phone = (body?.phone ?? "").toString().trim();

    if (!fullName || !email || !phone) {
      return NextResponse.json(
        { message: "Full name, email and phone are required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const users = db.collection("users");
    const userId = new ObjectId((user as { _id: ObjectId })._id);

    const existing = await users.findOne<{
      _id: ObjectId;
    }>({
      email,
      _id: { $ne: userId },
    });

    if (existing) {
      return NextResponse.json({ message: "Email already in use" }, { status: 400 });
    }

    await users.updateOne(
      { _id: userId },
      {
        $set: {
          fullName,
          email,
          phone,
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ message: "Failed to update profile" }, { status: 500 });
  }
}
